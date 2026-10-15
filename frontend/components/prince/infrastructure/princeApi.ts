/**
 * Accès à l'API du contexte « Fait du Prince » : redéploiements décidés par la
 * DRH, appliqués avant tout calcul.
 *
 * Routes :
 *   GET    jeux/{jeu}/faits-prince/          POST jeux/{jeu}/faits-prince/
 *   POST   jeux/{jeu}/faits-prince/impact/   POST jeux/{jeu}/faits-prince/import/
 *   DELETE jeux/{jeu}/faits-prince/{fait}/
 *
 * Seules les impossibilités matérielles sont refusées (enseignant ou école
 * inconnus, même école, enseignant déjà redéployé) : aucune règle de
 * l'algorithme ne s'applique à une décision de la DRH.
 */

import {
  appeler,
  route,
  type BilanImportPrince,
  type CorpsFaitPrince,
  type CorpsImportFichier,
  type FaitPrinceApplique,
  type IdJeu,
  type ImpactPrince,
} from '../../shared/api'

const ROUTES = {
  lister: route<FaitPrinceApplique[]>()('GET', 'jeux/{jeu}/faits-prince/'),
  enregistrer: route<FaitPrinceApplique, CorpsFaitPrince>()('POST', 'jeux/{jeu}/faits-prince/'),
  impact: route<ImpactPrince, CorpsFaitPrince>()('POST', 'jeux/{jeu}/faits-prince/impact/'),
  importer: route<BilanImportPrince, CorpsImportFichier>()('POST', 'jeux/{jeu}/faits-prince/import/', 'multipart'),
  annuler: route<void>()('DELETE', 'jeux/{jeu}/faits-prince/{fait}/'),
}

/** Décisions enregistrées et leur sort au regard des données actuelles. */
export function listerFaitsPrince(jeu: IdJeu, signal?: AbortSignal): Promise<FaitPrinceApplique[]> {
  return appeler(ROUTES.lister, { params: { jeu }, signal })
}

/**
 * Enregistre une décision de la DRH ; le serveur recalcule ensuite diagnostic,
 * scénarios et planification.
 *
 * @throws ApiError 422 avec le motif en cas d'impossibilité matérielle.
 */
export function enregistrerFaitPrince(jeu: IdJeu, corps: CorpsFaitPrince): Promise<FaitPrinceApplique> {
  return appeler(ROUTES.enregistrer, { params: { jeu }, corps })
}

/** Effets prévisibles d'une décision sur les deux écoles, sans rien enregistrer. */
export function simulerImpactFaitPrince(
  jeu: IdJeu,
  corps: CorpsFaitPrince,
  signal?: AbortSignal,
): Promise<ImpactPrince> {
  return appeler(ROUTES.impact, { params: { jeu }, corps, signal })
}

/**
 * Importe un lot de décisions depuis un classeur. Chaque ligne est contrôlée
 * comme une saisie unique, en tenant compte des lignes qui la précèdent.
 */
export function importerFaitsPrince(jeu: IdJeu, fichier: Blob, feuille?: string): Promise<BilanImportPrince> {
  return appeler(ROUTES.importer, { params: { jeu }, corps: { fichier, feuille } })
}

/** Annule une décision : l'enseignant retrouve son école d'origine dans les calculs. */
export function annulerFaitPrince(jeu: IdJeu, fait: string): Promise<void> {
  return appeler(ROUTES.annuler, { params: { jeu, fait } })
}
