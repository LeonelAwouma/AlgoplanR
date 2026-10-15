'use client'

/** Cas d'usage du contexte « Diagnostic » : lecture du Moteur A sur le périmètre filtré. */

import type { GlobalFilters, IdJeu, TerritorySelection } from '../../shared/api'
import { useLectureJeu } from '../../shared/requetes'
import {
  lireDiagnostic,
  lireOptionsFiltres,
  lirePriorites,
  lireSynthese,
  lireVueTerritoriale,
} from '../infrastructure/diagnosticApi'

/**
 * Diagnostic du périmètre filtré.
 *
 * @param sansPrince diagnostic des données importées, sans les décisions de la DRH.
 */
export function useDiagnostic(jeu: IdJeu | null, filtres: GlobalFilters, sansPrince = false) {
  return useLectureJeu(jeu, 'diagnostic', [filtres, sansPrince], (id, signal) =>
    lireDiagnostic(id, filtres, sansPrince, signal),
  )
}

/** Nœud territorial courant, ses enfants et leurs mouvements dans le scénario affiché. */
export function useVueTerritoriale(jeu: IdJeu | null, filtres: GlobalFilters, scenario: string | null) {
  return useLectureJeu(jeu, 'territoires', [filtres, scenario], (id, signal) =>
    lireVueTerritoriale(id, filtres, scenario, signal),
  )
}

/** Options des menus de filtres pour la sélection territoriale courante. */
export function useOptionsFiltres(jeu: IdJeu | null, selection: TerritorySelection) {
  return useLectureJeu(jeu, 'territoires', ['options', selection], (id, signal) =>
    lireOptionsFiltres(id, selection, signal),
  )
}

/** Écoles en déficit classées par priorité ; toutes si `limite` est absent. */
export function usePriorites(jeu: IdJeu | null, filtres: GlobalFilters, limite?: number) {
  return useLectureJeu(jeu, 'priorites', [filtres, limite ?? null], (id, signal) =>
    lirePriorites(id, filtres, limite, signal),
  )
}

/** Synthèse narrative du périmètre, complétée par le scénario actif s'il y en a un. */
export function useSynthese(jeu: IdJeu | null, filtres: GlobalFilters, scenario: string | null) {
  return useLectureJeu(jeu, 'synthese', [filtres, scenario], (id, signal) =>
    lireSynthese(id, filtres, scenario, signal),
  )
}
