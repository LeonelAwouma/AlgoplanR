/**
 * Accès à l'API du contexte « Fait du Prince » : redéploiements décidés par la
 * DRH, appliqués avant tout calcul.
 *
 * Routes :
 *   GET    jeux/{jeu}/faits-prince/          POST jeux/{jeu}/faits-prince/
 *   POST   jeux/{jeu}/faits-prince/impact/   POST jeux/{jeu}/faits-prince/import/
 *   POST   jeux/{jeu}/faits-prince/import/apercu/  (essai à blanc, rien n'est enregistré)
 *   GET    jeux/{jeu}/faits-prince/application/    GET jeux/{jeu}/faits-prince/bases/{base}/
 *   DELETE jeux/{jeu}/faits-prince/{fait}/
 *
 * Seules les impossibilités matérielles sont refusées (enseignant ou école
 * inconnus, même école, enseignant déjà redéployé) : aucune règle de
 * l'algorithme ne s'applique à une décision de la DRH.
 */

import {
  appeler,
  queryPage,
  route,
  telechargerDepuisServeur,
  type ApercuImportPrince,
  type ApplicationPrince,
  type BaseApresPrince,
  type BilanImportPrince,
  type CorpsFaitPrince,
  type CorpsImportFichier,
  type DemandePage,
  type FaitPrinceApplique,
  type FichierTelecharge,
  type FiltresBaseApresPrince,
  type IdJeu,
  type ImpactPrince,
  type LigneEnseignantApresPrince,
  type LigneEtablissementApresPrince,
  type LigneJournalPrince,
  type Page,
} from '../../shared/api'

const ROUTES = {
  lister: route<FaitPrinceApplique[]>()('GET', 'jeux/{jeu}/faits-prince/'),
  enregistrer: route<FaitPrinceApplique, CorpsFaitPrince>()('POST', 'jeux/{jeu}/faits-prince/'),
  impact: route<ImpactPrince, CorpsFaitPrince>()('POST', 'jeux/{jeu}/faits-prince/impact/'),
  importer: route<BilanImportPrince, CorpsImportFichier>()('POST', 'jeux/{jeu}/faits-prince/import/', 'multipart'),
  apercu: route<ApercuImportPrince, CorpsImportFichier>()(
    'POST',
    'jeux/{jeu}/faits-prince/import/apercu/',
    'multipart',
  ),
  application: route<ApplicationPrince>()('GET', 'jeux/{jeu}/faits-prince/application/'),
  base: route<Page<unknown>>()('GET', 'jeux/{jeu}/faits-prince/bases/{base}/'),
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

/**
 * Essai à blanc d'un fichier : décisions que l'import enregistrerait, refus, et état des bases qui en résulterait.
 * Rien n'est enregistré ni recalculé.
 */
export function apercevoirImportFaitsPrince(jeu: IdJeu, fichier: Blob, feuille?: string): Promise<ApercuImportPrince> {
  return appeler(ROUTES.apercu, { params: { jeu }, corps: { fichier, feuille } })
}

/** Faits actifs appliqués aux bases importées : résumé, avant / après, décisions, écarts d'effectifs. */
export function lireApplicationPrince(jeu: IdJeu, signal?: AbortSignal): Promise<ApplicationPrince> {
  return appeler(ROUTES.application, { params: { jeu }, signal })
}

/** Types des lignes de chaque base consultable. */
export interface LignesBaseApresPrince {
  etablissements: LigneEtablissementApresPrince
  enseignants: LigneEnseignantApresPrince
  journal: LigneJournalPrince
}

/** Une page d'une base « après Prince » : mêmes lignes que le classeur exporté. */
export async function listerBaseApresPrince<B extends BaseApresPrince>(
  jeu: IdJeu,
  base: B,
  filtres: FiltresBaseApresPrince = {},
  page: DemandePage = {},
  signal?: AbortSignal,
): Promise<Page<LignesBaseApresPrince[B]>> {
  const reponse = await appeler(ROUTES.base, {
    params: { jeu, base },
    query: { ...queryPage(page), concernes: filtres.concernes || undefined, q: filtres.recherche || undefined },
    signal,
  })
  return reponse as Page<LignesBaseApresPrince[B]>
}

/** Classeur Excel d'une base après Prince, tel que le produit le serveur. */
export function telechargerBaseApresPrince(
  jeu: IdJeu,
  base: BaseApresPrince,
  filtres: FiltresBaseApresPrince = {},
): Promise<FichierTelecharge> {
  return telechargerDepuisServeur(`jeux/${jeu}/faits-prince/bases/${base}/export/`, {
    concernes: filtres.concernes || undefined,
  })
}
