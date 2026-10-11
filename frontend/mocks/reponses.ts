/**
 * Réponses des données factices, au format de l'API AlgoPlanR.
 *
 * Chaque réponse porte l'en-tête `X-AlgoPlanR-Factice` : `oui` pour une
 * réponse exacte, `approximation` quand un paramètre de la requête n'a pas pu
 * être pris en compte (la réponse la plus proche a été servie). Les erreurs
 * reprennent le corps `{ code, motif }` que le client convertit en `ApiError`.
 */

import { HttpResponse, type JsonBodyType } from 'msw'

/** En-tête qui signale une réponse factice, visible dans les outils du navigateur. */
export const EN_TETE_FACTICE = 'X-AlgoPlanR-Factice'

/** Réponse JSON réussie. */
export function ok<T>(corps: T, approximation = false, statut = 200) {
  return HttpResponse.json(corps as JsonBodyType, {
    status: statut,
    headers: { [EN_TETE_FACTICE]: approximation ? 'approximation' : 'oui' },
  })
}

/** Réponse vide (suppression réussie). */
export function sansContenu() {
  return new HttpResponse(null, { status: 204, headers: { [EN_TETE_FACTICE]: 'oui' } })
}

function erreur(statut: number, code: string, motif: string) {
  return HttpResponse.json({ code, motif }, { status: statut, headers: { [EN_TETE_FACTICE]: 'oui' } })
}

/** 404 : l'objet demandé n'existe pas dans les données factices. */
export function introuvable(motif = 'Aucune donnée factice ne correspond à cette demande.') {
  return erreur(404, 'introuvable', motif)
}

/** 409 : l'opération entre en conflit avec une décision existante. */
export function conflit(motif: string) {
  return erreur(409, 'conflit', motif)
}

/** 422 : l'opération ne respecte pas une règle de gestion. */
export function refus(motif: string) {
  return erreur(422, 'regle_metier', motif)
}

/** 422 : l'opération demande un vrai calcul, que les données factices ne font pas. */
export function nonSimule(operation: string) {
  return refus(
    `${operation} demande le serveur AlgoPlanR : les données factices ne recalculent rien. Lancez le backend pour cette opération.`,
  )
}
