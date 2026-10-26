/**
 * Contexte « Données » : import, jeux de données, validation, actualisation, fiches et recherche.
 *
 * API publique du contexte : les autres contextes et l'application n'importent
 * que ce fichier, jamais ses dossiers internes.
 */

export * from './application/hooks'

/** Composants d'interface partagés avec les autres contextes. */
export { DataQualityPanel } from './ui/composants/DataQualityPanel'
export { DetailBareme } from './ui/composants/DetailBareme'

/** Message annonçant les limites d'un import en établissements seuls (sans fichier nominatif des enseignants). */
export { MESSAGE_ETABLISSEMENTS_SEULS } from './domain/correspondances'
