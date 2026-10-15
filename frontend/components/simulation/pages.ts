/**
 * Pages du contexte « Simulation », pour la racine de composition seulement.
 *
 * Ce fichier est séparé de `index.ts` : les autres contextes importent
 * l'index (hooks et composants partagés) sans tirer les pages, ce qui évite
 * les dépendances circulaires entre contextes.
 */

export { ComparaisonPage } from './ui/ComparaisonPage'
export { ScenariosPage } from './ui/ScenariosPage'
export { VoeuxPage } from './ui/VoeuxPage'
export { AffectationsPage } from './ui/analyste/AffectationsPage'
export { JournalSimulationPage } from './ui/analyste/JournalSimulationPage'
export { NonAffectesPage } from './ui/analyste/NonAffectesPage'
export { PostesPage } from './ui/analyste/PostesPage'
export { VivierScenarioPage } from './ui/analyste/VivierScenarioPage'
