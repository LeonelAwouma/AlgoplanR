/**
 * Contexte « Simulation (Moteur B) » : scénarios et résultats.
 *
 * API publique du contexte : les autres contextes et l'application n'importent
 * que ce fichier, jamais ses dossiers internes.
 */

export * from './application/hooks'
export * from './application/scenarioAffiche'

/** Composants d'interface partagés avec les autres contextes. */
export { FluxPanel } from './ui/composants/FluxPanel'
export { SansScenario } from './ui/composants/SansScenario'
