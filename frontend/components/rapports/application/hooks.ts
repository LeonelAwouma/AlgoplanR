'use client'

/**
 * Cas d'usage du contexte « Rapports » : rapport de décision du périmètre filtré, et synthèse territoriale
 * (lot 4) — indicateurs calculés par le serveur, déclenchement des exports Excel/Word.
 */

import { useMutation } from '@tanstack/react-query'

import type { FiltresRapportTerritorial, GlobalFilters, IdJeu, OptionsExportTerritorial } from '../../shared/api'
import { useLectureJeu } from '../../shared/requetes'
import { exporterRapportTerritorial, lireRapport, lireRapportTerritorial } from '../infrastructure/rapportsApi'

/** Rapport de décision ; le scénario retenu par défaut. */
export function useRapport(jeu: IdJeu | null, filtres: GlobalFilters, scenario: string | null) {
  return useLectureJeu(jeu, 'rapport', [filtres, scenario], (id, signal) => lireRapport(id, filtres, scenario, signal))
}

/** Synthèse territoriale du périmètre : nœud courant et ses enfants, recalculés par le serveur. */
export function useRapportTerritorial(jeu: IdJeu | null, filtres: FiltresRapportTerritorial) {
  return useLectureJeu(jeu, 'rapport-territorial', [filtres], (id, signal) =>
    lireRapportTerritorial(id, filtres, signal),
  )
}

/**
 * Déclenche un export Excel ou Word de la synthèse territoriale. Peut rester « en cours » plusieurs minutes
 * pour un export national complet : aucun délai n'est imposé, l'écran doit l'annoncer.
 */
export function useExporterRapportTerritorial(jeu: IdJeu | null) {
  return useMutation({
    mutationFn: ({ filtres, options }: { filtres: FiltresRapportTerritorial; options: OptionsExportTerritorial }) => {
      if (jeu === null) return Promise.reject(new Error('Aucun jeu de données chargé.'))
      return exporterRapportTerritorial(jeu, filtres, options)
    },
  })
}
