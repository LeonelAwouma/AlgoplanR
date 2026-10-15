import type { RequeteApi } from '../client'
import type { Acces } from './acces'

/**
 * Conversion d'une route : reçoit la requête du contrat, interroge le serveur
 * Django et renvoie la réponse au format du contrat.
 *
 * @param params valeurs des paramètres du gabarit (`jeu`, `scenario`…).
 */
export type Conversion = (requete: RequeteApi, acces: Acces, params: Record<string, string>) => Promise<unknown>
