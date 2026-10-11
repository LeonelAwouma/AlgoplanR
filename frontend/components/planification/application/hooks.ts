'use client'

/**
 * Cas d'usage du contexte « Planification » : hypothèses, tableau sur cinq ans
 * et ses ventilations, versions, quotas, indicateurs.
 */

import { useMutation, useQuery } from '@tanstack/react-query'

import {
  clesGlobales,
  type AnneePlan,
  type CorpsAjustementQuota,
  type CorpsHypotheses,
  type CorpsValidationQuotas,
  type DemandePage,
  type FiltresPerimetre,
  type IdJeu,
} from '../../shared/api'
import { useEcritureJeu, useLectureJeu } from '../../shared/requetes'
import {
  ajusterQuota,
  comparerVersionsPlanification,
  estimerAttrition,
  lireDocumentationHypotheses,
  lireEtatPlanification,
  lireEvolutionIndicateurs,
  lireFiabilite,
  lireHistoriqueHypotheses,
  lireHistoriqueQuotas,
  lireHypotheses,
  lireHypothesesDefaut,
  lireIndicateurs,
  lirePlanDeparts,
  lireTableauPlanification,
  lireVentilationSousSystemes,
  lireVentilationTerritoriale,
  lireVersionPlanification,
  listerPlanificationEcoles,
  listerQuotas,
  listerVersionsPlanification,
  modifierHypotheses,
  recalculerPlanification,
  validerQuotas,
  type RequetePlanification,
} from '../infrastructure/planificationApi'

// --- Hypothèses ---------------------------------------------------------------------------------

/** Hypothèses par défaut ; elles ne changent pas pendant la session. */
export function useHypothesesDefaut() {
  return useQuery({
    queryKey: clesGlobales.hypothesesDefaut(),
    queryFn: ({ signal }) => lireHypothesesDefaut(signal),
    staleTime: Infinity,
  })
}

/** Hypothèses en vigueur. */
export function useHypotheses(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'hypotheses', [], lireHypotheses)
}

/** Fiche lisible des hypothèses. */
export function useDocumentationHypotheses(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'hypotheses', ['documentation'], lireDocumentationHypotheses)
}

/** Versions successives des hypothèses. */
export function useHistoriqueHypotheses(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'hypotheses', ['historique'], lireHistoriqueHypotheses)
}

/** Remplace les hypothèses ; la planification est recalculée. */
export function useModifierHypotheses(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'hypotheses', (id, corps: CorpsHypotheses) => modifierHypotheses(id, corps))
}

/**
 * Estimation d'un taux d'attrition. C'est un POST, mais il n'enregistre rien :
 * aucune donnée en cache ne devient obsolète.
 */
export function useEstimerAttrition(jeu: IdJeu | null) {
  return useMutation({
    mutationFn: () => {
      if (jeu === null) return Promise.reject(new Error('Aucun jeu de données chargé.'))
      return estimerAttrition(jeu)
    },
  })
}

// --- Tableau et ventilations ---------------------------------------------------------------------

/** Tableau N+1 → N+5 du périmètre. */
export function useTableauPlanification(jeu: IdJeu | null, requete: RequetePlanification = {}) {
  return useLectureJeu(jeu, 'planification', ['tableau', requete], (id, signal) =>
    lireTableauPlanification(id, requete, signal),
  )
}

/** Ventilation par territoire enfant. */
export function useVentilationTerritoriale(jeu: IdJeu | null, requete: RequetePlanification = {}) {
  return useLectureJeu(jeu, 'planification', ['territoires', requete], (id, signal) =>
    lireVentilationTerritoriale(id, requete, signal),
  )
}

/** Ventilation par sous-système. */
export function useVentilationSousSystemes(jeu: IdJeu | null, requete: RequetePlanification = {}) {
  return useLectureJeu(jeu, 'planification', ['sous-systemes', requete], (id, signal) =>
    lireVentilationSousSystemes(id, requete, signal),
  )
}

