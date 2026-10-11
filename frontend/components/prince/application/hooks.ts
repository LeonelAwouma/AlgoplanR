'use client'

/** Cas d'usage du contexte « Fait du Prince » : décisions de la DRH appliquées avant tout calcul. */

import type { CorpsFaitPrince, IdJeu } from '../../shared/api'
import { useEcritureJeu, useLectureJeu } from '../../shared/requetes'
import {
  annulerFaitPrince,
  enregistrerFaitPrince,
  importerFaitsPrince,
  listerFaitsPrince,
  simulerImpactFaitPrince,
} from '../infrastructure/princeApi'

/** Décisions enregistrées et leur sort au regard des données actuelles. */
export function useFaitsPrince(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'faits-prince', [], listerFaitsPrince)
}

/**
 * Effets prévisibles d'une décision, recalculés à chaque changement de la
 * saisie ; rien n'est demandé tant que l'enseignant ou l'école manque.
 */
export function useImpactFaitPrince(jeu: IdJeu | null, saisie: CorpsFaitPrince | null) {
  return useLectureJeu(
    jeu,
    'faits-prince',
    ['impact', saisie],
    (id, signal) => {
      if (saisie === null) throw new Error('Saisie incomplète.')
      return simulerImpactFaitPrince(id, saisie, signal)
    },
    { active: saisie !== null },
  )
}

/** Enregistre une décision ; les effectifs changent, tout ce qui en dépend est recalculé. */
export function useEnregistrerFaitPrince(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'effectifs', (id, corps: CorpsFaitPrince) => enregistrerFaitPrince(id, corps))
}

/** Importe un lot de décisions depuis un classeur. */
export function useImporterFaitsPrince(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'effectifs', (id, { fichier, feuille }: { fichier: Blob; feuille?: string }) =>
    importerFaitsPrince(id, fichier, feuille),
  )
}

/** Annule une décision. */
export function useAnnulerFaitPrince(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'effectifs', (id, fait: string) => annulerFaitPrince(id, fait))
}
