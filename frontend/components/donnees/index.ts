/**
 * Contexte « Données » : import, jeux de données, validation, actualisation, fiches et recherche.
 *
 * API publique du contexte : les autres contextes et l'application n'importent
 * que ce fichier, jamais ses dossiers internes.
 */

export * from './application/hooks'

/** Composants d'interface partagés avec les autres contextes. */
export { DataQualityPanel } from './ui/composants/DataQualityPanel'
