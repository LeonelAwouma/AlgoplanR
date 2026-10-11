/**
 * Démarrage des données factices dans le navigateur (développement seulement).
 *
 * Activées par `NEXT_PUBLIC_API_MOCK=1` (script `pnpm dev:factice`), elles
 * interceptent les appels à l'API avec un service worker (MSW) et répondent à
 * partir des fichiers générés par moteur-reference. Ce module n'est chargé que
 * par import dynamique, sous cette condition : il n'entre jamais dans le build
 * de production, dont l'export est en outre débarrassé du service worker.
 */

import { setupWorker } from 'msw/browser'

import { lireEtatInitial } from './catalogue'
import { initialiserEtat } from './etat'
import { gestionnaires } from './gestionnaires'

/** Charge l'état initial puis démarre l'interception. */
export async function demarrerDonneesFactices(): Promise<void> {
  initialiserEtat(await lireEtatInitial())
  const worker = setupWorker(...gestionnaires)
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true })
  console.info('AlgoPlanR : données factices actives (jeu de démonstration, aucun serveur contacté).')
}
