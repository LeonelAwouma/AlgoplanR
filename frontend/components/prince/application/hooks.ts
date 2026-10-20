'use client'

/** Cas d'usage du contexte « Fait du Prince » : décisions de la DRH appliquées avant tout calcul. */

import { useMutation } from '@tanstack/react-query'

import type { BaseApresPrince, CorpsFaitPrince, DemandePage, FiltresBaseApresPrince, IdJeu } from '../../shared/api'
import { useEcritureJeu, useLectureJeu } from '../../shared/requetes'
import {
  apercevoirImportFaitsPrince,
  annulerFaitPrince,
  enregistrerFaitPrince,
  importerFaitsPrince,
  lireApplicationPrince,
  listerBaseApresPrince,
  listerFaitsPrince,
  simulerImpactFaitPrince,
  telechargerBaseApresPrince,
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

/** Faits actifs appliqués aux bases importées : résumé, avant / après, décisions, écarts d'effectifs. */
export function useApplicationPrince(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'faits-prince', ['application'], lireApplicationPrince)
}

/**
 * Essai à blanc d'un fichier. C'est un POST, mais il n'enregistre rien : aucune donnée en cache ne devient
 * obsolète.
 */
export function useApercuImportPrince(jeu: IdJeu | null) {
  return useMutation({
    mutationFn: ({ fichier, feuille }: { fichier: Blob; feuille?: string }) => {
      if (jeu === null) return Promise.reject(new Error('Aucun jeu de données chargé.'))
      return apercevoirImportFaitsPrince(jeu, fichier, feuille)
    },
  })
}

/** Une page d'une base « après Prince » (établissements, enseignants ou journal des décisions). */
export function useBaseApresPrince<B extends BaseApresPrince>(
  jeu: IdJeu | null,
  base: B,
  filtres: FiltresBaseApresPrince,
  page: DemandePage,
) {
  return useLectureJeu(jeu, 'faits-prince', ['base', base, filtres, page], (id, signal) =>
    listerBaseApresPrince(id, base, filtres, page, signal),
  )
}

/** Télécharge le classeur d'une base « après Prince ». */
export function useTelechargerBaseApresPrince(jeu: IdJeu | null) {
  return useMutation({
    mutationFn: ({ base, filtres }: { base: BaseApresPrince; filtres: FiltresBaseApresPrince }) => {
      if (jeu === null) return Promise.reject(new Error('Aucun jeu de données chargé.'))
      return telechargerBaseApresPrince(jeu, base, filtres)
    },
  })
}
