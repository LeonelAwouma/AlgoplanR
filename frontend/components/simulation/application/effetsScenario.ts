'use client'

/**
 * Effet du scénario affiché sur chaque école : enseignants reçus, enseignants
 * sortants et postes restés vacants. Le diagnostic des besoins décrit la
 * situation de départ ; ces trois nombres montrent ce que le scénario en fait.
 */

import { useMemo } from 'react'

import type { IdJeu, TerritorySelection } from '../../shared/api'
import { useResultat } from './hooks'

export interface EffetEcole {
  recus: number
  sortants: number
  restants: number
}

const AUCUNE_SELECTION: TerritorySelection = { region: null, departement: null, commune: null }
const SANS_EFFET: EffetEcole = { recus: 0, sortants: 0, restants: 0 }

export interface EffetsScenario {
  /** Effet sur une école ; zéro partout pour une école que le scénario ne touche pas. */
  effetDe: (ecole: string) => EffetEcole
  /** Vrai tant que le résultat du scénario n'est pas chargé. */
  enChargement: boolean
  erreur: boolean
}

/** Effets du scénario sur les écoles ; sans scénario, aucun effet n'est calculé. */
export function useEffetsScenario(jeu: IdJeu | null, scenario: string | null): EffetsScenario {
  const resultat = useResultat(jeu, scenario, AUCUNE_SELECTION)
  const parEcole = useMemo(() => {
    const m = new Map<string, EffetEcole>()
    const effet = (id: string) => {
      let e = m.get(id)
      if (!e) m.set(id, (e = { recus: 0, sortants: 0, restants: 0 }))
      return e
    }
    const r = resultat.data
    if (r) {
      for (const a of r.assignments) {
        effet(a.schoolDestinationId).recus += 1
        effet(a.schoolOrigineId).sortants += 1
      }
      for (const p of r.uncoveredPosts) effet(p.schoolId).restants += 1
    }
    return m
  }, [resultat.data])

  return {
    effetDe: ecole => parEcole.get(ecole) ?? SANS_EFFET,
    enChargement: scenario != null && resultat.isPending,
    erreur: scenario != null && resultat.isError,
  }
}
