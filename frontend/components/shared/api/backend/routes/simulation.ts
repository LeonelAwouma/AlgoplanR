/**
 * Routes du contexte « Simulation », dont le choix du scénario retenu pour la
 * planification et les nominations.
 */

import type {
  ComparaisonScenarios,
  CorpsCreationScenario,
  EcoleNonCouverte,
  ExplicationProposition,
  NatureMouvement,
  ProposedAssignment,
  ProximityLevel,
  ResultatRecrutes,
  ScenarioCalcule,
  SimulationResult,
} from '../../contrat'
import { ApiError } from '../../erreurs'
import type { Acces } from '../acces'
import { versJeu, type JeuDjango } from '../conversions/donnees'
import { versBreakdown, type DetailDjango } from '../conversions/enseignants'
import { versConfigDjango } from '../conversions/parametres'
import { normaliser, texte } from '../conversions/referentiel'
import {
  libellePhase,
  reglesDePortee,
  versCombinaisons,
  versInvariants,
  versJournal,
  versPool,
  versPreset,
  versProjections,
  versProposition,
  versScenarioCalcule,
  versVivier,
  type CombinaisonDjango,
  type ControleDjango,
  type JournalDjango,
  type ProjectionDjango,
  type ScenarioDjango,
  type SyntheseDjango,
} from '../conversions/simulation'
import { booleen, paginer, valeur } from '../liste'
import { calculerFlux, restreindreResultat, sensDuMouvement } from '../moteur/filtre'
import { reductionDuDeficit } from '../moteur/narration'
import * as source from '../sources'
import type { Conversion } from '../types'
import type { RecrueDjango } from './recrutement'

const S = 'jeux/{jeu}/scenarios/{scenario}'
const NIVEAUX: ProximityLevel[] = ['meme_commune', 'meme_iaeb', 'meme_departement', 'meme_region', 'hors_region']
/** Ordre d'affichage : les trois modèles géographiques, du plus proche au plus étendu. */
const ORDRE_GEOGRAPHIQUE = ['geo_iaeb', 'geo_departement', 'geo_region']

/** Propositions d'un scénario, sans charger tout le résultat. */
function propositions(acces: Acces, jeu: string, scenario: string): Promise<ProposedAssignment[]> {
  return acces.memo(jeu, `scenario:${scenario}:propositions`, async a => {
    const [aff, viv, ecoles] = await Promise.all([
      source.affectations(a, jeu, scenario),
      source.vivier(a, jeu, scenario),
      source.diagnosticsParId(a, jeu),
    ])
    const parMatricule = new Map(viv.map(t => [t.Matricule_Enseignant, t]))
    return aff.map(x => versProposition(x, parMatricule.get(x.id_ens), ecoles))
  })
}

/** Scénario et indicateurs nationaux, lus sans charger les postes non pourvus. */
async function scenarioCalcule(acces: Acces, jeu: string, s: ScenarioDjango): Promise<ScenarioCalcule> {
  const defaut = await source.parametres(acces, jeu)
  if (!s.calcule_le) return versScenarioCalcule(s, defaut, null)
  const id = String(s.id)
  const [synthese, props, controles] = await Promise.all([
    acces.lire<{ synthese: SyntheseDjango }>(`jeux/${jeu}/scenarios/${id}/resultat/`),
    propositions(acces, jeu, id),
    acces.lire<{ controles: ControleDjango[] }>(`jeux/${jeu}/scenarios/${id}/invariants/`),
  ])
  const syn = synthese.synthese
  const besoinInitial = syn.affectes + syn.postes_non_pourvus
  const compteur = new Map<ProximityLevel, number>()
  for (const a of props) compteur.set(a.niveauProximite, (compteur.get(a.niveauProximite) ?? 0) + 1)
  const calcule = versScenarioCalcule(s, defaut, null)
  return {
    ...calcule,
    indicateurs: {
      besoinInitial,
      postesCouverts: syn.affectes,
      besoinResiduel: syn.postes_non_pourvus,
      tauxCouverture: besoinInitial > 0 ? syn.affectes / besoinInitial : 0,
      enseignantsDeplaces: syn.affectes,
      mouvementsParPerimetre: NIVEAUX.map(niveau => ({ niveau, nombre: compteur.get(niveau) ?? 0 })).filter(
        m => m.nombre > 0,
      ),
      controlesEnEcart: versInvariants(controles.controles).filter(c => !c.ok).length,
    },
  }
}

/** Identifiants des écoles de la sélection de la requête, `null` au national. */
async function perimetre(
  acces: Acces,
  jeu: string,
  query: Parameters<Conversion>[0]['query'],
): Promise<Set<string> | null> {
  const selection = source.selectionDepuis(query)
  if (!selection.region && !selection.departement && !selection.commune) return null
  return source.ecolesDeLaSelection(acces, jeu, selection)
}

