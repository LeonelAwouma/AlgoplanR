/**
 * Verrouillage après inactivité : calculs purs, sans minuterie ni DOM.
 *
 * Le serveur ferme la session après 20 minutes sans activité ; l'interface
 * affiche un avertissement deux minutes avant, à partir des échéances renvoyées
 * par le serveur. L'écart d'horloge entre le poste et le serveur est corrigé :
 * c'est l'échéance du serveur qui compte.
 */

import type { EcheancesSession } from './types'

/** Un signal d'activité au plus par minute, tant que la personne travaille. */
export const INTERVALLE_SIGNAL_MS = 60_000

export interface Echeance {
  /** Fin de la session en heure du poste (ms). */
  expireMs: number
  /** Début de l'avertissement en heure du poste (ms). */
  avertissementMs: number
}

export type PhaseInactivite = 'active' | 'avertissement' | 'expiree'

/** Échéance locale, recalée sur l'heure du serveur au moment où la réponse a été reçue. */
export function echeanceDepuis(session: EcheancesSession, recueLeMs: number): Echeance {
  const decalage = recueLeMs - Date.parse(session.maintenant)
  const expireMs = Date.parse(session.expire_inactivite_le) + decalage
  return { expireMs, avertissementMs: expireMs - session.avertissement_minutes * 60_000 }
}

export function phaseInactivite(e: Echeance, maintenantMs: number): PhaseInactivite {
  if (maintenantMs >= e.expireMs) return 'expiree'
  if (maintenantMs >= e.avertissementMs) return 'avertissement'
  return 'active'
}

/** Secondes avant le verrouillage, jamais négatives. */
export function secondesRestantes(e: Echeance, maintenantMs: number): number {
  return Math.max(0, Math.ceil((e.expireMs - maintenantMs) / 1000))
}

/** « 1:05 » : minutes et secondes restantes. */
export function formaterDuree(secondes: number): string {
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`
}

/** Vrai s'il faut signaler au serveur une activité survenue depuis le dernier signal. */
export function doitSignaler(dernierSignalMs: number, derniereActiviteMs: number, maintenantMs: number): boolean {
  return derniereActiviteMs > dernierSignalMs && maintenantMs - dernierSignalMs >= INTERVALLE_SIGNAL_MS
}
