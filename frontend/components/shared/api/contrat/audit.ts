/**
 * Contrat de l'API — contexte « Audit » : journal transverse de toutes les
 * décisions et de tous les recalculs (document des routes, section 4.8).
 */

/** Familles d'événements journalisés. */
export type TypeEvenementAudit =
  | 'import'
  | 'actualisation'
  | 'validation_donnees'
  | 'parametres'
  | 'hypotheses'
  | 'scenario_retenu'
  | 'fait_prince'
  | 'arbitrage'
  | 'recrues'
  | 'nomination'
  | 'quota'
  | 'mouvement'
  | 'recalcul'

export interface EvenementAudit {
  id: string
  type: TypeEvenementAudit
  /** Action précise : « validée », « rejetée », « ajustement »… */
  action: string
  /** Objet concerné, `null` pour un événement global (recalcul, import). */
  objet: { type: string; id: string } | null
  /** Phrase lisible résumant l'événement. */
  resume: string
  auteur: string | null
  le: string
}

/** Détail d'un événement : état de l'objet avant et après. */
export interface EvenementAuditDetail extends EvenementAudit {
  avant: unknown
  apres: unknown
}

export interface FiltresAudit {
  type?: TypeEvenementAudit[]
  /** Objet au format `type:id`, par exemple `nomination:42`. */
  objet?: string
  auteur?: string
  /** Bornes de période, ISO 8601. */
  du?: string
  au?: string
}
