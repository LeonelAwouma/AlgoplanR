/**
 * Accès à l'API du contexte « Nominations » : vivier consolidé, postes
 * ouverts, cycle de vie des nominations et registre des mouvements.
 *
 * Routes :
 *   GET  jeux/{jeu}/vivier/            POST jeux/{jeu}/vivier/import/
 *   GET  jeux/{jeu}/vivier/{personne}/ GET  jeux/{jeu}/vivier/{personne}/postes-compatibles/
 *   GET  jeux/{jeu}/postes-ouverts/    GET  jeux/{jeu}/postes-ouverts/{poste}/candidats/
 *   GET  jeux/{jeu}/nominations/       POST jeux/{jeu}/nominations/
 *   POST jeux/{jeu}/nominations/generer/  …/lot/  …/import/      GET jeux/{jeu}/nominations/synthese/
 *   GET  jeux/{jeu}/nominations/{nomination}/
 *   POST …/{nomination}/valider/  …/rejeter/  …/mettre-en-oeuvre/  …/annuler/
 *   GET  jeux/{jeu}/mouvements/   GET jeux/{jeu}/mouvements/controles/   GET jeux/{jeu}/mouvements/{mouvement}/
 *   POST jeux/{jeu}/mouvements/{mouvement}/mettre-en-oeuvre/
 *   GET  jeux/{jeu}/personnes/{matricule}/mouvements/
 *
 * Règles contre les doubles comptages, appliquées par le serveur (refus 409) :
 * une seule nomination active par personne, un poste réservé par une seule
 * nomination validée, une nomination mise en œuvre est définitive.
 */

import {
  appeler,
  queryPage,
  route,
  type BilanGenerationNominations,
  type BilanImportNominations,
  type BilanImportVivier,
  type BilanLot,
  type CandidatPoste,
  type ControleMouvements,
  type CorpsGenerationNominations,
  type CorpsImportNominations,
  type CorpsImportVivier,
  type CorpsLotNominations,
  type CorpsMiseEnOeuvre,
  type CorpsMiseEnOeuvreMouvement,
  type CorpsMotifNomination,
  type CorpsNomination,
  type CorpsValidationNomination,
  type DemandePage,
  type DisponibiliteVivier,
  type FiltresMouvements,
  type FiltresNominations,
  type IdJeu,
  type Mouvement,
  type Nomination,
  type Page,
  type PersonneVivier,
  type PersonneVivierDetail,
  type PosteCompatible,
  type PosteOuvert,
  type SourceVivier,
  type SousSysteme,
  type StatutPoste,
  type SyntheseNominations,
} from '../../shared/api'

const N = 'jeux/{jeu}/nominations/{nomination}'

const ROUTES = {
  vivier: route<Page<PersonneVivier>>()('GET', 'jeux/{jeu}/vivier/'),
  importerVivier: route<BilanImportVivier, CorpsImportVivier>()('POST', 'jeux/{jeu}/vivier/import/', 'multipart'),
  personne: route<PersonneVivierDetail>()('GET', 'jeux/{jeu}/vivier/{personne}/'),
  postesCompatibles: route<PosteCompatible[]>()('GET', 'jeux/{jeu}/vivier/{personne}/postes-compatibles/'),
  postesOuverts: route<Page<PosteOuvert>>()('GET', 'jeux/{jeu}/postes-ouverts/'),
  candidats: route<CandidatPoste[]>()('GET', 'jeux/{jeu}/postes-ouverts/{poste}/candidats/'),

  nominations: route<Page<Nomination>>()('GET', 'jeux/{jeu}/nominations/'),
  proposer: route<Nomination, CorpsNomination>()('POST', 'jeux/{jeu}/nominations/'),
  generer: route<BilanGenerationNominations, CorpsGenerationNominations>()('POST', 'jeux/{jeu}/nominations/generer/'),
  lot: route<BilanLot, CorpsLotNominations>()('POST', 'jeux/{jeu}/nominations/lot/'),
  importer: route<BilanImportNominations, CorpsImportNominations>()(
    'POST',
    'jeux/{jeu}/nominations/import/',
    'multipart',
  ),
  synthese: route<SyntheseNominations>()('GET', 'jeux/{jeu}/nominations/synthese/'),
  nomination: route<Nomination>()('GET', `${N}/`),
  valider: route<Nomination, CorpsValidationNomination>()('POST', `${N}/valider/`),
  rejeter: route<Nomination, CorpsMotifNomination>()('POST', `${N}/rejeter/`),
  mettreEnOeuvre: route<Nomination, CorpsMiseEnOeuvre>()('POST', `${N}/mettre-en-oeuvre/`),
  annuler: route<Nomination, CorpsMotifNomination>()('POST', `${N}/annuler/`),

  mouvements: route<Page<Mouvement>>()('GET', 'jeux/{jeu}/mouvements/'),
  controles: route<ControleMouvements>()('GET', 'jeux/{jeu}/mouvements/controles/'),
  mouvement: route<Mouvement>()('GET', 'jeux/{jeu}/mouvements/{mouvement}/'),
  realiserMouvement: route<Mouvement, CorpsMiseEnOeuvreMouvement>()(
    'POST',
    'jeux/{jeu}/mouvements/{mouvement}/mettre-en-oeuvre/',
  ),
  mouvementsPersonne: route<Mouvement[]>()('GET', 'jeux/{jeu}/personnes/{matricule}/mouvements/'),
}

