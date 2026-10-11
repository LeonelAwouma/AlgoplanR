/**
 * Contrat de l'API — contexte « Planification » : tableau prévisionnel sur cinq
 * ans, hypothèses de calcul, quotas de recrutement et indicateurs de suivi
 * (mémo de synthèse, §2.1 et §3 ; document des routes, sections 4.2 à 4.4 et 4.7).
 *
 * Les règles de calcul dépendent de points encore à valider (méthode officielle
 * d'attrition, règles de retraite, portée du vivier) : le contrat expose donc
 * les hypothèses retenues avec leur source et leur justification.
 */

import type { NiveauTerritorial } from './commun'
import type { EducationTerritory, SousSysteme } from './education'
import type { SourceVivier } from './nominations'

/** Année du plan, de la rentrée du plan (N+1) à N+5. */
export type AnneePlan = 'N+1' | 'N+2' | 'N+3' | 'N+4' | 'N+5'

/** Années couvertes par le tableau, dans l'ordre. */
export const ANNEES_PLAN: readonly AnneePlan[] = ['N+1', 'N+2', 'N+3', 'N+4', 'N+5']

// --- Hypothèses ---------------------------------------------------------------------

/** Toute hypothèse est documentée : d'où vient la valeur, et pourquoi elle est retenue. */
export interface Justification {
  source: string
  justification: string
}

/** Méthode de calcul de l'attrition hors retraite. */
export type MethodeAttrition = 'taux_unique' | 'par_sous_systeme' | 'par_region'

/** Exception à l'âge légal de départ, par statut ou par catégorie. */
export interface ExceptionRetraite {
  critere: 'statut' | 'categorie'
  valeur: string
  ageLegal: number
}

/** Hypothèses de calcul de la planification, en vigueur pour un jeu. */
export interface Hypotheses {
  /** Nombre d'années projetées (5 selon le mémo). */
  horizon: number
  retraite: Justification & {
    ageLegal: number
    /** Date à laquelle l'âge est apprécié chaque année. */
    dateReference: 'rentree' | 'fin_annee_civile'
    exceptions: ExceptionRetraite[]
  }
  attrition: Justification & {
    methode: MethodeAttrition
    /** Taux annuel en %, pour la méthode « taux unique ». */
    tauxUnique: number
    parSousSysteme: Partial<Record<SousSysteme, number>>
    parRegion: Record<string, number>
    /** Niveau territorial auquel l'attrition est arrondie (point à valider). */
    niveauArrondi: NiveauTerritorial
  }
  quotas: Justification & {
    /** Supposer recrutés les quotas des années précédentes pour projeter les suivantes. */
    anneesPrecedentesRealisees: boolean
  }
  vivier: Justification & {
    /** Sources de personnes retenues dans le vivier. */
    sources: SourceVivier[]
  }
  version: number
  modifieesLe: string | null
  modifieesPar: string | null
}

/** Modification des hypothèses : toute la configuration, avec son auteur et son motif. */
export type CorpsHypotheses = Omit<Hypotheses, 'version' | 'modifieesLe' | 'modifieesPar'> & {
  auteur: string
  motif: string
}

/** Version historisée des hypothèses. */
export interface VersionHypotheses {
  version: number
  modifieesLe: string
  modifieesPar: string | null
  motif: string
  hypotheses: Hypotheses
}

/** Fiche lisible des hypothèses, reprise dans le rapport et la méthodologie. */
export interface DocumentationHypotheses {
  sections: { titre: string; paragraphes: string[] }[]
}

/** Estimation d'un taux d'attrition à partir des données disponibles (non enregistrée). */
export interface EstimationAttrition {
  /** Taux proposé en %, `null` si les données ne permettent pas d'estimer. */
  tauxPropose: number | null
  methode: string
  /** Données sur lesquelles repose l'estimation. */
  base: string
  avertissements: string[]
}

// --- Tableau de planification ---------------------------------------------------------

/** Les huit indicateurs du mémo (§2.1), pour une année et un périmètre. */
export interface IndicateursAnnee {
  annee: AnneePlan
  /** Effectif enseignant disponible en début de période. */
  effectifDebut: number
  departsRetraite: number
  departsAttrition: number
  /** Besoin prévisionnel : somme de max(0 ; K − effectif). */
  besoin: number
  /** Ressources mobilisables depuis le vivier. */
  ressourcesVivier: number
  quotaCalcule: number
  /** Quota retenu après ajustement administratif, `null` tant qu'il n'a pas été fixé. */
  quotaRetenu: number | null
  nominationsPrevues: number
  nominationsRealisees: number
  deploiementsPrevus: number
  deploiementsRealises: number
  /** Besoin restant à couvrir après mobilisation des ressources. */
  besoinRestant: number
}

/** Fiabilité d'un indicateur, selon la disponibilité des données sources. */
export interface FiabiliteIndicateur {
  indicateur: keyof Omit<IndicateursAnnee, 'annee'>
  niveau: 'bonne' | 'partielle' | 'faible'
  detail: string
}

