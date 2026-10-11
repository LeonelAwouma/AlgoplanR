'use client'

/** Cas d'usage du contexte « Recrutement » : candidats au concours (§3.8). */

import type { IdJeu } from '../../shared/api'
import { useEcritureJeu, useLectureJeu } from '../../shared/requetes'
import { importerRecrues, listerRecrues, supprimerRecrues } from '../infrastructure/recrutementApi'

/** Recrues importées. */
export function useRecrues(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'recrues', [], listerRecrues)
}

/** Importe la liste des candidats ; elle remplace la précédente et relance les scénarios. */
export function useImporterRecrues(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'effectifs', (id, { fichier, feuille }: { fichier: Blob; feuille?: string }) =>
    importerRecrues(id, fichier, feuille),
  )
}

/** Retire toutes les recrues. */
export function useSupprimerRecrues(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'effectifs', (id, _aucun: void) => supprimerRecrues(id))
}
