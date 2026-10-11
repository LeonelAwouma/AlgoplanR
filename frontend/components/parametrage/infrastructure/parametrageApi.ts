/**
 * Accès à l'API du contexte « Paramétrage » : règles du moteur et inventaire
 * des situations familiales.
 *
 * Routes :
 *   GET   parametres/defaut/
 *   GET   jeux/{jeu}/parametres/        PUT jeux/{jeu}/parametres/        PATCH jeux/{jeu}/parametres/
 *   POST  jeux/{jeu}/parametres/import/
 *   GET   jeux/{jeu}/situations-familiales/
 *
 * Toute modification des règles invalide le diagnostic côté serveur et rend
 * obsolètes les scénarios géographiques.
 */

import {
  appeler,
  route,
  type EngineSettings,
  type IdJeu,
  type InventaireSituations,
  type MiseAJourParametres,
} from '../../shared/api'

const ROUTES = {
  lireDefaut: route<EngineSettings>()('GET', 'parametres/defaut/'),
  lire: route<EngineSettings>()('GET', 'jeux/{jeu}/parametres/'),
  remplacer: route<EngineSettings, EngineSettings>()('PUT', 'jeux/{jeu}/parametres/'),
  modifier: route<EngineSettings, MiseAJourParametres>()('PATCH', 'jeux/{jeu}/parametres/'),
  importer: route<EngineSettings, { parametres: unknown }>()('POST', 'jeux/{jeu}/parametres/import/'),
  situations: route<InventaireSituations>()('GET', 'jeux/{jeu}/situations-familiales/'),
}

/** Règles par défaut du référentiel technique. */
export function lireParametresDefaut(signal?: AbortSignal): Promise<EngineSettings> {
  return appeler(ROUTES.lireDefaut, { signal })
}

/** Règles en vigueur pour un jeu. */
export function lireParametres(jeu: IdJeu, signal?: AbortSignal): Promise<EngineSettings> {
  return appeler(ROUTES.lire, { params: { jeu }, signal })
}

/** Remplace toutes les règles (retour aux valeurs par défaut, par exemple). */
export function remplacerParametres(jeu: IdJeu, parametres: EngineSettings): Promise<EngineSettings> {
  return appeler(ROUTES.remplacer, { params: { jeu }, corps: parametres })
}

/**
 * Modifie une partie des règles ; les autres restent inchangées.
 *
 * @throws ApiError 422 si une valeur est hors des bornes admises.
 */
export function modifierParametres(jeu: IdJeu, miseAJour: MiseAJourParametres): Promise<EngineSettings> {
  return appeler(ROUTES.modifier, { params: { jeu }, corps: miseAJour })
}

/**
 * Importe des règles exportées au format JSON. Le serveur les fusionne avec les
 * valeurs par défaut et ignore les clés inconnues.
 *
 * @throws ApiError 422 si le contenu n'est pas un jeu de règles reconnaissable.
 */
export function importerParametres(jeu: IdJeu, parametres: unknown): Promise<EngineSettings> {
  return appeler(ROUTES.importer, { params: { jeu }, corps: { parametres } })
}

/** Situations familiales lues dans le fichier, reconnues ou non par le barème. */
export function lireSituationsFamiliales(jeu: IdJeu, signal?: AbortSignal): Promise<InventaireSituations> {
  return appeler(ROUTES.situations, { params: { jeu }, signal })
}
