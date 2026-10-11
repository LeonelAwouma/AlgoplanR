/**
 * Contrat de l'API — contexte « Diagnostic » (Moteur A) : diagnostic filtré,
 * arbre territorial, priorités et synthèse narrative.
 *
 * Toutes les agrégations (comptes par sévérité, par zone, par territoire, flux)
 * sont faites par le serveur : l'interface ne fait que les présenter.
 */

import type { Enonce, PointAttention, TerritorySelection } from './commun'
import type {
  EducationTerritory,
  SchoolDiagnostic,
  SchoolSeverity,
  TerritorialSummary,
  TerritorialTotals,
  TerritoryLevel,
  Zone,
  ZoneSecurite,
} from './education'
import type { SyntheseTerritoriale } from './simulation'

/** Diagnostic du périmètre filtré (`GET jeux/{jeu}/diagnostic/`). */
export interface DiagnosticPerimetre {
  totals: TerritorialTotals
  ecoles: SchoolDiagnostic[]
  /** Nombre d'écoles du jeu, tous filtres levés : sert à savoir si un filtre est actif. */
  ecolesDuJeu: number
  donneesElevesDisponibles: boolean
  /** Écoles dont le besoin a été calculé sans effectif d'élèves. */
  ecolesEnRepli: number
  /** Écoles sans salles renseignées : BMAX inconnu. */
  ecolesSansSalles: number
}

/**
 * Mouvements d'un territoire enfant dans un scénario, comptés dans les deux
 * sens (vue destination et vue origine), lus sur le résultat national.
 */
export interface MouvementsTerritoire {
  /** Nom du territoire enfant. */
  territoire: string
  besoin: number
  couverts: number
  residuel: number
  recus: number
  sortants: number
  solde: number
}

/** Nœud courant de l'arbre territorial et son contexte (`GET jeux/{jeu}/territoires/`). */
export interface VueTerritoriale {
  niveau: TerritoryLevel
  /** Libellé de la sélection : « Cameroun », une région, un département ou une commune. */
  perimetre: string
  noeud: TerritorialSummary
  /** Enfants directs du nœud courant. */
  enfants: TerritorialSummary[]
  filAriane: { label: string; selection: TerritorySelection }[]
  /** Mouvements de chaque enfant dans le scénario demandé ; vide sans scénario. */
  mouvementsEnfants: MouvementsTerritoire[]
}

/** Options des menus de filtres, selon le niveau territorial déjà choisi. */
export interface OptionsFiltres {
  regions: string[]
  departements: string[]
  communes: string[]
  typesEtab: string[]
  zones: Zone[]
}

/** Établissements en déficit, classés par priorité. */
export interface Priorites {
  ecoles: SchoolDiagnostic[]
  /** Nombre total d'écoles en déficit du périmètre (avant la limite demandée). */
  total: number
}

/** Écoles du périmètre dans une zone de sécurité. */
export interface RepartitionZoneSecurite {
  zone: ZoneSecurite
  ecoles: number
  /** Écoles sans zone renseignée, comptées en zone verte comme dans le calcul. */
  nonRenseignees: number
  enDeficit: number
  postesManquants: number
  /** Postes restés vacants dans le scénario demandé, `null` sans scénario. */
  restantsApresScenario: number | null
}

/** Besoin d'un territoire enfant et sa couverture par le scénario demandé. */
export interface BesoinTerritoireEnfant {
  territoire: EducationTerritory
  postesNecessaires: number
  /** Postes couverts par le scénario, 0 sans scénario. */
  couverts: number
  restant: number
  /** Taux de couverture en %, arrondi. */
  taux: number
}

/** Synthèse du tableau de bord et du diagnostic (`GET jeux/{jeu}/synthese/`). */
export interface SyntheseDiagnostic {
  perimetre: string
  totals: TerritorialTotals
  /** Phrases du tableau de bord. */
  syntheseTableauDeBord: Enonce[]
  /** Phrases du diagnostic territorial. */
  diagnosticTerritorial: Enonce[]
  pointsAttention: PointAttention[]
  /**
   * Enfants du périmètre où coexistent déficits et excédents : un redéploiement
   * interne y est possible sans mouvement longue distance.
   */
  territoiresMixtes: TerritorialSummary[]
  /** Agrégats par sous-système (§2.6). */
  syntheseTerritoriale: SyntheseTerritoriale
  /** Nombre d'écoles par niveau de sévérité. */
  parSeverite: Record<SchoolSeverity, number>
  /** Écoles et besoins par zone de sécurité. */
  parZoneSecurite: RepartitionZoneSecurite[]
  /** Besoins des territoires enfants en déficit, du plus grand au plus petit (12 au plus). */
  besoinsParEnfant: BesoinTerritoireEnfant[]
  /** Phrase de réduction du déficit par le scénario demandé, `null` si elle ne s'applique pas. */
  reductionDeficit: Enonce | null
}