/** Identifie une nomination d'un jeu. */
export interface RefNomination {
  jeu: IdJeu
  nomination: string
}

// --- Vivier et postes ouverts ---------------------------------------------------------------------

/** Filtres du vivier. */
export interface FiltresVivier extends DemandePage {
  source?: SourceVivier[]
  disponibilite?: DisponibiliteVivier
  sousSysteme?: SousSysteme
  region?: string | null
  departement?: string | null
  recherche?: string
}

/** Personnes disponibles, toutes sources confondues. */
export function listerVivier(
  jeu: IdJeu,
  filtres: FiltresVivier = {},
  signal?: AbortSignal,
): Promise<Page<PersonneVivier>> {
  return appeler(ROUTES.vivier, {
    params: { jeu },
    query: {
      ...queryPage(filtres),
      source: filtres.source,
      disponibilite: filtres.disponibilite,
      sousSysteme: filtres.sousSysteme,
      region: filtres.region,
      departement: filtres.departement,
      q: filtres.recherche || undefined,
    },
    signal,
  })
}

/** Ajoute au vivier des personnes issues d'une autre source (si cette portée est retenue). */
export function importerVivier(jeu: IdJeu, corps: CorpsImportVivier): Promise<BilanImportVivier> {
  return appeler(ROUTES.importerVivier, { params: { jeu }, corps })
}

/** Fiche d'une personne du vivier : barème, contraintes, historique des propositions. */
export function lirePersonneVivier(jeu: IdJeu, personne: string, signal?: AbortSignal): Promise<PersonneVivierDetail> {
  return appeler(ROUTES.personne, { params: { jeu, personne }, signal })
}

/** Postes ouverts classés pour une personne : proximité, sous-système, zone, score. */
export function listerPostesCompatibles(
  jeu: IdJeu,
  personne: string,
  signal?: AbortSignal,
): Promise<PosteCompatible[]> {
  return appeler(ROUTES.postesCompatibles, { params: { jeu, personne }, signal })
}

/** Postes vacants après redéploiement, avec leur statut (libre, réservé, pourvu). */
export function listerPostesOuverts(
  jeu: IdJeu,
  filtres: DemandePage & { statut?: StatutPoste; region?: string | null; departement?: string | null } = {},
  signal?: AbortSignal,
): Promise<Page<PosteOuvert>> {
  return appeler(ROUTES.postesOuverts, {
    params: { jeu },
    query: { ...queryPage(filtres), statut: filtres.statut, region: filtres.region, departement: filtres.departement },
    signal,
  })
}

/** Personnes du vivier classées pour un poste (rapprochement inverse). */
export function listerCandidatsPoste(jeu: IdJeu, poste: string, signal?: AbortSignal): Promise<CandidatPoste[]> {
  return appeler(ROUTES.candidats, { params: { jeu, poste }, signal })
}

// --- Nominations ----------------------------------------------------------------------------------

/** Nominations filtrées par statut, année, source et territoire. */
export function listerNominations(
  jeu: IdJeu,
  filtres: FiltresNominations & DemandePage = {},
  signal?: AbortSignal,
): Promise<Page<Nomination>> {
  return appeler(ROUTES.nominations, {
    params: { jeu },
    query: {
      ...queryPage(filtres),
      statut: filtres.statut,
      annee: filtres.annee,
      source: filtres.source,
      region: filtres.region,
      departement: filtres.departement,
    },
    signal,
  })
}

/**
 * Propose manuellement une personne sur un poste.
 *
 * @throws ApiError 409 si la personne a déjà une nomination active ou si le poste est réservé.
 * @throws ApiError 422 si une règle bloque l'affectation (sous-système, zone rouge…).
 */
export function proposerNomination(jeu: IdJeu, corps: CorpsNomination): Promise<Nomination> {
  return appeler(ROUTES.proposer, { params: { jeu }, corps })
}

