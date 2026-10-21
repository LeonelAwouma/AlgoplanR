/**
 * Routes de la planification sur cinq ans : hypothèses versionnées, tableau,
 * ventilations, départs, fiabilité, versions, quotas et indicateurs de suivi.
 *
 * Le serveur applique les formules du moteur DRH (codeSource) aux données du jeu
 * et sert les mêmes structures que le contrat, en snake_case. Ses hypothèses
 * portent en plus les arbitrages du rapport DRH (bloc `drh`), que l'interface ne
 * modifie pas : le serveur les conserve quand le corps ne les contient pas.
 */

import type {
  AnneePlan,
  ComparaisonVersions,
  CorpsAjustementQuota,
  CorpsHypotheses,
  CorpsValidationQuotas,
  DetailVersionPlanification,
  DocumentationHypotheses,
  EducationTerritory,
  DegreAlea,
  EstimationAttrition,
  EtatPlanification,
  EvenementQuota,
  EvolutionIndicateurs,
  FiabiliteDonnees,
  FiabiliteIndicateur,
  Hypotheses,
  IndicateursAnnee,
  IndicateursSuivi,
  LigneFiabilite,
  LignePlanificationEcole,
  ListesRapportPrevisionnel,
  PlanDeparts,
  QuotaRecrutement,
  RapportPrevisionnel,
  SousSysteme,
  TableauPlanification,
  VentilationSousSystemes,
  VentilationTerritoriale,
  VersionHypotheses,
  VersionPlanification,
} from '../../contrat'
import type { ParametresRequete } from '../../client'
import type { Acces } from '../acces'
import { paginer } from '../liste'
import type { Conversion } from '../types'

type CleSousSysteme = SousSysteme | 'non_renseigne'

/** `departs_retraite` → `departsRetraite`. */
export function camel(cle: string): string {
  return cle.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** Clés d'un objet du serveur passées en camelCase, à toute profondeur (les valeurs sont gardées telles quelles). */
export function camelProfond<T>(valeur: unknown): T {
  if (Array.isArray(valeur)) return valeur.map(v => camelProfond(v)) as T
  if (valeur !== null && typeof valeur === 'object')
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [camel(k), camelProfond(v)])) as T
  return valeur as T
}

/** Paramètres du contrat → paramètres du serveur (`sousSysteme` → `sous_systeme`), sans pagination. */
export function queryServeur(query: ParametresRequete): ParametresRequete {
  const { sousSysteme, page: _page, taille: _taille, tri: _tri, ...reste } = query
  return sousSysteme === undefined ? reste : { ...reste, sous_systeme: sousSysteme }
}

// --- Formats du serveur --------------------------------------------------------------------------------------

interface AnneeDjango {
  annee: AnneePlan
  effectif_debut: number
  departs_retraite: number
  departs_attrition: number
  besoin: number
  ressources_vivier: number
  quota_calcule: number
  quota_retenu: number | null
  nominations_prevues: number
  nominations_realisees: number
  deploiements_prevus: number
  deploiements_realises: number
  besoin_restant: number
  directeurs_decharges?: number
  recrutement?: number
  effectif_fin?: number
  taux_attrition?: number
  eleves?: number
  rem?: number | null
  rem_raison?: string | null
}

interface TableauDjango {
  perimetre: string
  niveau: TableauPlanification['niveau']
  sous_systeme: SousSysteme | null
  scenario_id: string | null
  version: number
  calcule_le: string | null
  annees: AnneeDjango[]
  fiabilite: { indicateur: string; niveau: FiabiliteIndicateur['niveau']; detail: string }[]
}

interface TerritoireDjango {
  code: string
  niveau: string
  nom: string
  region: string | null
  departement: string | null
  commune: string | null
  code_parent: string | null
}

interface LigneFiabiliteDjango {
  territoire: string
  ecoles: number
  enseignants: number
  taux_date_naissance: number
  taux_sous_systeme: number
  taux_effectifs_eleves: number
}

