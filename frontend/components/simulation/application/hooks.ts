'use client'

/**
 * Cas d'usage du contexte « Simulation » : scénarios, résultats et sections,
 * flux, comparaison, choix du scénario retenu.
 *
 * Les lectures d'un scénario ne partent que si un scénario est choisi
 * (`scenario` non nul) : l'interface peut appeler ces hooks sans condition.
 */

import { useQuery } from '@tanstack/react-query'

import {
  clesGlobales,
  type CorpsCreationScenario,
  type DemandePage,
  type IdJeu,
  type IssueCandidature,
  type TerritorySelection,
} from '../../shared/api'
import { useEcritureJeu, useLectureJeu } from '../../shared/requetes'
import {
  calculerScenariosDeBase,
  creerScenario,
  executerScenario,
  expliquerAffectation,
  lireComparaison,
  lireFlux,
  lireInvariants,
  lireJournal,
  lireProjections,
  lireRecrutes,
  lireResultat,
  lireScenario,
  lireVivierScenario,
  listerAffectations,
  listerCandidatures,
  listerCombinaisons,
  listerNonAffectes,
  listerPostes,
  listerPostesNonCouverts,
  listerPresets,
  listerScenarios,
  retenirScenario,
  supprimerScenario,
  type FiltresAffectations,
  type RefScenario,
} from '../infrastructure/simulationApi'

/**
 * Lecture d'une section d'un scénario : clé `['jeu', id, 'scenarios', scenario, section, …]`,
 * pour qu'une relance du scénario invalide toutes ses sections d'un coup.
 */
function useSectionScenario<T>(
  jeu: IdJeu | null,
  scenario: string | null,
  section: string,
  details: readonly unknown[],
  lire: (ref: RefScenario, signal: AbortSignal) => Promise<T>,
  active = true,
) {
  return useLectureJeu(
    jeu,
    'scenarios',
    [scenario, section, ...details],
    (id, signal) => lire({ jeu: id, scenario: scenario ?? '' }, signal),
    { active: active && scenario !== null },
  )
}

// --- Scénarios --------------------------------------------------------------------------------

/** Modèles de scénarios, avec leur disponibilité pour le jeu. */
export function usePresets(jeu: IdJeu | null) {
  return useQuery({ queryKey: clesGlobales.presets(jeu), queryFn: ({ signal }) => listerPresets(jeu, signal) })
}

/** Scénarios du jeu et état de leur calcul. */
export function useScenarios(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'scenarios', ['liste'], listerScenarios)
}

/** Un scénario et l'état de son calcul. */
export function useScenario(jeu: IdJeu | null, scenario: string | null) {
  return useSectionScenario(jeu, scenario, 'detail', [], lireScenario)
}

/** Crée un scénario et lance son calcul. */
export function useCreerScenario(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'scenarios', (id, corps: CorpsCreationScenario) => creerScenario(id, corps))
}

/** Calcule les trois scénarios géographiques de référence. */
export function useCalculerScenariosDeBase(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'scenarios', (id, _aucun: void) => calculerScenariosDeBase(id))
}

/** Relance un scénario avec ses paramètres figés. */
export function useExecuterScenario(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'scenarios', (id, scenario: string) => executerScenario({ jeu: id, scenario }))
}

/** Supprime un scénario personnalisé. */
export function useSupprimerScenario(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'scenarios', (id, scenario: string) => supprimerScenario({ jeu: id, scenario }))
}

/** Retient un scénario pour la planification sur cinq ans. */
export function useRetenirScenario(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'scenario-retenu', (id, scenario: string) => retenirScenario(id, scenario))
}

// --- Résultat et sections ----------------------------------------------------------------------

/** Résultat complet du scénario, restreint au territoire sélectionné. */
export function useResultat(jeu: IdJeu | null, scenario: string | null, selection: TerritorySelection) {
  return useSectionScenario(jeu, scenario, 'resultat', [selection], (ref, signal) =>
    lireResultat(ref, selection, signal),
  )
}

