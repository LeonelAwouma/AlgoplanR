/**
 * Pages du contexte « Nominations », pour la racine de composition seulement.
 *
 * Ce fichier est séparé de `index.ts` : les autres contextes importent
 * l'index (hooks et composants partagés) sans tirer les pages, ce qui évite
 * les dépendances circulaires entre contextes.
 */

export { MouvementsPage } from './ui/MouvementsPage'
export { NominationsPage } from './ui/NominationsPage'
export { VivierPage } from './ui/VivierPage'