interface HypothesesDjango {
  horizon: number
  retraite: {
    source: string
    justification: string
    age_legal: number
    date_reference: Hypotheses['retraite']['dateReference']
    exceptions: { critere: 'statut' | 'categorie'; valeur: string; age_legal: number }[]
  }
  attrition: {
    source: string
    justification: string
    methode: Hypotheses['attrition']['methode']
    taux_unique: number
    par_sous_systeme: Partial<Record<SousSysteme, number>>
    par_region: Record<string, number>
    niveau_arrondi: Hypotheses['attrition']['niveauArrondi']
  }
  quotas: { source: string; justification: string; annees_precedentes_realisees: boolean }
  vivier: { source: string; justification: string; sources: Hypotheses['vivier']['sources'] }
  version: number
  modifiees_le: string | null
  modifiees_par: string | null
  reference_attrition?: {
    modele: string
    formule: string
    perimetre: string
    attrition_totale_pct: number
    intervalle_confiance_points: number
    retraites_pct: number
    autres_departs_pct: number
    fenetre_donnees: string
    nombre_regions: number
    nombre_transitions_annuelles: number
    source: string
  } | null
}

interface VersionDjango {
  version: number
  calcule_le: string
  declencheur: string
  auteur: string | null
}

interface QuotaDjango {
  annee: AnneePlan
  code_territoire: string
  territoire: string
  sous_systeme: CleSousSysteme
  calcule: number
  retenu: number
  motif_ajustement: string | null
  statut: QuotaRecrutement['statut']
  ajuste_par: string | null
  valide_le: string | null
}

// --- Conversions -------------------------------------------------------------------------------------------

export function versAnnee(a: AnneeDjango): IndicateursAnnee {
  return {
    annee: a.annee,
    effectifDebut: a.effectif_debut,
    departsRetraite: a.departs_retraite,
    departsAttrition: a.departs_attrition,
    besoin: a.besoin,
    ressourcesVivier: a.ressources_vivier,
    quotaCalcule: a.quota_calcule,
    quotaRetenu: a.quota_retenu,
    nominationsPrevues: a.nominations_prevues,
    nominationsRealisees: a.nominations_realisees,
    deploiementsPrevus: a.deploiements_prevus,
    deploiementsRealises: a.deploiements_realises,
    besoinRestant: a.besoin_restant,
    directeursDecharges: a.directeurs_decharges,
    recrutement: a.recrutement,
    effectifFin: a.effectif_fin,
    tauxAttrition: a.taux_attrition,
    eleves: a.eleves,
    rem: a.rem,
    remRaison: a.rem_raison ?? null,
  }
}

export function versTableau(t: TableauDjango): TableauPlanification {
  return {
    perimetre: t.perimetre,
    niveau: t.niveau,
    sousSysteme: t.sous_systeme,
    scenarioId: t.scenario_id,
    version: t.version,
    calculeLe: t.calcule_le ?? '',
    annees: t.annees.map(versAnnee),
    fiabilite: t.fiabilite.map(f => ({
      indicateur: camel(f.indicateur) as FiabiliteIndicateur['indicateur'],
      niveau: f.niveau,
      detail: f.detail,
    })),
  }
}

function versTerritoire(t: TerritoireDjango): EducationTerritory {
  return {
    code: t.code,
    // Une circonscription IAEB est présentée comme un territoire de niveau communal.
    level: (t.niveau === 'iaeb' ? 'commune' : t.niveau) as EducationTerritory['level'],
    nom: t.nom,
    region: t.region,
    departement: t.departement,
    commune: t.commune,
    parentCode: t.code_parent,
  }
}

