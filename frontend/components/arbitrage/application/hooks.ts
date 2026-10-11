'use client'

/** Cas d'usage du contexte « Arbitrage » : décisions des commissions (§3.10). */

import type { CorpsDecisionArbitrage, IdJeu } from '../../shared/api'
import { useEcritureJeu, useLectureJeu } from '../../shared/requetes'
import { annulerArbitrage, enregistrerArbitrage, listerArbitrages } from '../infrastructure/arbitrageApi'

/** Décisions des commissions et leur application aux données. */
export function useArbitrages(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'arbitrages', [], listerArbitrages)
}

/** Enregistre une décision ; les scénarios sont recalculés avec elle. */
export function useEnregistrerArbitrage(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'effectifs', (id, corps: CorpsDecisionArbitrage) => enregistrerArbitrage(id, corps))
}

/** Annule une décision. */
export function useAnnulerArbitrage(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'effectifs', (id, arbitrage: string) => annulerArbitrage(id, arbitrage))
}
