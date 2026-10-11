/**
 * Contrat de l'API — contexte « Simulation » (Moteur B) : scénarios, résultats
 * et leurs sections, flux, comparaison, explication d'une proposition.
 */

import type { Enonce } from './commun'
import type { SousSysteme, ZoneSecurite } from './education'
import type {
  CombinaisonArbitrage,
  EngineSettings,
  GeographicScope,
  ProjectionEcole,
  ProjectionTerritoire,
  ProposedAssignment,
  ProximityLevel,
  SimulationLogEntry,
  SimulationResult,
  SimulationScenario,
  TourAppariement,
} from './simulation'

/** Modèle de scénario proposé à l'utilisateur (scénarios A à F). */
export interface PresetScenario {
  cle: string
  nom: string
  description: string
  scope: GeographicScope
  /** Faux quand les données du jeu ne permettent pas la règle du scénario. */
  disponible: boolean
  /** Explication de l'indisponibilité, vide sinon. */
  motif: string
}

/** Création d'un scénario : depuis un modèle, ou avec des paramètres personnalisés. */
export type CorpsCreationScenario =
  | { preset: string; personnalise?: undefined }
  | {
      preset?: undefined
      personnalise: { nom: string; description?: string; scope: GeographicScope; parametres: EngineSettings }
    }

/** Scénario et état de son calcul. */
export interface ScenarioCalcule {
  scenario: SimulationScenario
  /** Le résultat existe. */
  calcule: boolean
  /** Les règles courantes ont changé depuis le calcul (scénarios géographiques seulement). */
  obsolete: boolean
  calculeLe: string | null
  /** Indicateurs principaux sur l'ensemble du jeu, pour les listes et les cartes de résumé. */
  indicateurs: {
    besoinInitial: number
    postesCouverts: number
    besoinResiduel: number
    tauxCouverture: number
    enseignantsDeplaces: number
    /** Mouvements proposés par niveau de proximité. */
    mouvementsParPerimetre: { niveau: ProximityLevel; nombre: number }[]
    /** Contrôles métier non satisfaits après le calcul. */
    controlesEnEcart: number
  } | null
}

/** Journal d'exécution d'un scénario. */
export interface JournalSimulation {
  tours: TourAppariement[]
  toursTronques: boolean
  logs: SimulationLogEntry[]
  computedAt: string
}

/** Projection pluriannuelle d'un scénario (remplacée par la planification sur cinq ans). */
export interface ProjectionsScenario {
  ecoles: ProjectionEcole[]
  territoire: ProjectionTerritoire[]
}

/** École restée sans maître, avec les combinaisons proposées à la commission. */
export interface EcoleNonCouverte {
  schoolId: string
  nom: string
  commune: string
  sousSysteme: SousSysteme | null
  indice: number
  /** Postes restés vacants dans l'école. */
  postes: number
  zoneSecurite: ZoneSecurite | null
  zoneRouge: boolean
  combinaisons: CombinaisonArbitrage[]
}

/** Explication d'une proposition : « Pourquoi cette proposition ? ». */
export interface ExplicationProposition {
  titre: string
  lignes: string[]
  proposition: ProposedAssignment
}

/** Comparaison des scénarios calculés sur un périmètre. */
export interface ComparaisonScenarios {
  /**
   * Résultats restreints au périmètre : les trois scénarios géographiques dans
   * l'ordre commune, département, étendu, puis les scénarios personnalisés.
   */
  resultats: SimulationResult[]
  /** Phrase de réduction du déficit pour chaque résultat, `null` si elle ne s'applique pas. */
  reductions: (Enonce | null)[]
}

/** Choix du scénario dont les mouvements alimentent la planification. */
export interface CorpsScenarioRetenu {
  scenario: string
}
