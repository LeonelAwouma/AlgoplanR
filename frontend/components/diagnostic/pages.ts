/**
 * Pages du contexte « Diagnostic », pour la racine de composition seulement.
 *
 * Ce fichier est séparé de `index.ts` : les autres contextes importent
 * l'index (hooks et composants partagés) sans tirer les pages, ce qui évite
 * les dépendances circulaires entre contextes.
 */

export { PrioritesPage } from './ui/PrioritesPage'
export { SituationNationalePage } from './ui/SituationNationalePage'
export { TerritoiresPage } from './ui/TerritoiresPage'
export { VueEnsemblePage } from './ui/VueEnsemblePage'
