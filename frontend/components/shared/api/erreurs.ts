/**
 * Erreurs renvoyées par l'API, sous une forme unique pour toute l'interface.
 *
 * Le backend répond aux refus métier par un corps JSON `{ code, motif, details }` :
 *   - 422 : une règle métier n'est pas respectée (le motif est à montrer tel quel) ;
 *   - 409 : conflit, par exemple une personne déjà nommée ou un poste déjà pourvu.
 * Le statut 0 désigne une absence de réponse : serveur arrêté ou injoignable.
 */

/** Statut utilisé quand aucune réponse HTTP n'a été reçue. */
export const STATUT_INJOIGNABLE = 0

/** Corps d'erreur attendu du backend. */
export interface CorpsErreur {
  code?: string
  motif?: string
  details?: unknown
}

/** Erreur d'un appel à l'API. */
export class ApiError extends Error {
  /** Statut HTTP, ou `STATUT_INJOIGNABLE` sans réponse du serveur. */
  readonly statut: number
  /** Code métier stable (`regle_metier`, `conflit`, `serveur_injoignable`…), utilisable dans les tests. */
  readonly code: string
  /** Message en français, destiné à l'utilisateur. */
  readonly motif: string
  /** Informations complémentaires renvoyées par le serveur (erreurs de validation champ par champ…). */
  readonly details: unknown

  constructor(statut: number, code: string, motif: string, details: unknown = null) {
    super(motif)
    this.name = 'ApiError'
    this.statut = statut
    this.code = code
    this.motif = motif
    this.details = details
  }
}

/** Message affiché quand le serveur ne répond pas. */
export const MOTIF_INJOIGNABLE = 'Le serveur AlgoPlanR est injoignable. Vérifiez qu’il est démarré, puis réessayez.'

/** Motif par défaut selon le statut, quand le serveur n'en fournit pas. */
function motifParDefaut(statut: number): string {
  if (statut === 400) return 'La requête envoyée au serveur est invalide.'
  if (statut === 401 || statut === 403) return 'Accès refusé par le serveur AlgoPlanR.'
  if (statut === 404) return 'L’élément demandé n’existe pas ou plus.'
  if (statut === 409) return 'L’opération entre en conflit avec une décision existante.'
  if (statut === 422) return 'L’opération ne respecte pas une règle de gestion.'
  if (statut >= 500) return 'Le serveur AlgoPlanR a rencontré une erreur. Réessayez dans un instant.'
  return `Erreur inattendue du serveur (statut ${statut}).`
}

/** Code par défaut selon le statut. */
function codeParDefaut(statut: number): string {
  if (statut === 409) return 'conflit'
  if (statut === 422) return 'regle_metier'
  if (statut === 404) return 'introuvable'
  if (statut === 401 || statut === 403) return 'acces_refuse'
  if (statut >= 500) return 'erreur_serveur'
  return 'requete_invalide'
}

/** Construit l'erreur d'une réponse non réussie, à partir de son corps éventuel. */
export function erreurDepuisReponse(statut: number, corps: unknown): ApiError {
  const c: CorpsErreur = typeof corps === 'object' && corps !== null ? (corps as CorpsErreur) : {}
  return new ApiError(statut, c.code ?? codeParDefaut(statut), c.motif ?? motifParDefaut(statut), c.details ?? null)
}

/** Erreur levée quand le serveur ne répond pas. */
export function erreurInjoignable(cause: unknown): ApiError {
  return new ApiError(STATUT_INJOIGNABLE, 'serveur_injoignable', MOTIF_INJOIGNABLE, cause)
}

/** Vrai pour un refus métier (422) : le motif explique la règle non respectée. */
export function estRefusMetier(erreur: unknown): erreur is ApiError {
  return erreur instanceof ApiError && erreur.statut === 422
}

/** Vrai pour un conflit (409) : l'opération contredit une décision déjà enregistrée. */
export function estConflit(erreur: unknown): erreur is ApiError {
  return erreur instanceof ApiError && erreur.statut === 409
}

/** Vrai quand le serveur n'a pas répondu. */
export function estInjoignable(erreur: unknown): erreur is ApiError {
  return erreur instanceof ApiError && erreur.statut === STATUT_INJOIGNABLE
}

/** Message à afficher pour n'importe quelle erreur, qu'elle vienne de l'API ou non. */
export function messageErreur(erreur: unknown): string {
  if (erreur instanceof ApiError) return erreur.motif
  if (erreur instanceof Error) return erreur.message
  return String(erreur)
}
