/**
 * État en mémoire des données factices.
 *
 * Il part de l'état initial généré et évolue avec les écritures (validation du
 * jeu, nominations, quotas, hypothèses…). Il vit le temps de l'onglet :
 * recharger la page repart de l'état initial, ce qui est voulu pour des
 * démonstrations reproductibles. Chaque écriture est consignée au journal
 * d'audit, comme le fera le serveur réel.
 */

import type { EvenementAuditDetail, ScenarioCalcule, TypeEvenementAudit } from '../components/shared/api'

import type { EtatInitial } from './format'

/** État courant : l'état initial et ce qui n'existe qu'une fois modifié. */
export interface EtatFactice extends EtatInitial {
  /** Le jeu a été supprimé : plus aucune route du jeu ne répond. */
  jeuSupprime: boolean
  /** Scénarios du jeu une fois la liste modifiée ; `null` tant qu'elle est celle du catalogue. */
  scenarios: ScenarioCalcule[] | null
}

let courant: EtatFactice | null = null
let compteur = 0

/** Installe l'état initial (appelé au démarrage des données factices). */
export function initialiserEtat(initial: EtatInitial): void {
  courant = { ...structuredClone(initial), jeuSupprime: false, scenarios: null }
}

/** État courant. */
export function etat(): EtatFactice {
  if (!courant) throw new Error('Données factices non initialisées.')
  return courant
}

/** Horodatage d'une écriture. */
export function maintenant(): string {
  return new Date().toISOString()
}

/** Identifiant unique dans l'onglet. */
export function nouvelId(prefixe: string): string {
  compteur++
  return `${prefixe}-${Date.now().toString(36)}-${compteur}`
}

/** Consigne une écriture au journal d'audit. */
export function auditer(
  type: TypeEvenementAudit,
  action: string,
  resume: string,
  auteur: string | null,
  objet: EvenementAuditDetail['objet'] = null,
  avant: unknown = null,
  apres: unknown = null,
): void {
  etat().audit.push({ id: nouvelId('audit'), type, action, objet, resume, auteur, le: maintenant(), avant, apres })
}
