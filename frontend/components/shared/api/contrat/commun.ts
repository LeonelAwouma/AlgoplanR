/**
 * Contrat de l'API — types partagés par plusieurs contextes : sélection
 * territoriale, filtres, énoncés narratifs et bilan des flux d'un territoire.
 */

import type { SchoolSeverity, TerritoryLevel, Zone, ZoneSecurite, SousSysteme } from './education'
import type { ProposedAssignment } from './simulation'

/** Identifiant d'un jeu de données (exercice de planification). */
export type IdJeu = string

/** Sélection territoriale : chaque niveau n'a de sens que si le niveau supérieur est choisi. */
export interface TerritorySelection {
  region: string | null
  departement: string | null
  commune: string | null
}

/** Sélection nationale (aucun territoire choisi). */
export const SELECTION_NATIONALE: TerritorySelection = { region: null, departement: null, commune: null }

/** Filtres globaux du tableau de bord (§4), transmis en paramètres de requête. */
export interface GlobalFilters {
  territoire: TerritorySelection
  zones: Zone[]
  /** Zones de sécurité ; une école sans zone renseignée compte en zone verte, comme dans le calcul. */
  zonesSecurite: ZoneSecurite[]
  typesEtab: string[]
  severites: SchoolSeverity[]
  /** `null` = indifférent, `true` = uniquement les écoles à classes multigrades. */
  multigradesUniquement: boolean | null
}

/** Aucun filtre : tout le jeu de données. */
export const FILTRES_VIDES: GlobalFilters = {
  territoire: SELECTION_NATIONALE,
  zones: [],
  zonesSecurite: [],
  typesEtab: [],
  severites: [],
  multigradesUniquement: null,
}

/** Niveau territorial demandé pour une ventilation (planification, indicateurs). */
export type NiveauTerritorial = TerritoryLevel | 'iaeb'

/** Filtres territoriaux communs aux routes de planification (section 3 du document des routes). */
export interface FiltresPerimetre {
  niveau?: NiveauTerritorial
  region?: string | null
  departement?: string | null
  commune?: string | null
  iaeb?: string | null
  sousSysteme?: SousSysteme | null
}

/** Une phrase produite par une règle, et la règle qui l'a déclenchée (affichée en vue analyste). */
export interface Enonce {
  texte: string
  regle: string
}

/** Point d'attention calculé (§18), avec sa valeur. */
export interface PointAttention {
  code: string
  titre: string
  texte: string
  valeur: number | null
}

/** Sens d'un mouvement vu depuis un territoire. */
export type SensDuMouvement = 'entrant' | 'sortant' | 'interne'

/** Regroupement de mouvements par territoire. */
export interface GroupeTerritorial {
  libelle: string
  nombre: number
}

/** Bilan des mouvements d'un territoire, dans les deux sens. */
export interface FluxTerritorial {
  /** Postes du territoire (vue destination). */
  besoinInitial: number
  postesCouverts: number
  besoinResiduel: number
  tauxCouverture: number

  /** Enseignants arrivant dans le territoire depuis l'extérieur. */
  enseignantsRecus: number
  /** Enseignants quittant le territoire pour l'extérieur. */
  enseignantsSortants: number
  /** Mouvements dont l'origine et la destination sont dans le territoire. */
  mouvementsInternes: number
  /** Reçus − sortants : positif si le territoire gagne des enseignants. */
  solde: number

  entrants: ProposedAssignment[]
  sortants: ProposedAssignment[]
  internes: ProposedAssignment[]

  /** D'où viennent les enseignants reçus. */
  originesExterieures: GroupeTerritorial[]
  /** Où vont les enseignants qui partent. */
  destinationsExterieures: GroupeTerritorial[]

  /** Écoles du territoire qui fournissent des enseignants, et leur nombre de départs. */
  ecolesSources: { schoolId: string; nomEtab: string; departs: number }[]
  /** `true` si aucun mouvement ne franchit la frontière du territoire. */
  autonome: boolean
}

/** Auteur d'une décision, saisi tant que le module d'accès reste désactivé. */
export interface Auteur {
  /** Nom de l'agent qui prend la décision. */
  nom: string
}
