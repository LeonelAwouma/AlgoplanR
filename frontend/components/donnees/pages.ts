/**
 * Pages du contexte « Données », pour la racine de composition seulement.
 *
 * Ce fichier est séparé de `index.ts` : les autres contextes importent
 * l'index (hooks et composants partagés) sans tirer les pages, ce qui évite
 * les dépendances circulaires entre contextes.
 */

export { EcolesPage } from './ui/EcolesPage'
export { EnseignantsPage } from './ui/EnseignantsPage'
export { ImportPage } from './ui/ImportPage'
export { QualiteDonneesPage } from './ui/QualiteDonneesPage'
export { ValidationPage } from './ui/ValidationPage'