function versLigneFiabilite(l: LigneFiabiliteDjango): LigneFiabilite {
  return {
    territoire: l.territoire,
    ecoles: l.ecoles,
    enseignants: l.enseignants,
    tauxDateNaissance: l.taux_date_naissance,
    tauxSousSysteme: l.taux_sous_systeme,
    tauxEffectifsEleves: l.taux_effectifs_eleves,
  }
}

export function versHypotheses(h: HypothesesDjango): Hypotheses {
  return {
    horizon: h.horizon,
    retraite: {
      source: h.retraite.source,
      justification: h.retraite.justification,
      ageLegal: h.retraite.age_legal,
      dateReference: h.retraite.date_reference,
      exceptions: h.retraite.exceptions.map(e => ({ critere: e.critere, valeur: e.valeur, ageLegal: e.age_legal })),
    },
    attrition: {
      source: h.attrition.source,
      justification: h.attrition.justification,
      methode: h.attrition.methode,
      tauxUnique: h.attrition.taux_unique,
      parSousSysteme: h.attrition.par_sous_systeme,
      parRegion: h.attrition.par_region,
      niveauArrondi: h.attrition.niveau_arrondi,
    },
    quotas: {
      source: h.quotas.source,
      justification: h.quotas.justification,
      anneesPrecedentesRealisees: h.quotas.annees_precedentes_realisees,
    },
    vivier: { source: h.vivier.source, justification: h.vivier.justification, sources: h.vivier.sources },
    version: h.version,
    modifieesLe: h.modifiees_le,
    modifieesPar: h.modifiees_par,
    referenceAttrition: h.reference_attrition
      ? {
          modele: h.reference_attrition.modele,
          formule: h.reference_attrition.formule,
          perimetre: h.reference_attrition.perimetre,
          attritionTotalePct: h.reference_attrition.attrition_totale_pct,
          intervalleConfiancePoints: h.reference_attrition.intervalle_confiance_points,
          retraitesPct: h.reference_attrition.retraites_pct,
          autresDepartsPct: h.reference_attrition.autres_departs_pct,
          fenetreDonnees: h.reference_attrition.fenetre_donnees,
          nombreRegions: h.reference_attrition.nombre_regions,
          nombreTransitionsAnnuelles: h.reference_attrition.nombre_transitions_annuelles,
          source: h.reference_attrition.source,
        }
      : null,
  }
}

/** Corps du contrat → corps du serveur. Le bloc DRH n'y figure pas : le serveur garde celui en vigueur. */
export function versCorpsHypotheses(c: CorpsHypotheses): Record<string, unknown> {
  return {
    horizon: c.horizon,
    retraite: {
      source: c.retraite.source,
      justification: c.retraite.justification,
      age_legal: c.retraite.ageLegal,
      date_reference: c.retraite.dateReference,
      exceptions: c.retraite.exceptions.map(e => ({ critere: e.critere, valeur: e.valeur, age_legal: e.ageLegal })),
    },
    attrition: {
      source: c.attrition.source,
      justification: c.attrition.justification,
      methode: c.attrition.methode,
      taux_unique: c.attrition.tauxUnique,
      par_sous_systeme: c.attrition.parSousSysteme,
      par_region: c.attrition.parRegion,
      niveau_arrondi: c.attrition.niveauArrondi,
    },
    quotas: {
      source: c.quotas.source,
      justification: c.quotas.justification,
      annees_precedentes_realisees: c.quotas.anneesPrecedentesRealisees,
    },
    vivier: { source: c.vivier.source, justification: c.vivier.justification, sources: c.vivier.sources },
    motif: c.motif,
    auteur: c.auteur,
  }
}

function versVersion(v: VersionDjango): VersionPlanification {
  return { version: v.version, calculeLe: v.calcule_le, declencheur: v.declencheur, auteur: v.auteur }
}

