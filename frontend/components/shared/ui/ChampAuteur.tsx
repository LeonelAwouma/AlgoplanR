'use client'

/**
 * Nom de l'agent qui signe une décision.
 *
 * Tant que le module d'accès reste désactivé, l'application ne sait pas qui
 * agit : chaque décision journalisée (validation, nomination, quota…) porte
 * donc le nom saisi ici. Il est retenu dans les préférences pour ne pas avoir
 * à le ressaisir.
 */

import { useCallback, useEffect, useId, useState } from 'react'

import { ecrirePreference, lirePreference } from '@shared/session'

/** Nom de l'auteur des décisions, conservé d'une session à l'autre. */
export function useAuteur(): [string, (auteur: string) => void] {
  const [auteur, setAuteur] = useState('')

  // Lu après le premier rendu : le stockage local n'existe pas pendant la génération statique.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation unique avec le stockage local
    setAuteur(lirePreference<string>('auteur', ''))
  }, [])

  const changer = useCallback((valeur: string) => {
    setAuteur(valeur)
    ecrirePreference('auteur', valeur.trim() === '' ? null : valeur)
  }, [])

  return [auteur, changer]
}

export interface ProprietesChampAuteur {
  auteur: string
  onChange: (auteur: string) => void
}

/** Champ « Décision prise par ». */
export function ChampAuteur({ auteur, onChange }: ProprietesChampAuteur) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>Décision prise par</label>
      <input
        id={id}
        type="text"
        value={auteur}
        onChange={e => onChange(e.target.value)}
        placeholder="Nom et fonction de l’agent"
        autoComplete="name"
      />
    </div>
  )
}
