'use client'

/**
 * Scénario affiché dans les pages de résultats.
 *
 * L'utilisateur peut en choisir un dans la barre de filtres. Sans choix
 * explicite, on affiche le scénario retenu pour la planification, à défaut le
 * scénario départemental de référence, à défaut le premier scénario calculé.
 * Le choix explicite « situation actuelle » (chaîne vide) n'affiche aucun résultat.
 */

import { useJeu } from '../../donnees'
import type { ScenarioCalcule } from '../../shared/api'
import { idScenarioGeographique } from '../../shared/kernel'
import { useSession } from '../../shared/session'
import { useScenarios } from './hooks'

/** Valeur de la session qui demande explicitement la situation actuelle, sans simulation. */
export const SANS_SCENARIO = ''

/** Scénario affiché et liste des scénarios du jeu. */
export interface ScenarioAffiche {
  /** Identifiant du scénario affiché, `null` si aucun (aucun calcul, ou situation actuelle demandée). */
  scenario: string | null
  /** Le scénario affiché, avec son état de calcul. */
  detail: ScenarioCalcule | null
  /** Scénarios du jeu ayant un résultat. */
  calcules: ScenarioCalcule[]
  /** Vrai tant que la liste des scénarios n'est pas connue. */
  enChargement: boolean
}

/** Résout le scénario affiché à partir du choix de la session et des scénarios calculés. */
export function useScenarioAffiche(): ScenarioAffiche {
  const { jeu, scenarioChoisi } = useSession()
  const scenarios = useScenarios(jeu)
  const meta = useJeu(jeu)

  const calcules = (scenarios.data ?? []).filter(s => s.calcule)
  const existe = (id: string | null | undefined): id is string => !!id && calcules.some(s => s.scenario.id === id)

  const retenu = meta.data?.scenarioRetenuId ?? null
  const departemental = idScenarioGeographique('departement')

  let scenario: string | null = null
  if (scenarioChoisi === SANS_SCENARIO) scenario = null
  else if (existe(scenarioChoisi)) scenario = scenarioChoisi
  else if (existe(retenu)) scenario = retenu
  else if (existe(departemental)) scenario = departemental
  else scenario = calcules[0]?.scenario.id ?? null

  return {
    scenario,
    detail: calcules.find(s => s.scenario.id === scenario) ?? null,
    calcules,
    enChargement: scenarios.isPending,
  }
}
