/**
 * Routes système, hors de tout contexte métier.
 *
 * Route : GET sante/
 */

import { appeler } from './client'
import { route } from './routes'

/** État du serveur. */
export interface Sante {
  statut: 'ok'
  /** Version du backend, affichée dans l'aide et utile aux rapports d'incident. */
  version: string
}

const ROUTES = {
  sante: route<Sante>()('GET', 'sante/'),
}

/**
 * Vérifie que le serveur répond. Utilisé par l'application de bureau au
 * démarrage et par l'écran d'erreur « serveur injoignable » pour réessayer.
 *
 * @throws ApiError (statut 0) si le serveur ne répond pas.
 */
export function verifierSante(signal?: AbortSignal): Promise<Sante> {
  return appeler(ROUTES.sante, { signal })
}
