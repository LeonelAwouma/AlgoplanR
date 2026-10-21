/**
 * Données factices — scénarios (liste, création, scénario retenu) et
 * planification (hypothèses, recalcul et versions, quotas).
 *
 * Seuls les trois scénarios géographiques ont un résultat : un scénario créé
 * reste « à calculer ». Un recalcul de la planification crée une nouvelle
 * version, avec les chiffres de la version d'origine.
 */

import { http } from 'msw'

import type {
  AnneePlan,
  ComparaisonVersions,
  CorpsAjustementQuota,
  CorpsCreationScenario,
  CorpsHypotheses,
  CorpsScenarioRetenu,
  CorpsValidationQuotas,
  DetailVersionPlanification,
  IndicateursAnnee,
  PresetScenario,
  ScenarioCalcule,
  TableauPlanification,
  VentilationSousSystemes,
  VentilationTerritoriale,
} from '../../components/shared/api'

import { auditer, etat, maintenant, nouvelId } from '../etat'
import { conflit, introuvable, nonSimule, ok, refus, sansContenu } from '../reponses'
import { appliquerSuivi, type PerimetreSuivi } from '../suivi-planification'
import { api, corps, jeuConnu, lireCatalogue, parametre, reponseCatalogue } from './outils'

/** Scénarios du jeu : la liste modifiée, sinon celle du catalogue. */
async function scenarios(jeu: string): Promise<ScenarioCalcule[]> {
  const e = etat()
  e.scenarios ??= (await lireCatalogue<ScenarioCalcule[]>(`jeux/${jeu}/scenarios/`)) ?? []
  return e.scenarios
}

/** Reporte les décisions courantes (quotas, nominations, mouvements) sur une projection. */
function suivre(annees: IndicateursAnnee[], perimetre: PerimetreSuivi): IndicateursAnnee[] {
  const e = etat()
  return appliquerSuivi(annees, perimetre, {
    quotas: e.quotas,
    nominations: e.nominations,
    mouvements: e.mouvements,
    ecoles: e.ecoles,
    recrutementsSupposes: e.hypotheses.quotas.anneesPrecedentesRealisees,
  })
}

/** Périmètre d'une requête de planification. */
function perimetreDe(q: URLSearchParams): PerimetreSuivi {
  return {
    region: q.get('region'),
    departement: q.get('departement'),
    commune: q.get('commune'),
    sousSysteme: q.get('sousSysteme') as PerimetreSuivi['sousSysteme'],
  }
}

/** La planification ne reflète plus les décisions : un recalcul est attendu. */
function planificationObsolete(declencheur: string) {
  const e = etat()
  e.etatPlanification = { ...e.etatPlanification, obsolete: true, declencheur }
}