/** Génère des propositions automatiques par appariement du vivier et des postes ouverts. */
export function genererNominations(jeu: IdJeu, corps: CorpsGenerationNominations): Promise<BilanGenerationNominations> {
  return appeler(ROUTES.generer, { params: { jeu }, corps })
}

/** Valide ou rejette plusieurs nominations ; chaque refus est détaillé dans le bilan. */
export function traiterNominationsEnLot(jeu: IdJeu, corps: CorpsLotNominations): Promise<BilanLot> {
  return appeler(ROUTES.lot, { params: { jeu }, corps })
}

/** Importe des nominations décidées ou réalisées hors de l'application. */
export function importerNominations(jeu: IdJeu, corps: CorpsImportNominations): Promise<BilanImportNominations> {
  return appeler(ROUTES.importer, { params: { jeu }, corps })
}

/** Décomptes par statut, territoire et année. */
export function lireSyntheseNominations(jeu: IdJeu, signal?: AbortSignal): Promise<SyntheseNominations> {
  return appeler(ROUTES.synthese, { params: { jeu }, signal })
}

/** Détail d'une nomination et historique de ses changements de statut. */
export function lireNomination(ref: RefNomination, signal?: AbortSignal): Promise<Nomination> {
  return appeler(ROUTES.nomination, { params: { ...ref }, signal })
}

/**
 * Proposée → validée : la personne sort du vivier disponible et le poste est réservé.
 *
 * @throws ApiError 409 si la nomination n'est plus « proposée » ou si le poste a été réservé entre-temps.
 */
export function validerNomination(ref: RefNomination, corps: CorpsValidationNomination): Promise<Nomination> {
  return appeler(ROUTES.valider, { params: { ...ref }, corps })
}

/** Proposée → rejetée ; le motif est obligatoire. */
export function rejeterNomination(ref: RefNomination, corps: CorpsMotifNomination): Promise<Nomination> {
  return appeler(ROUTES.rejeter, { params: { ...ref }, corps })
}

/**
 * Validée → mise en œuvre : les effectifs des écoles sont modifiés et la
 * décision devient définitive.
 *
 * @throws ApiError 409 si la nomination n'est pas validée.
 */
export function mettreEnOeuvreNomination(ref: RefNomination, corps: CorpsMiseEnOeuvre): Promise<Nomination> {
  return appeler(ROUTES.mettreEnOeuvre, { params: { ...ref }, corps })
}

/**
 * Proposée ou validée → annulée ; le motif est obligatoire.
 *
 * @throws ApiError 409 pour une nomination déjà mise en œuvre.
 */
export function annulerNomination(ref: RefNomination, corps: CorpsMotifNomination): Promise<Nomination> {
  return appeler(ROUTES.annuler, { params: { ...ref }, corps })
}

// --- Registre des mouvements -------------------------------------------------------------------------

/** Registre consolidé : redéploiements, faits du Prince, recrues, nominations. */
export function listerMouvements(
  jeu: IdJeu,
  filtres: FiltresMouvements & DemandePage = {},
  signal?: AbortSignal,
): Promise<Page<Mouvement>> {
  return appeler(ROUTES.mouvements, {
    params: { jeu },
    query: {
      ...queryPage(filtres),
      type: filtres.type,
      statut: filtres.statut,
      annee: filtres.annee,
      region: filtres.region,
      departement: filtres.departement,
    },
    signal,
  })
}

/** Détection des doubles comptages dans le registre. */
export function controlerMouvements(jeu: IdJeu, signal?: AbortSignal): Promise<ControleMouvements> {
  return appeler(ROUTES.controles, { params: { jeu }, signal })
}

export function lireMouvement(jeu: IdJeu, mouvement: string, signal?: AbortSignal): Promise<Mouvement> {
  return appeler(ROUTES.mouvement, { params: { jeu, mouvement }, signal })
}

/** Marque comme réalisé un redéploiement ou un déploiement de recrue. */
export function realiserMouvement(
  jeu: IdJeu,
  mouvement: string,
  corps: CorpsMiseEnOeuvreMouvement,
): Promise<Mouvement> {
  return appeler(ROUTES.realiserMouvement, { params: { jeu, mouvement }, corps })
}

/** Tous les mouvements d'une personne, pour la traçabilité individuelle. */
export function listerMouvementsPersonne(jeu: IdJeu, matricule: string, signal?: AbortSignal): Promise<Mouvement[]> {
  return appeler(ROUTES.mouvementsPersonne, { params: { jeu, matricule }, signal })
}