/** Tableau de planification d'un périmètre (`GET jeux/{jeu}/planification/`). */
export interface TableauPlanification {
  perimetre: string
  niveau: NiveauTerritorial
  sousSysteme: SousSysteme | null
  scenarioId: string | null
  version: number
  calculeLe: string
  annees: IndicateursAnnee[]
  fiabilite: FiabiliteIndicateur[]
}

/** Ventilation par territoire enfant (descente région → département → commune). */
export interface VentilationTerritoriale {
  niveau: NiveauTerritorial
  lignes: { territoire: EducationTerritory; annees: IndicateursAnnee[] }[]
}

/** Ventilation par sous-système. */
export interface VentilationSousSystemes {
  lignes: { sousSysteme: SousSysteme | 'non_renseigne'; annees: IndicateursAnnee[] }[]
}

/** Projection d'une école. */
export interface LignePlanificationEcole {
  schoolId: string
  nomEtab: string
  region: string
  departement: string
  commune: string
  sousSysteme: SousSysteme | null
  cible: number
  annees: { annee: AnneePlan; effectif: number; departsRetraite: number; besoin: number; excedent: number }[]
}

/** Départ à la retraite prévu, nominatif. */
export interface DepartRetraitePrevu {
  annee: AnneePlan
  matricule: string
  nom: string
  schoolId: string
  nomEtab: string
  dateNaissance: string | null
  ageAuDepart: number
}

/** Plan des départs : retraites nominatives et attrition estimée par territoire. */
export interface PlanDeparts {
  retraites: DepartRetraitePrevu[]
  attrition: { annee: AnneePlan; territoire: string; sousSysteme: SousSysteme | 'non_renseigne'; departs: number }[]
}

/** Disponibilité des données qui fondent les projections. */
export interface LigneFiabilite {
  territoire: string
  ecoles: number
  enseignants: number
  /** Parts entre 0 et 1. */
  tauxDateNaissance: number
  tauxSousSysteme: number
  tauxEffectifsEleves: number
}

export interface FiabiliteDonnees {
  global: LigneFiabilite
  parTerritoire: LigneFiabilite[]
}

/** État du dernier calcul de la planification. */
export interface EtatPlanification {
  version: number
  calculeLe: string | null
  /** Ce qui a déclenché le dernier calcul (import, décision, hypothèses…). */
  declencheur: string | null
  obsolete: boolean
  scenarioRetenuId: string | null
}

/** Instantané conservé à chaque recalcul. */
export interface VersionPlanification {
  version: number
  calculeLe: string
  declencheur: string
  auteur: string | null
}

export interface DetailVersionPlanification {
  version: VersionPlanification
  tableau: TableauPlanification
}

/** Écarts entre deux versions, indicateur par indicateur. */
export interface ComparaisonVersions {
  de: VersionPlanification
  a: VersionPlanification
  ecarts: { annee: AnneePlan; indicateur: keyof Omit<IndicateursAnnee, 'annee'>; de: number; a: number }[]
}

// --- Quotas -----------------------------------------------------------------------------

/** Cycle d'un quota : calculé, éventuellement ajusté, puis validé (figé). */
export type StatutQuota = 'calcule' | 'ajuste' | 'valide'

export interface QuotaRecrutement {
  annee: AnneePlan
  codeTerritoire: string
  territoire: string
  sousSysteme: SousSysteme | 'non_renseigne'
  calcule: number
  retenu: number
  /** Motif de l'écart entre calcul et quota retenu, obligatoire en cas d'ajustement. */
  motifAjustement: string | null
  statut: StatutQuota
  ajustePar: string | null
  valideLe: string | null
}

/**
 * Ajustement d'un quota. Un même territoire porte un quota par sous-système :
 * le corps précise lequel.
 */
export interface CorpsAjustementQuota {
  sousSysteme: SousSysteme | 'non_renseigne'
  retenu: number
  motif: string
  auteur: string
}

export interface CorpsValidationQuotas {
  annee: AnneePlan
  auteur: string
}

export interface EvenementQuota {
  annee: AnneePlan
  codeTerritoire: string
  evenement: 'calcul' | 'ajustement' | 'validation'
  valeur: number
  motif: string | null
  auteur: string | null
  le: string
}

// --- Indicateurs de suivi -------------------------------------------------------------

export interface IndicateurSuivi {
  code:
    'couverture_besoin' | 'mobilisation_vivier' | 'realisation_nominations' | 'ecart_prevu_realise' | 'besoin_residuel'
  libelle: string
  valeur: number | null
  unite: 'pourcentage' | 'nombre'
  detail: string
}

export interface IndicateursSuivi {
  perimetre: string
  indicateurs: IndicateurSuivi[]
}

export interface EvolutionIndicateurs {
  points: { version: number; calculeLe: string; indicateurs: IndicateurSuivi[] }[]
}

// --- Filtres ----------------------------------------------------------------------------

/** Filtres propres aux routes de planification (section 3 du document des routes). */
export interface FiltresPlanification {
  /** Scénario dont les mouvements sont pris en compte ; le scénario retenu par défaut. */
  scenario?: string
  annee?: AnneePlan
  /** Version de la planification ; la dernière par défaut. */
  version?: number
}