export const gestionnairesPlanification = [
  // --- Scénarios -----------------------------------------------------------------------
  http.get(api('jeux/:jeu/scenarios/'), async ({ params }) =>
    jeuConnu(params.jeu) ? ok(await scenarios(parametre(params.jeu))) : introuvable(),
  ),
  http.post(api('jeux/:jeu/scenarios/base/'), async ({ params }) =>
    jeuConnu(params.jeu) ? ok((await scenarios(parametre(params.jeu))).filter(s => s.calcule)) : introuvable(),
  ),
  http.post(api('jeux/:jeu/scenarios/'), async ({ params, request }) => {
    const jeu = parametre(params.jeu)
    if (!jeuConnu(jeu)) return introuvable()
    const demande = await corps<CorpsCreationScenario>(request)
    let description: Pick<PresetScenario, 'nom' | 'description' | 'scope'>
    if (demande.preset !== undefined) {
      const presets = (await lireCatalogue<PresetScenario[]>('scenarios/presets/')) ?? []
      const preset = presets.find(p => p.cle === demande.preset)
      if (!preset) return refus('Modèle de scénario inconnu.')
      if (!preset.disponible) return refus(preset.motif)
      description = preset
    } else {
      description = { description: '', ...demande.personnalise }
    }
    const cree: ScenarioCalcule = {
      scenario: {
        id: nouvelId('scenario'),
        nom: description.nom,
        description: description.description,
        scope: description.scope,
        settings: etat().parametres,
        createdAt: maintenant(),
        predefini: false,
      },
      calcule: false,
      obsolete: false,
      calculeLe: null,
      indicateurs: null,
    }
    ;(await scenarios(jeu)).push(cree)
    return ok(cree, false, 201)
  }),
  http.get(api('jeux/:jeu/scenarios/:scenario/'), async ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const trouve = (await scenarios(parametre(params.jeu))).find(s => s.scenario.id === params.scenario)
    return trouve ? ok(trouve) : introuvable('Ce scénario n’existe pas.')
  }),
  http.delete(api('jeux/:jeu/scenarios/:scenario/'), async ({ params }) => {
    const jeu = parametre(params.jeu)
    if (!jeuConnu(jeu)) return introuvable()
    const liste = await scenarios(jeu)
    const trouve = liste.find(s => s.scenario.id === params.scenario)
    if (!trouve) return introuvable('Ce scénario n’existe pas.')
    if (trouve.scenario.predefini) return refus('Les trois scénarios géographiques de base ne se suppriment pas.')
    etat().scenarios = liste.filter(s => s !== trouve)
    return sansContenu()
  }),
  http.post(api('jeux/:jeu/scenarios/:scenario/executer/'), async ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const trouve = (await scenarios(parametre(params.jeu))).find(s => s.scenario.id === params.scenario)
    if (!trouve) return introuvable('Ce scénario n’existe pas.')
    return trouve.calcule ? ok(trouve) : nonSimule('Le calcul d’un nouveau scénario')
  }),
  http.put(api('jeux/:jeu/scenario-retenu/'), async ({ params, request }) => {
    const jeu = parametre(params.jeu)
    if (!jeuConnu(jeu)) return introuvable()
    const { scenario } = await corps<CorpsScenarioRetenu>(request)
    const trouve = (await scenarios(jeu)).find(s => s.scenario.id === scenario)
    if (!trouve?.calcule) return refus('Seul un scénario calculé peut être retenu pour la planification.')
    const e = etat()
    const avant = e.jeu.scenarioRetenuId
    e.jeu = { ...e.jeu, scenarioRetenuId: scenario }
    e.etatPlanification = { ...e.etatPlanification, scenarioRetenuId: scenario }
    planificationObsolete('Changement du scénario retenu')
    auditer(
      'scenario_retenu',
      'retenu',
      `Scénario retenu : ${trouve.scenario.nom}`,
      null,
      {
        type: 'scenario',
        id: scenario,
      },
      { scenario: avant },
      { scenario },
    )
    return ok(e.jeu)
  }),

  // --- Hypothèses -------------------------------------------------------------------------
  http.get(api('jeux/:jeu/hypotheses/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok(etat().hypotheses) : introuvable(),
  ),
  http.put(api('jeux/:jeu/hypotheses/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const { auteur, motif, ...hypotheses } = await corps<CorpsHypotheses>(request)
    if (!motif.trim()) return refus('Toute modification des hypothèses doit être motivée.')
    const e = etat()
    const avant = e.hypotheses
    const version = avant.version + 1
    const le = maintenant()
    e.hypotheses = { ...hypotheses, version, modifieesLe: le, modifieesPar: auteur }
    e.historiqueHypotheses.push({ version, modifieesLe: le, modifieesPar: auteur, motif, hypotheses: e.hypotheses })
    planificationObsolete('Modification des hypothèses')
    auditer(
      'hypotheses',
      'modification',
      `Hypothèses, version ${version} : ${motif}`,
      auteur,
      {
        type: 'hypotheses',
        id: String(version),
      },
      avant,
      e.hypotheses,
    )
    return ok(e.hypotheses)
  }),
  http.get(api('jeux/:jeu/hypotheses/historique/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok([...etat().historiqueHypotheses].reverse()) : introuvable(),
  ),
  http.post(api('jeux/:jeu/hypotheses/attrition/estimer/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok(etat().estimationAttrition) : introuvable(),
  ),

  // --- État, recalcul et versions ------------------------------------------------------------
  // Le degré d'aléa est une régression sur les écoles : les données factices ne l'inventent pas.
  http.get(api('jeux/:jeu/planification/alea/'), () => nonSimule('Le calcul du degré d’aléa')),
  http.get(api('jeux/:jeu/planification/etat/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok(etat().etatPlanification) : introuvable(),
  ),
  http.post(api('jeux/:jeu/planification/recalculer/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const e = etat()
    const version = e.etatPlanification.version + 1
    const calculeLe = maintenant()
    const declencheur = e.etatPlanification.declencheur ?? 'Recalcul demandé'
    e.etatPlanification = { ...e.etatPlanification, version, calculeLe, declencheur, obsolete: false }
    e.versionsPlanification.push({ version, calculeLe, declencheur, auteur: null })
    auditer('recalcul', `version ${version}`, `Recalcul de la planification (version ${version})`, null)
    return ok(e.etatPlanification)
  }),
  http.get(api('jeux/:jeu/planification/versions/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok([...etat().versionsPlanification].reverse()) : introuvable(),
  ),
  http.get(api('jeux/:jeu/planification/versions/comparer/'), ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const url = new URL(request.url)
    const versions = etat().versionsPlanification
    const de = versions.find(v => String(v.version) === url.searchParams.get('de'))
    const a = versions.find(v => String(v.version) === url.searchParams.get('a'))
    if (!de || !a) return introuvable('Version inconnue.')
    // Toutes les versions factices portent les mêmes chiffres : aucun écart.
    const comparaison: ComparaisonVersions = { de, a, ecarts: [] }
    return ok(comparaison, true)
  }),
  http.get(api('jeux/:jeu/planification/versions/:version/'), async ({ params }) => {
    const jeu = parametre(params.jeu)
    if (!jeuConnu(jeu)) return introuvable()
    const version = etat().versionsPlanification.find(v => String(v.version) === params.version)
    const origine = await lireCatalogue<DetailVersionPlanification>(`jeux/${jeu}/planification/versions/1/`)
    if (!version || !origine) return introuvable('Version inconnue.')
    const detail: DetailVersionPlanification = {
      version,
      tableau: {
        ...origine.tableau,
        version: version.version,
        calculeLe: version.calculeLe,
        annees: suivre(origine.tableau.annees, {}),
      },
    }
    return ok(detail, version.version !== 1)
  }),

  // --- Tableau et ventilations : projection du catalogue, puis suivi des décisions ---------------
  http.get(api('jeux/:jeu/planification/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const url = new URL(request.url)
    const trouve = await reponseCatalogue<TableauPlanification>(url)
    if (!trouve) return introuvable()
    const etatCourant = etat().etatPlanification
    const tableau: TableauPlanification = {
      ...trouve.reponse,
      version: etatCourant.version,
      calculeLe: etatCourant.calculeLe ?? trouve.reponse.calculeLe,
      annees: suivre(trouve.reponse.annees, perimetreDe(url.searchParams)),
    }
    return ok(tableau, trouve.approximation)
  }),
  http.get(api('jeux/:jeu/planification/territoires/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const url = new URL(request.url)
    const trouve = await reponseCatalogue<VentilationTerritoriale>(url)
    if (!trouve) return introuvable()
    const sousSysteme = perimetreDe(url.searchParams).sousSysteme
    const ventilation: VentilationTerritoriale = {
      ...trouve.reponse,
      lignes: trouve.reponse.lignes.map(l => ({
        ...l,
        annees: suivre(l.annees, { ...l.territoire, sousSysteme }),
      })),
    }
    return ok(ventilation, trouve.approximation)
  }),
  http.get(api('jeux/:jeu/planification/sous-systemes/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const url = new URL(request.url)
    const trouve = await reponseCatalogue<VentilationSousSystemes>(url)
    if (!trouve) return introuvable()
    const perimetre = perimetreDe(url.searchParams)
    const ventilation: VentilationSousSystemes = {
      lignes: trouve.reponse.lignes.map(l => ({
        ...l,
        annees: suivre(l.annees, { ...perimetre, sousSysteme: l.sousSysteme }),
      })),
    }
    return ok(ventilation, trouve.approximation)
  }),

  // --- Quotas ---------------------------------------------------------------------------------
  http.get(api('jeux/:jeu/quotas/'), ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const q = new URL(request.url).searchParams
    const annee = q.get('annee')
    const region = q.get('region')
    const sousSysteme = q.get('sousSysteme')
    return ok(
      etat().quotas.filter(
        quota =>
          (!annee || quota.annee === annee) &&
          (!region || quota.territoire === region) &&
          (!sousSysteme || quota.sousSysteme === sousSysteme),
      ),
    )
  }),
  http.put(api('jeux/:jeu/quotas/:annee/:territoire/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const saisie = await corps<CorpsAjustementQuota>(request)
    const e = etat()
    const quota = e.quotas.find(
      q => q.annee === params.annee && q.codeTerritoire === params.territoire && q.sousSysteme === saisie.sousSysteme,
    )
    if (!quota) return introuvable('Ce quota n’existe pas.')
    if (quota.statut === 'valide') return conflit('Ce quota est validé : il ne peut plus être ajusté.')
    if (saisie.retenu < 0) return refus('Un quota ne peut pas être négatif.')
    if (saisie.retenu !== quota.calcule && !saisie.motif.trim()) return refus('Un ajustement doit être motivé.')
    const avant = { ...quota }
    Object.assign(quota, {
      retenu: saisie.retenu,
      motifAjustement: saisie.motif,
      statut: 'ajuste',
      ajustePar: saisie.auteur,
    })
    e.historiqueQuotas.push({
      annee: quota.annee,
      codeTerritoire: quota.codeTerritoire,
      evenement: 'ajustement',
      valeur: saisie.retenu,
      motif: saisie.motif,
      auteur: saisie.auteur,
      le: maintenant(),
    })
    auditer(
      'quota',
      'ajustement',
      `Quota ${quota.annee} ${quota.territoire} : ${avant.retenu} → ${saisie.retenu}`,
      saisie.auteur,
      {
        type: 'quota',
        id: `${quota.annee}:${quota.codeTerritoire}:${quota.sousSysteme}`,
      },
      avant,
      { ...quota },
    )
    return ok(quota)
  }),
  http.post(api('jeux/:jeu/quotas/valider/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const { annee, auteur } = await corps<CorpsValidationQuotas>(request)
    const e = etat()
    const valideLe = maintenant()
    const quotas = e.quotas.filter(q => q.annee === annee)
    for (const quota of quotas) {
      if (quota.statut === 'valide') continue
      Object.assign(quota, { statut: 'valide', valideLe })
      e.historiqueQuotas.push({
        annee,
        codeTerritoire: quota.codeTerritoire,
        evenement: 'validation',
        valeur: quota.retenu,
        motif: null,
        auteur,
        le: valideLe,
      })
    }
    auditer('quota', 'validation', `Validation des quotas de ${annee}`, auteur, { type: 'quotas', id: annee })
    return ok(quotas)
  }),
  http.get(api('jeux/:jeu/quotas/historique/'), ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const annee = new URL(request.url).searchParams.get('annee') as AnneePlan | null
    return ok([...etat().historiqueQuotas].filter(h => !annee || h.annee === annee).reverse())
  }),
]
