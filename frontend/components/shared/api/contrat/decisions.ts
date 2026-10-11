/**
 * Contrat de l'API — corps des décisions et des imports de décisions :
 * faits du Prince, arbitrages des commissions, recrues.
 */

import type { DecisionArbitrage, Recrue } from './simulation'

// --- Fait du Prince ---------------------------------------------------------------

/** Enregistrement d'un fait du Prince. */
export interface CorpsFaitPrince {
  /** Matricule de l'enseignant redéployé. */
  matricule: string
  /** Identifiant de l'unité de destination. */
  ecoleDestination: string
  /** Référence de la décision (note de service…), facultative. */
  reference: string
}

/** Import d'un fichier de faits du Prince (formulaire multipart). */
export interface CorpsImportFichier {
  [champ: string]: string | Blob | undefined
  fichier: Blob
  feuille?: string
}

/** Bilan d'un import de décisions en lot. */
export interface BilanImportPrince {
  acceptees: number
  /** Lignes refusées, avec leur motif (« matricule → école : motif »). */
  refus: string[]
  /** Colonnes indispensables introuvables dans le fichier. */
  manquantes: string[]
}

// --- Arbitrage --------------------------------------------------------------------

/**
 * Décision d'une commission. Le serveur complète l'identifiant, la date, le nom
 * de l'enseignant et la proposition initiale du scénario indiqué.
 */
export interface CorpsDecisionArbitrage {
  /** Scénario dont la proposition est arbitrée. */
  scenario: string
  teacherId: string
  decision: DecisionArbitrage['decision']
  /** École retenue, pour une décision « modifier ». */
  schoolDestinationId: string | null
  changementSousSysteme: boolean
  motif: string
  instance: DecisionArbitrage['instance']
}

// --- Recrutement ------------------------------------------------------------------

/** Résultat de l'analyse d'un fichier de recrues. */
export interface LectureRecrues {
  recrues: Recrue[]
  /** Colonnes indispensables introuvables. */
  manquantes: string[]
  /** Lignes écartées (sans identifiant ou sans note), avec leur motif. */
  ecartees: { ligne: number; motif: string }[]
}
