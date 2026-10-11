'use client'

/** Cas d'usage du contexte « Rapports » : rapport de décision du périmètre filtré. */

import type { GlobalFilters, IdJeu } from '../../shared/api'
import { useLectureJeu } from '../../shared/requetes'
import { lireRapport } from '../infrastructure/rapportsApi'

/** Rapport de décision ; le scénario retenu par défaut. */
export function useRapport(jeu: IdJeu | null, filtres: GlobalFilters, scenario: string | null) {
  return useLectureJeu(jeu, 'rapport', [filtres, scenario], (id, signal) => lireRapport(id, filtres, scenario, signal))
}
