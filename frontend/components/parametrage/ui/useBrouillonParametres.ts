'use client'

/**
 * Brouillon des règles du moteur.
 *
 * Chaque enregistrement relance diagnostic, scénarios et planification sur le
 * serveur : les règles sont donc modifiées dans une copie locale, puis
 * enregistrées en une seule fois. Tant que rien n'est modifié, le formulaire
 * affiche les règles du serveur.
 */

import { useCallback, useState } from 'react'

import type { EngineSettings, IdJeu } from '@shared/api'

import { useParametres, useParametresDefaut, useRemplacerParametres } from '../application/hooks'
import type { MajParametres } from '../domain/edition'

/** Brouillon et actions d'enregistrement. */
export function useBrouillonParametres(jeu: IdJeu | null) {
  const serveur = useParametres(jeu)
  const defaut = useParametresDefaut()
  const enregistrement = useRemplacerParametres(jeu)
  const [brouillon, setBrouillon] = useState<EngineSettings | null>(null)

  const parametres = brouillon ?? serveur.data ?? null

  const maj = useCallback<MajParametres>(
    transformation => {
      setBrouillon(courant => {
        const base = courant ?? serveur.data
        // Tant que les règles du serveur ne sont pas lues, il n'y a rien à modifier.
        return base ? transformation(base) : courant
      })
    },
    [serveur.data],
  )

  /** Remplace le brouillon par les valeurs par défaut du référentiel (à enregistrer ensuite). */
  const retablirDefaut = useCallback(() => {
    if (defaut.data) setBrouillon(defaut.data)
  }, [defaut.data])

  const enregistrer = useCallback(() => {
    if (!brouillon) return
    enregistrement.mutate(brouillon, { onSuccess: () => setBrouillon(null) })
  }, [brouillon, enregistrement])

  const annuler = useCallback(() => {
    setBrouillon(null)
    enregistrement.reset()
  }, [enregistrement])

  return {
    /** Règles affichées : le brouillon s'il existe, sinon celles du serveur. */
    parametres,
    /** Lecture des règles du serveur, pour les états d'attente et d'erreur. */
    requete: serveur,
    modifie: brouillon !== null,
    maj,
    retablirDefaut,
    enregistrer,
    annuler,
    enregistrement,
  }
}
