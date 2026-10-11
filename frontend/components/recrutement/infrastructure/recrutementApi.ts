/**
 * Accès à l'API du contexte « Recrutement » : candidats au concours déployés
 * sur les postes restés vacants (§3.8).
 *
 * Routes :
 *   GET jeux/{jeu}/recrues/   DELETE jeux/{jeu}/recrues/   POST jeux/{jeu}/recrues/import/
 */

import { appeler, route, type CorpsImportFichier, type IdJeu, type LectureRecrues, type Recrue } from '../../shared/api'

const ROUTES = {
  lister: route<Recrue[]>()('GET', 'jeux/{jeu}/recrues/'),
  supprimer: route<void>()('DELETE', 'jeux/{jeu}/recrues/'),
  importer: route<LectureRecrues, CorpsImportFichier>()('POST', 'jeux/{jeu}/recrues/import/', 'multipart'),
}

export function listerRecrues(jeu: IdJeu, signal?: AbortSignal): Promise<Recrue[]> {
  return appeler(ROUTES.lister, { params: { jeu }, signal })
}

/** Retire toutes les recrues du jeu ; les scénarios sont recalculés sans elles. */
export function supprimerRecrues(jeu: IdJeu): Promise<void> {
  return appeler(ROUTES.supprimer, { params: { jeu } })
}

/**
 * Importe la liste des candidats. Elle remplace la liste précédente.
 *
 * @returns les recrues retenues, les colonnes manquantes et les lignes écartées.
 */
export function importerRecrues(jeu: IdJeu, fichier: Blob, feuille?: string): Promise<LectureRecrues> {
  return appeler(ROUTES.importer, { params: { jeu }, corps: { fichier, feuille } })
}
