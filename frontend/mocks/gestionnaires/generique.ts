/**
 * Gestionnaires de dernier recours : toute lecture est servie depuis le
 * catalogue généré ; toute écriture sans gestionnaire dédié est refusée avec un
 * motif explicite, plutôt que de faire croire qu'elle a réussi.
 */

import { http } from 'msw'

import { choisir, entreesDe } from '../catalogue'
import { estApproximation, filtresDe, traiterListe } from '../listes'
import { introuvable, nonSimule, ok } from '../reponses'
import { api, cheminDe, jeuConnu } from './outils'

export const gestionnairesGeneriques = [
  http.get(api('*'), async ({ request }) => {
    const url = new URL(request.url)
    const chemin = cheminDe(url)

    const jeu = /^jeux\/([^/]+)\//.exec(chemin)?.[1]
    if (jeu && !jeuConnu(decodeURIComponent(jeu))) return introuvable('Ce jeu de données n’existe pas ou plus.')

    const entrees = await entreesDe(chemin)
    if (!entrees) return introuvable()
    const choix = choisir(entrees, url.searchParams)
    if (!choix) return introuvable()

    if (choix.entree.liste) {
      const { page, utilises } = traiterListe(
        choix.entree.reponse as unknown[],
        url.searchParams,
        filtresDe(chemin),
        choix.utilises,
      )
      return ok(page, estApproximation(url.searchParams, utilises))
    }
    return ok(choix.entree.reponse, estApproximation(url.searchParams, choix.utilises))
  }),

  http.all(api('*'), ({ request }) =>
    nonSimule(`Cette opération (${request.method} ${cheminDe(new URL(request.url))})`),
  ),
]
