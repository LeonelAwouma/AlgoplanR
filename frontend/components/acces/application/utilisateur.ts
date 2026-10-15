'use client'

/**
 * Personne connectée, transmise aux écrans par la porte d'accès.
 *
 * Elle ne sert qu'à adapter l'affichage (raccourcis, menus) : le serveur
 * applique lui-même le périmètre du compte à chaque requête.
 */

import { createContext, useContext } from 'react'

import type { SessionAcces } from '../domain/types'

export const ContexteUtilisateur = createContext<SessionAcces | null>(null)

/** Personne connectée ; `null` hors de la porte d'accès (tests, écrans d'accès). */
export function useUtilisateur(): SessionAcces | null {
  return useContext(ContexteUtilisateur)
}