/** Projection école par école, paginée. */
export function usePlanificationEcoles(jeu: IdJeu | null, requete: RequetePlanification = {}, page: DemandePage = {}) {
  return useLectureJeu(jeu, 'planification', ['ecoles', requete, page], (id, signal) =>
    listerPlanificationEcoles(id, requete, page, signal),
  )
}

/** Plan des départs : retraites nominatives et attrition. */
export function usePlanDeparts(jeu: IdJeu | null, requete: RequetePlanification = {}) {
  return useLectureJeu(jeu, 'planification', ['departs', requete], (id, signal) => lirePlanDeparts(id, requete, signal))
}

/** Disponibilité des données qui fondent les projections. */
export function useFiabilite(jeu: IdJeu | null, requete: RequetePlanification = {}) {
  return useLectureJeu(jeu, 'planification', ['fiabilite', requete], (id, signal) => lireFiabilite(id, requete, signal))
}

/** État du dernier calcul. */
export function useEtatPlanification(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'planification', ['etat'], lireEtatPlanification)
}

/** Force un recalcul de la planification. */
export function useRecalculerPlanification(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'recalcul', (id, _aucun: void) => recalculerPlanification(id))
}

// --- Versions -------------------------------------------------------------------------------------

/** Versions conservées. */
export function useVersionsPlanification(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'planification', ['versions'], listerVersionsPlanification)
}

/** Une version ; rien n'est demandé sans version choisie. */
export function useVersionPlanification(jeu: IdJeu | null, version: number | null) {
  return useLectureJeu(
    jeu,
    'planification',
    ['version', version],
    (id, signal) => lireVersionPlanification(id, version ?? 0, signal),
    { active: version !== null },
  )
}

/** Écarts entre deux versions ; rien n'est demandé tant que les deux ne sont pas choisies. */
export function useComparaisonVersions(jeu: IdJeu | null, de: number | null, a: number | null) {
  return useLectureJeu(
    jeu,
    'planification',
    ['comparaison', de, a],
    (id, signal) => comparerVersionsPlanification(id, de ?? 0, a ?? 0, signal),
    { active: de !== null && a !== null && de !== a },
  )
}

// --- Quotas -----------------------------------------------------------------------------------------

/** Quotas calculés et retenus. */
export function useQuotas(jeu: IdJeu | null, requete: RequetePlanification = {}) {
  return useLectureJeu(jeu, 'quotas', [requete], (id, signal) => listerQuotas(id, requete, signal))
}

/** Historique des calculs, ajustements et validations. */
export function useHistoriqueQuotas(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'quotas', ['historique'], lireHistoriqueQuotas)
}

/** Ajuste un quota, avec motif. */
export function useAjusterQuota(jeu: IdJeu | null) {
  return useEcritureJeu(
    jeu,
    'quotas',
    (id, { annee, territoire, corps }: { annee: AnneePlan; territoire: string; corps: CorpsAjustementQuota }) =>
      ajusterQuota(id, annee, territoire, corps),
  )
}

/** Valide et fige les quotas d'une année. */
export function useValiderQuotas(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'quotas', (id, corps: CorpsValidationQuotas) => validerQuotas(id, corps))
}

// --- Indicateurs --------------------------------------------------------------------------------------

/** Indicateurs de suivi du périmètre. */
export function useIndicateurs(jeu: IdJeu | null, perimetre: FiltresPerimetre = {}) {
  return useLectureJeu(jeu, 'indicateurs', [perimetre], (id, signal) => lireIndicateurs(id, perimetre, signal))
}

/** Évolution des indicateurs d'une version à l'autre. */
export function useEvolutionIndicateurs(jeu: IdJeu | null, perimetre: FiltresPerimetre = {}) {
  return useLectureJeu(jeu, 'indicateurs', ['evolution', perimetre], (id, signal) =>
    lireEvolutionIndicateurs(id, perimetre, signal),
  )
}

/** Types de requête utiles à l'interface. */
export type { RequetePlanification } from '../infrastructure/planificationApi'
