'use client'

/** Cas d'usage du contexte « Paramétrage » : lecture et modification des règles du moteur. */

import { useQuery } from '@tanstack/react-query'

import { clesGlobales, type EngineSettings, type IdJeu, type MiseAJourParametres } from '../../shared/api'
import { useEcritureJeu, useLectureJeu } from '../../shared/requetes'
import {
  importerParametres,
  lireParametres,
  lireParametresDefaut,
  lireSituationsFamiliales,
  modifierParametres,
  remplacerParametres,
} from '../infrastructure/parametrageApi'

/** Règles par défaut du référentiel ; elles ne changent pas pendant la session. */
export function useParametresDefaut() {
  return useQuery({
    queryKey: clesGlobales.parametresDefaut(),
    queryFn: ({ signal }) => lireParametresDefaut(signal),
    staleTime: Infinity,
  })
}

/** Règles en vigueur pour le jeu. */
export function useParametres(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'parametres', [], lireParametres)
}

/** Modifie une partie des règles ; diagnostic, scénarios et planification sont recalculés. */
export function useModifierParametres(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'parametres', (id, miseAJour: MiseAJourParametres) => modifierParametres(id, miseAJour))
}

/** Remplace toutes les règles, par exemple pour revenir aux valeurs par défaut. */
export function useRemplacerParametres(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'parametres', (id, parametres: EngineSettings) => remplacerParametres(id, parametres))
}

/** Importe des règles exportées en JSON. */
export function useImporterParametres(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'parametres', (id, contenu: unknown) => importerParametres(id, contenu))
}

/** Situations familiales du fichier, reconnues ou non par le barème. */
export function useSituationsFamiliales(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'situations', [], lireSituationsFamiliales)
}
