/**
 * Pages du contexte « Planification sur cinq ans », pour la racine de composition seulement.
 *
 * Ce fichier est séparé de `index.ts` : les autres contextes importent
 * l'index (hooks et composants partagés) sans tirer les pages, ce qui évite
 * les dépendances circulaires entre contextes.
 */

export { HypothesesPage } from './ui/HypothesesPage'
export { IndicateursPage } from './ui/IndicateursPage'
export { PlanificationPage } from './ui/PlanificationPage'
export { QuotasPage } from './ui/QuotasPage'
