/**
 * Accès à l'API du contexte « Arbitrage » : décisions des commissions
 * régionales et centrale sur les propositions du moteur (§3.10).
 *
 * Routes :
 *   GET jeux/{jeu}/arbitrages/   POST jeux/{jeu}/arbitrages/   DELETE jeux/{jeu}/arbitrages/{arbitrage}/
 *
 * Les décisions sont appliquées avant l'algorithme : chaque enregistrement ou
 * annulation relance le calcul des scénarios côté serveur.
 */

import {
  appeler,
  route,
  type CorpsDecisionArbitrage,
  type DecisionArbitrage,
  type DecisionArbitrageAppliquee,
  type IdJeu,
} from '../../shared/api'

const ROUTES = {
  lister: route<DecisionArbitrageAppliquee[]>()('GET', 'jeux/{jeu}/arbitrages/'),
  enregistrer: route<DecisionArbitrage, CorpsDecisionArbitrage>()('POST', 'jeux/{jeu}/arbitrages/'),
  annuler: route<void>()('DELETE', 'jeux/{jeu}/arbitrages/{arbitrage}/'),
}

/** Décisions enregistrées, et si elles ont pu être appliquées aux données actuelles. */
export function listerArbitrages(jeu: IdJeu, signal?: AbortSignal): Promise<DecisionArbitrageAppliquee[]> {
  return appeler(ROUTES.lister, { params: { jeu }, signal })
}

/**
 * Enregistre la décision d'une commission. Elle remplace toute décision
 * antérieure sur le même enseignant.
 *
 * @throws ApiError 422 si l'école retenue n'a plus de poste ouvert ou si le motif manque.
 */
export function enregistrerArbitrage(jeu: IdJeu, corps: CorpsDecisionArbitrage): Promise<DecisionArbitrage> {
  return appeler(ROUTES.enregistrer, { params: { jeu }, corps })
}

export function annulerArbitrage(jeu: IdJeu, arbitrage: string): Promise<void> {
  return appeler(ROUTES.annuler, { params: { jeu, arbitrage } })
}