/** Résultat restreint à la sélection de la requête. */
async function resultatDuPerimetre(
  acces: Acces,
  jeu: string,
  scenario: string,
  query: Parameters<Conversion>[0]['query'],
): Promise<SimulationResult> {
  const [resultat, ids] = await Promise.all([source.resultat(acces, jeu, scenario), perimetre(acces, jeu, query)])
  return ids ? restreindreResultat(resultat, ids) : resultat
}

function correspond(a: ProposedAssignment, q: string): boolean {
  return [a.teacherId, a.nomEns, a.prenomEns, a.nomEtabOrigine, a.nomEtabDestination, a.schoolDestinationId].some(c =>
    normaliser(c).includes(q),
  )
}

export const conversionsSimulation: Record<string, Conversion> = {
  'GET scenarios/presets/': async (_, acces) => {
    const r = await acces.lire<{ presets: Parameters<typeof versPreset>[0][] }>('scenarios/presets/')
    return r.presets.map(versPreset)
  },

  'GET jeux/{jeu}/scenarios/': async (_, acces, p) => {
    const liste = await source.scenariosDjango(acces, p.jeu)
    return Promise.all(liste.map(s => scenarioCalcule(acces, p.jeu, s)))
  },

  'POST jeux/{jeu}/scenarios/': async (r, acces, p) => {
    const c = r.corps as CorpsCreationScenario
    let corps: Record<string, unknown>
    if (c.personnalise) {
      const config = versConfigDjango(c.personnalise.parametres)
      corps = {
        nom: c.personnalise.nom,
        description: c.personnalise.description ?? '',
        parametres: { ...config, regles_dreb: { ...config.regles_dreb, ...reglesDePortee(c.personnalise.scope) } },
      }
    } else {
      corps = { code: c.preset }
    }
    const s = await acces.ecrire<ScenarioDjango>('POST', `jeux/${p.jeu}/scenarios/`, corps)
    return scenarioCalcule(acces, p.jeu, s)
  },

  'POST jeux/{jeu}/scenarios/base/': async (_, acces, p) => {
    const liste = await acces.ecrire<ScenarioDjango[]>('POST', `jeux/${p.jeu}/scenarios/base/`)
    return Promise.all(liste.map(s => scenarioCalcule(acces, p.jeu, s)))
  },

  [`GET ${S}/`]: async (_, acces, p) =>
    scenarioCalcule(acces, p.jeu, await acces.lire<ScenarioDjango>(`jeux/${p.jeu}/scenarios/${p.scenario}/`)),

  [`POST ${S}/executer/`]: async (_, acces, p) =>
    scenarioCalcule(
      acces,
      p.jeu,
      await acces.ecrire<ScenarioDjango>('POST', `jeux/${p.jeu}/scenarios/${p.scenario}/executer/`),
    ),

  [`GET ${S}/resultat/`]: async (r, acces, p) => resultatDuPerimetre(acces, p.jeu, p.scenario, r.query),

  [`GET ${S}/affectations/`]: async (r, acces, p) => {
    let liste = await propositions(acces, p.jeu, p.scenario)
    const ids = await perimetre(acces, p.jeu, r.query)
    if (ids) liste = liste.filter(a => sensDuMouvement(a, ids) !== null)
    const nature = valeur(r.query.nature) as NatureMouvement | undefined
    if (nature) liste = liste.filter(a => a.nature === nature)
    const ecole = valeur(r.query.ecole)
    if (ecole) liste = liste.filter(a => a.schoolOrigineId === ecole || a.schoolDestinationId === ecole)
    const q = normaliser(valeur(r.query.q))
    if (q) liste = liste.filter(a => correspond(a, q))
    return paginer(liste, r.query, { nom: a => a.nomEns })
  },

  [`GET ${S}/affectations/{matricule}/explication/`]: async (_, acces, p): Promise<ExplicationProposition> => {
    const [e, props] = await Promise.all([
      acces.lire<{
        phase: string
        explication: string
        motif: string
        bareme: DetailDjango
        score: DetailDjango
        alternatives_vacantes: { id_poste: string; id_etab: string; score: number }[]
      }>(`jeux/${p.jeu}/scenarios/${p.scenario}/affectations/${encodeURIComponent(p.matricule)}/explication/`),
      propositions(acces, p.jeu, p.scenario),
    ])
    const proposition = props.find(a => a.teacherId === p.matricule)
    if (!proposition) throw new ApiError(404, 'introuvable', `Aucune proposition pour ${p.matricule} dans ce scénario.`)
    const score = versBreakdown(e.score)
    const bareme = versBreakdown(e.bareme)
    const lignes = [
      e.explication,
      ...(e.motif ? [`Motif : ${e.motif}.`] : []),
      `Barème individuel : ${bareme.total.toFixed(2)} (${bareme.components.map(c => `${c.label} ${c.contribution.toFixed(2)}`).join(' ; ')}).`,
      `Score d'appariement : ${score.total.toFixed(2)} (${score.components.map(c => `${c.label} ${c.contribution.toFixed(2)}`).join(' ; ')}).`,
      ...e.alternatives_vacantes.map(
        alt => `Poste encore vacant : ${alt.id_etab} (${alt.id_poste}), score ${alt.score.toFixed(2)}.`,
      ),
    ]
    return {
      titre: `${libellePhase(e.phase)} : ${proposition.nomEns} ${proposition.prenomEns} vers ${proposition.nomEtabDestination}`,
      lignes,
      proposition: { ...proposition, breakdown: score },
    }
  },

  [`GET ${S}/non-affectes/`]: async (r, acces, p) => {
    const [viv, ecoles] = await Promise.all([
      source.vivier(acces, p.jeu, p.scenario),
      source.diagnosticsParId(acces, p.jeu),
    ])
    return paginer(
      versPool(viv, ecoles).filter(t => !t.affecte),
      r.query,
      { nom: t => t.teacher.nom },
    )
  },

  [`GET ${S}/vivier/`]: async (_, acces, p) => {
    const [viv, ecoles] = await Promise.all([
      source.vivier(acces, p.jeu, p.scenario),
      source.diagnosticsParId(acces, p.jeu),
    ])
    return versVivier(versPool(viv, ecoles), ecoles)
  },

  [`GET ${S}/postes/`]: async (r, acces, p) => {
    let postes = (await source.resultat(acces, p.jeu, p.scenario)).postes
    const pourvu = booleen(r.query.pourvu)
    if (pourvu !== undefined) postes = postes.filter(x => x.pourvu === pourvu)
    const ecole = valeur(r.query.ecole)
    if (ecole) postes = postes.filter(x => x.schoolId === ecole)
    return paginer(postes, r.query, { indice: x => x.priorite.indice })
  },

  [`GET ${S}/postes-non-couverts/`]: async (_, acces, p): Promise<EcoleNonCouverte[]> => {
    const [resultat, combinaisons, ecoles, viv] = await Promise.all([
      source.resultat(acces, p.jeu, p.scenario),
      acces.toutes<CombinaisonDjango>(`jeux/${p.jeu}/scenarios/${p.scenario}/combinaisons/`),
      source.diagnosticsParId(acces, p.jeu),
      source.vivier(acces, p.jeu, p.scenario),
    ])
    const options = versCombinaisons(combinaisons.lignes, new Map(viv.map(t => [t.Matricule_Enseignant, t])), ecoles)
    const parEcole = new Map<string, EcoleNonCouverte>()
    for (const poste of resultat.uncoveredPosts) {
      const e = parEcole.get(poste.schoolId) ?? {
        schoolId: poste.schoolId,
        nom: poste.nomEtab,
        commune: poste.commune,
        sousSysteme: poste.sousSysteme,
        indice: poste.priorite.indice,
        postes: 0,
        zoneSecurite: poste.priorite.zoneSecurite,
        zoneRouge: poste.priorite.zoneRouge,
        combinaisons: options.filter(o => o.schoolId === poste.schoolId),
      }
      e.postes++
      parEcole.set(poste.schoolId, e)
    }
    return [...parEcole.values()].sort((a, b) => b.indice - a.indice || b.postes - a.postes)
  },

  [`GET ${S}/candidatures/`]: async (r, acces, p) => {
    let liste = (await source.resultat(acces, p.jeu, p.scenario)).candidatures
    const issue = valeur(r.query.issue)
    if (issue) liste = liste.filter(c => c.issue === issue)
    const q = normaliser(valeur(r.query.q))
    if (q)
      liste = liste.filter(c => [c.teacher.id, c.teacher.nom, c.teacher.prenom].some(v => normaliser(v).includes(q)))
    return paginer(liste, r.query)
  },

  [`GET ${S}/combinaisons/`]: async (_, acces, p) => {
    const [combinaisons, ecoles, viv] = await Promise.all([
      acces.toutes<CombinaisonDjango>(`jeux/${p.jeu}/scenarios/${p.scenario}/combinaisons/`),
      source.diagnosticsParId(acces, p.jeu),
      source.vivier(acces, p.jeu, p.scenario),
    ])
    return versCombinaisons(combinaisons.lignes, new Map(viv.map(t => [t.Matricule_Enseignant, t])), ecoles)
  },

  [`GET ${S}/journal/`]: async (_, acces, p) => {
    const [s, journal] = await Promise.all([
      acces.lire<ScenarioDjango>(`jeux/${p.jeu}/scenarios/${p.scenario}/`),
      acces.toutes<JournalDjango>(`jeux/${p.jeu}/scenarios/${p.scenario}/journal/`),
    ])
    return versJournal(journal.lignes, s.calcule_le)
  },

  [`GET ${S}/invariants/`]: async (_, acces, p) =>
    versInvariants(
      (await acces.lire<{ controles: ControleDjango[] }>(`jeux/${p.jeu}/scenarios/${p.scenario}/invariants/`))
        .controles,
    ),

  [`GET ${S}/projections/`]: async (_, acces, p) => {
    const [lignes, ecoles, resultat, settings] = await Promise.all([
      acces.toutes<ProjectionDjango>(`jeux/${p.jeu}/scenarios/${p.scenario}/projections/`),
      source.diagnosticsParId(acces, p.jeu),
      source.resultat(acces, p.jeu, p.scenario),
      source.parametres(acces, p.jeu),
    ])
    return versProjections(lignes.lignes, ecoles, resultat, settings)
  },

  [`GET ${S}/recrutes/`]: async (_, acces, p): Promise<ResultatRecrutes | null> => {
    const [recrues, r, ecoles] = await Promise.all([
      acces.lire<RecrueDjango[]>(`jeux/${p.jeu}/recrues/`),
      acces.lire<{
        deploiements: {
          id_recrue: string
          nom: string
          prenom: string
          id_etab: string
          region: string
          commune: string
        }[]
        recrues_sans_poste: string[]
        postes_restants: number
      }>(`jeux/${p.jeu}/scenarios/${p.scenario}/recrutes/`),
      source.diagnosticsParId(acces, p.jeu),
    ])
    if (recrues.length === 0) return null
    const parId = new Map(recrues.map(x => [x.id_recrue, x]))
    return {
      affectations: r.deploiements.map(d => {
        const recrue = parId.get(d.id_recrue)
        const choix =
          normaliser(recrue?.region_souhaitee) !== '' && normaliser(recrue?.region_souhaitee) === normaliser(d.region)
        return {
          recrueId: d.id_recrue,
          nom: `${texte(d.nom)} ${texte(d.prenom)}`.trim() || d.id_recrue,
          note: recrue?.rang ?? 0,
          schoolId: d.id_etab,
          nomEtab: ecoles.get(d.id_etab)?.school.nom ?? d.id_etab,
          commune: texte(d.commune),
          issue: choix ? ('choix' as const) : ('region' as const),
          rangChoix: choix ? 1 : null,
        }
      }),
      vivierNational: r.recrues_sans_poste.map(id => {
        const recrue = parId.get(id)
        return {
          recrueId: id,
          nom: recrue ? `${recrue.nom} ${recrue.prenom}`.trim() : id,
          note: recrue?.rang ?? 0,
          motif: 'Aucun poste vacant compatible avec son sous-système.',
        }
      }),
      postesRestants: r.postes_restants,
    }
  },

  [`GET ${S}/flux/`]: async (r, acces, p) => {
    const [resultat, ids] = await Promise.all([
      source.resultat(acces, p.jeu, p.scenario),
      perimetre(acces, p.jeu, r.query),
    ])
    const ecoles = ids ?? new Set((await source.diagnostics(acces, p.jeu)).map(d => d.school.id))
    return calculerFlux(resultat, ecoles)
  },

  'GET jeux/{jeu}/comparaison/': async (r, acces, p): Promise<ComparaisonScenarios> => {
    const liste = (await source.scenariosDjango(acces, p.jeu)).filter(s => s.calcule_le)
    const rang = (s: ScenarioDjango) => {
      const i = ORDRE_GEOGRAPHIQUE.indexOf(s.code)
      return i === -1 ? ORDRE_GEOGRAPHIQUE.length : i
    }
    const tries = [...liste].sort((a, b) => rang(a) - rang(b) || a.id - b.id)
    const resultats = await Promise.all(tries.map(s => resultatDuPerimetre(acces, p.jeu, String(s.id), r.query)))
    return { resultats, reductions: resultats.map(reductionDuDeficit) }
  },

  'PUT jeux/{jeu}/scenario-retenu/': async (r, acces, p) =>
    versJeu(await acces.ecrire<JeuDjango>('PUT', `jeux/${p.jeu}/scenario-retenu/`, r.corps)),
}