function versQuota(q: QuotaDjango): QuotaRecrutement {
  return {
    annee: q.annee,
    codeTerritoire: q.code_territoire,
    territoire: q.territoire,
    sousSysteme: q.sous_systeme,
    calcule: q.calcule,
    retenu: q.retenu,
    motifAjustement: q.motif_ajustement,
    statut: q.statut,
    ajustePar: q.ajuste_par,
    valideLe: q.valide_le,
  }
}

function versEtat(e: {
  version: number
  calcule_le: string | null
  declencheur: string | null
  obsolete: boolean
  scenario_retenu_id: string | null
}): EtatPlanification {
  return {
    version: e.version,
    calculeLe: e.calcule_le,
    declencheur: e.declencheur,
    obsolete: e.obsolete,
    scenarioRetenuId: e.scenario_retenu_id,
  }
}

function suivi(i: { points: { version: number; calcule_le: string; indicateurs: unknown }[] }): EvolutionIndicateurs {
  return {
    points: i.points.map(p => ({
      version: p.version,
      calculeLe: p.calcule_le,
      indicateurs: p.indicateurs as IndicateursSuivi['indicateurs'],
    })),
  }
}

// --- Routes ---------------------------------------------------------------------------------------------------

const P = (jeu: string) => `jeux/${jeu}/planification/`

function lire<T>(acces: Acces, chemin: string, query: ParametresRequete): Promise<T> {
  return acces.lire<T>(chemin, queryServeur(query))
}

