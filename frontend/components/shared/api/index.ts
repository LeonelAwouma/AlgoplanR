/**
 * Couche d'accès à l'API AlgoPlanR : client HTTP, erreurs, pagination, filtres,
 * clés de cache, invalidations et contrat JSON.
 *
 * Les contextes déclarent leurs routes et leurs fonctions d'appel dans leur
 * propre dossier `infrastructure/`, à partir de ces briques communes.
 */

export * from './client'
export * from './cles'
export * from './config'
export * from './contrat'
export * from './erreurs'
export * from './filtres'
export * from './invalidations'
export * from './pagination'
export * from './routes'
export * from './systeme'