/** Propositions d'affectation, paginées et filtrées. */
export function useAffectations(jeu: IdJeu | null, scenario: string | null, filtres: FiltresAffectations = {}) {
  return useSectionScenario(jeu, scenario, 'affectations', [filtres], (ref, signal) =>
    listerAffectations(ref, filtres, signal),
  )
}

/** « Pourquoi cette proposition ? » ; rien n'est demandé sans enseignant choisi. */
export function useExplication(jeu: IdJeu | null, scenario: string | null, matricule: string | null) {
  return useSectionScenario(
    jeu,
    scenario,
    'explication',
    [matricule],
    (ref, signal) => expliquerAffectation(ref, matricule ?? '', signal),
    matricule !== null,
  )
}

/** Enseignants du vivier restés sans affectation. */
export function useNonAffectes(jeu: IdJeu | null, scenario: string | null, page: DemandePage = {}) {
  return useSectionScenario(jeu, scenario, 'non-affectes', [page], (ref, signal) =>
    listerNonAffectes(ref, page, signal),
  )
}

/** Vivier de redéploiement du scénario. */
export function useVivierScenario(jeu: IdJeu | null, scenario: string | null) {
  return useSectionScenario(jeu, scenario, 'vivier', [], lireVivierScenario)
}

/** Postes ouverts, classés par priorité. */
export function usePostes(
  jeu: IdJeu | null,
  scenario: string | null,
  options: DemandePage & { pourvu?: boolean; ecole?: string } = {},
) {
  return useSectionScenario(jeu, scenario, 'postes', [options], (ref, signal) => listerPostes(ref, options, signal))
}

/** Écoles restées sans maître, avec les combinaisons proposées. */
export function usePostesNonCouverts(jeu: IdJeu | null, scenario: string | null) {
  return useSectionScenario(jeu, scenario, 'postes-non-couverts', [], listerPostesNonCouverts)
}

/** Synthèse des vœux. */
export function useCandidatures(
  jeu: IdJeu | null,
  scenario: string | null,
  options: DemandePage & { issue?: IssueCandidature; recherche?: string } = {},
) {
  return useSectionScenario(jeu, scenario, 'candidatures', [options], (ref, signal) =>
    listerCandidatures(ref, options, signal),
  )
}

/** Combinaisons soumises à la commission. */
export function useCombinaisons(jeu: IdJeu | null, scenario: string | null) {
  return useSectionScenario(jeu, scenario, 'combinaisons', [], listerCombinaisons)
}

/** Journal d'exécution. */
export function useJournalSimulation(jeu: IdJeu | null, scenario: string | null) {
  return useSectionScenario(jeu, scenario, 'journal', [], lireJournal)
}

/** Contrôles métier du résultat. */
export function useInvariants(jeu: IdJeu | null, scenario: string | null) {
  return useSectionScenario(jeu, scenario, 'invariants', [], lireInvariants)
}

/** Projection N+1 → N+3 du scénario (remplacée par la planification sur cinq ans). */
export function useProjectionsScenario(jeu: IdJeu | null, scenario: string | null) {
  return useSectionScenario(jeu, scenario, 'projections', [], lireProjections)
}

/** Déploiement des recrues du scénario. */
export function useRecrutes(jeu: IdJeu | null, scenario: string | null) {
  return useSectionScenario(jeu, scenario, 'recrutes', [], lireRecrutes)
}

/** Bilan des mouvements du territoire sélectionné. */
export function useFlux(jeu: IdJeu | null, scenario: string | null, selection: TerritorySelection) {
  return useSectionScenario(jeu, scenario, 'flux', [selection], (ref, signal) => lireFlux(ref, selection, signal))
}

/** Comparaison des scénarios calculés sur le territoire sélectionné. */
export function useComparaison(jeu: IdJeu | null, selection: TerritorySelection) {
  return useLectureJeu(jeu, 'comparaison', [selection], (id, signal) => lireComparaison(id, selection, signal))
}

/** Types de requête utiles à l'interface. */
export type { FiltresAffectations, RefScenario } from '../infrastructure/simulationApi'
