/**
 * Pages du contexte « Paramétrage », pour la racine de composition seulement.
 *
 * Ce fichier est séparé de `index.ts` : les autres contextes importent
 * l'index (hooks et composants partagés) sans tirer les pages, ce qui évite
 * les dépendances circulaires entre contextes.
 */

export { MoteurPage } from './ui/MoteurPage'
export { ReferentielPage } from './ui/ReferentielPage'
