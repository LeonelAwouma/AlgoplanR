/**
 * Contrôle d'accès : qui peut ouvrir l'application, et sur quel périmètre.
 *
 * Deux rôles. Le DRH a accès à tout et administre les accès. Un délégué régional
 * n'entre qu'avec le code que le DRH lui a remis, pour une région précise, et
 * seulement après que le DRH a validé son entrée : tant que ce n'est pas fait,
 * sa demande reste « en attente de validation ».
 */

import type { RegionCameroun } from '../../shared/kernel/regions'

/** Secret conservé sous forme d'empreinte : ni le code ni le mot de passe ne sont jamais stockés en clair. */
export interface SecretHache {
  sel: string
  empreinte: string
}

/** Code d'accès remis par le DRH au délégué d'une région. Un seul code actif par région. */
export interface CodeAcces {
  id: string
  region: RegionCameroun
  /** Nom du délégué à qui le code a été remis. */
  titulaire: string
  secret: SecretHache
  creeLe: string
  /** Renseigné quand le DRH a retiré le code : il ne permet alors plus d'entrer. */
  revoqueLe: string | null
}

export type StatutEntree = 'attente' | 'validee' | 'refusee'

/** Demande d'entrée d'un délégué : créée quand il saisit un code valide, tranchée par le DRH. */
export interface DemandeEntree {
  id: string
  codeId: string
  region: RegionCameroun
  titulaire: string
  statut: StatutEntree
  demandeLe: string
  decideLe: string | null
}

/** Compteur d'essais infructueux par région, pour ralentir la recherche d'un code au hasard. */
export interface EchecsConnexion {
  nombre: number
  dernierLe: string
}

export interface RegistreAcces {
  version: 1
  /** Mot de passe du DRH, `null` tant que l'application n'a pas été initialisée. */
  drh: SecretHache | null
  codes: CodeAcces[]
  demandes: DemandeEntree[]
  echecs: Partial<Record<RegionCameroun, EchecsConnexion>>
}

/** Personne connectée pour la session en cours. La session ne survit pas à la fermeture. */
export type SessionAcces = { role: 'drh' } | { role: 'delegue'; region: RegionCameroun; titulaire: string }

/** Issue d'une tentative d'entrée d'un délégué. */
export type ResultatEntree =
  | { type: 'refus'; motif: string }
  | { type: 'attente'; demande: DemandeEntree }
  | { type: 'refusee'; demande: DemandeEntree }
  | { type: 'validee'; demande: DemandeEntree }