export const conversionsPlanification: Record<string, Conversion> = {
  'GET hypotheses/defaut/': async (_, acces) =>
    versHypotheses(await acces.lire<HypothesesDjango>('hypotheses/defaut/')),
  'GET jeux/{jeu}/hypotheses/': async (_, acces, p) =>
    versHypotheses(await acces.lire<HypothesesDjango>(`jeux/${p.jeu}/hypotheses/`)),
  'PUT jeux/{jeu}/hypotheses/': async (r, acces, p) =>
    versHypotheses(
      await acces.ecrire<HypothesesDjango>(
        'PUT',
        `jeux/${p.jeu}/hypotheses/`,
        versCorpsHypotheses(r.corps as CorpsHypotheses),
      ),
    ),
  'GET jeux/{jeu}/hypotheses/documentation/': (_, acces, p): Promise<DocumentationHypotheses> =>
    acces.lire(`jeux/${p.jeu}/hypotheses/documentation/`),
  'GET jeux/{jeu}/hypotheses/historique/': async (_, acces, p): Promise<VersionHypotheses[]> =>
    (
      await acces.lire<
        {
          version: number
          modifiees_le: string
          modifiees_par: string | null
          motif: string
          hypotheses: HypothesesDjango
        }[]
      >(`jeux/${p.jeu}/hypotheses/historique/`)
    ).map(v => ({
      version: v.version,
      modifieesLe: v.modifiees_le,
      modifieesPar: v.modifiees_par,
      motif: v.motif,
      hypotheses: versHypotheses(v.hypotheses),
    })),
  'POST jeux/{jeu}/hypotheses/attrition/estimer/': async (_, acces, p): Promise<EstimationAttrition> => {
    const e = await acces.ecrire<{
      taux_propose: number | null
      methode: string
      base: string
      avertissements: string[]
    }>('POST', `jeux/${p.jeu}/hypotheses/attrition/estimer/`)
    return { tauxPropose: e.taux_propose, methode: e.methode, base: e.base, avertissements: e.avertissements }
  },

  'GET jeux/{jeu}/planification/': async (r, acces, p) =>
    versTableau(await lire<TableauDjango>(acces, P(p.jeu), r.query)),
  'GET jeux/{jeu}/planification/territoires/': async (r, acces, p): Promise<VentilationTerritoriale> => {
    const v = await lire<{ niveau: string; lignes: { territoire: TerritoireDjango; annees: AnneeDjango[] }[] }>(
      acces,
      `${P(p.jeu)}territoires/`,
      r.query,
    )
    return {
      niveau: v.niveau as VentilationTerritoriale['niveau'],
      lignes: v.lignes.map(l => ({ territoire: versTerritoire(l.territoire), annees: l.annees.map(versAnnee) })),
    }
  },
  'GET jeux/{jeu}/planification/sous-systemes/': async (r, acces, p): Promise<VentilationSousSystemes> => {
    const v = await lire<{ lignes: { sous_systeme: CleSousSysteme; annees: AnneeDjango[] }[] }>(
      acces,
      `${P(p.jeu)}sous-systemes/`,
      r.query,
    )
    return { lignes: v.lignes.map(l => ({ sousSysteme: l.sous_systeme, annees: l.annees.map(versAnnee) })) }
  },
  'GET jeux/{jeu}/planification/ecoles/': async (r, acces, p) => {
    const { lignes } = await acces.toutes<{
      id_ecole: string
      nom_ecole: string
      region: string
      departement: string
      commune: string
      sous_systeme: SousSysteme | null
      cible: number
      annees: { annee: AnneePlan; effectif: number; departs_retraite: number; besoin: number; excedent: number }[]
    }>(`${P(p.jeu)}ecoles/`, queryServeur(r.query))
    const ecoles: LignePlanificationEcole[] = lignes.map(e => ({
      schoolId: e.id_ecole,
      nomEtab: e.nom_ecole,
      region: e.region,
      departement: e.departement,
      commune: e.commune,
      sousSysteme: e.sous_systeme,
      cible: e.cible,
      annees: e.annees.map(a => ({
        annee: a.annee,
        effectif: a.effectif,
        departsRetraite: a.departs_retraite,
        besoin: a.besoin,
        excedent: a.excedent,
      })),
    }))
    return paginer(ecoles, r.query)
  },
  'GET jeux/{jeu}/planification/departs/': async (r, acces, p): Promise<PlanDeparts> => {
    const d = await lire<{
      retraites: {
        annee: AnneePlan
        matricule: string
        nom: string
        id_ecole: string
        nom_ecole: string
        date_naissance: string | null
        age_au_depart: number
      }[]
      attrition: { annee: AnneePlan; territoire: string; sous_systeme: CleSousSysteme; departs: number }[]
    }>(acces, `${P(p.jeu)}departs/`, r.query)
    return {
      retraites: d.retraites.map(x => ({
        annee: x.annee,
        matricule: x.matricule,
        nom: x.nom,
        schoolId: x.id_ecole,
        nomEtab: x.nom_ecole,
        dateNaissance: x.date_naissance,
        ageAuDepart: x.age_au_depart,
      })),
      attrition: d.attrition.map(a => ({
        annee: a.annee,
        territoire: a.territoire,
        sousSysteme: a.sous_systeme,
        departs: a.departs,
      })),
    }
  },
  'GET jeux/{jeu}/planification/fiabilite/': async (r, acces, p): Promise<FiabiliteDonnees> => {
    const f = await lire<{ global: LigneFiabiliteDjango; par_territoire: LigneFiabiliteDjango[] }>(
      acces,
      `${P(p.jeu)}fiabilite/`,
      r.query,
    )
    return { global: versLigneFiabilite(f.global), parTerritoire: f.par_territoire.map(versLigneFiabilite) }
  },
  'GET jeux/{jeu}/planification/alea/': async (r, acces, p): Promise<DegreAlea> =>
    camelProfond(await lire<unknown>(acces, `${P(p.jeu)}alea/`, r.query)),
  // Tableaux du rapport DRH : les clés du serveur sont des noms de champs, jamais des données (régions…).
  'GET jeux/{jeu}/planification/rapport/': async (r, acces, p): Promise<RapportPrevisionnel> =>
    camelProfond(await lire<unknown>(acces, `${P(p.jeu)}rapport/`, r.query)),
  'GET jeux/{jeu}/planification/rapport/listes/': async (r, acces, p): Promise<ListesRapportPrevisionnel> =>
    camelProfond(await lire<unknown>(acces, `${P(p.jeu)}rapport/listes/`, r.query)),
  'GET jeux/{jeu}/planification/etat/': async (_, acces, p) => versEtat(await acces.lire(`${P(p.jeu)}etat/`)),
  'POST jeux/{jeu}/planification/recalculer/': async (_, acces, p) =>
    versEtat(await acces.ecrire('POST', `${P(p.jeu)}recalculer/`)),
  'GET jeux/{jeu}/planification/versions/': async (_, acces, p) =>
    (await acces.lire<VersionDjango[]>(`${P(p.jeu)}versions/`)).map(versVersion),
  'GET jeux/{jeu}/planification/versions/{version}/': async (r, acces, p): Promise<DetailVersionPlanification> => {
    const d = await lire<{ version: VersionDjango; tableau: TableauDjango }>(
      acces,
      `${P(p.jeu)}versions/${encodeURIComponent(p.version)}/`,
      r.query,
    )
    return { version: versVersion(d.version), tableau: versTableau(d.tableau) }
  },
  'GET jeux/{jeu}/planification/versions/comparer/': async (r, acces, p): Promise<ComparaisonVersions> => {
    const c = await lire<{
      de: VersionDjango
      a: VersionDjango
      ecarts: { annee: AnneePlan; indicateur: string; de: number; a: number }[]
    }>(acces, `${P(p.jeu)}versions/comparer/`, r.query)
    return {
      de: versVersion(c.de),
      a: versVersion(c.a),
      ecarts: c.ecarts.map(e => ({
        annee: e.annee,
        indicateur: camel(e.indicateur) as ComparaisonVersions['ecarts'][number]['indicateur'],
        de: e.de,
        a: e.a,
      })),
    }
  },

  'GET jeux/{jeu}/quotas/': async (r, acces, p) =>
    (await lire<QuotaDjango[]>(acces, `jeux/${p.jeu}/quotas/`, r.query)).map(versQuota),
  'PUT jeux/{jeu}/quotas/{annee}/{territoire}/': async (r, acces, p) => {
    const c = r.corps as CorpsAjustementQuota
    return versQuota(
      await acces.ecrire<QuotaDjango>(
        'PUT',
        `jeux/${p.jeu}/quotas/${encodeURIComponent(p.annee)}/${encodeURIComponent(p.territoire)}/`,
        { sous_systeme: c.sousSysteme, retenu: c.retenu, motif: c.motif, auteur: c.auteur },
      ),
    )
  },
  'POST jeux/{jeu}/quotas/valider/': async (r, acces, p) =>
    (await acces.ecrire<QuotaDjango[]>('POST', `jeux/${p.jeu}/quotas/valider/`, r.corps as CorpsValidationQuotas)).map(
      versQuota,
    ),
  'GET jeux/{jeu}/quotas/historique/': async (r, acces, p): Promise<EvenementQuota[]> =>
    (
      await lire<
        {
          annee: AnneePlan
          code_territoire: string
          evenement: EvenementQuota['evenement']
          valeur: number
          motif: string | null
          auteur: string | null
          le: string
        }[]
      >(acces, `jeux/${p.jeu}/quotas/historique/`, r.query)
    ).map(e => ({
      annee: e.annee,
      codeTerritoire: e.code_territoire,
      evenement: e.evenement,
      valeur: e.valeur,
      motif: e.motif,
      auteur: e.auteur,
      le: e.le,
    })),

  'GET jeux/{jeu}/indicateurs/': (r, acces, p): Promise<IndicateursSuivi> =>
    lire(acces, `jeux/${p.jeu}/indicateurs/`, r.query),
  'GET jeux/{jeu}/indicateurs/evolution/': async (r, acces, p) =>
    suivi(await lire(acces, `jeux/${p.jeu}/indicateurs/evolution/`, r.query)),
}
