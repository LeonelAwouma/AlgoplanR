/**
 * Accès à l'API du contexte « Données » : import des classeurs, jeux de
 * données, validation et actualisation, fiches établissement et enseignant,
 * recherche par saisie libre.
 *
 * Routes :
 *   GET    fichiers/colonnes/
 *   POST   fichiers/                              PATCH  fichiers/{fichier}/correspondances/
 *   GET    jeux/            POST jeux/            POST   jeux/demonstration/
 *   GET    jeux/{jeu}/      DELETE jeux/{jeu}/    GET    jeux/{jeu}/qualite/
 *   GET    jeux/{jeu}/validation/                 POST   jeux/{jeu}/validation/
 *   GET    jeux/{jeu}/actualisations/             POST   jeux/{jeu}/actualisations/
 *   GET    jeux/{jeu}/actualisations/{actualisation}/ecarts/
 *   GET    jeux/{jeu}/etablissements/             GET    jeux/{jeu}/etablissements/{ecole}/
 *   GET    jeux/{jeu}/enseignants/                GET    jeux/{jeu}/enseignants/{matricule}/
 *   GET    jeux/{jeu}/recherche/enseignants/      GET    jeux/{jeu}/recherche/etablissements/
 */

import {
  appeler,
  queryFiltres,
  queryPage,
  route,
  type Actualisation,
  type ColonneAttendue,
  type CorpsActualisation,
  type CorpsCorrespondances,
  type CorpsCreationJeu,
  type CorpsEnvoiFichier,
  type CorpsValidationJeu,
  type DemandePage,
  type EcartsActualisation,
  type EnseignantDetail,
  type EnseignantResume,
  type EtablissementDetail,
  type FichierImporte,
  type GlobalFilters,
  type IdJeu,
  type JeuCree,
  type JeuDeDonnees,
  type Page,
  type QualiteJeu,
  type ResultatRecherche,
  type SchoolDiagnostic,
  type Teacher,
  type TypeColonnes,
  type TypeFichier,
  type ValidationJeu,
} from '../../shared/api'

const ROUTES = {
  colonnesAttendues: route<ColonneAttendue[]>()('GET', 'fichiers/colonnes/'),
  envoyerFichier: route<FichierImporte, CorpsEnvoiFichier>()('POST', 'fichiers/', 'multipart'),
  corrigerCorrespondances: route<FichierImporte, CorpsCorrespondances>()(
    'PATCH',
    'fichiers/{fichier}/correspondances/',
  ),
  listerJeux: route<JeuDeDonnees[]>()('GET', 'jeux/'),
  creerJeu: route<JeuCree, CorpsCreationJeu>()('POST', 'jeux/'),
  creerJeuDemonstration: route<JeuCree>()('POST', 'jeux/demonstration/'),
  lireJeu: route<JeuDeDonnees>()('GET', 'jeux/{jeu}/'),
  supprimerJeu: route<void>()('DELETE', 'jeux/{jeu}/'),
  lireQualite: route<QualiteJeu>()('GET', 'jeux/{jeu}/qualite/'),
  lireValidation: route<ValidationJeu>()('GET', 'jeux/{jeu}/validation/'),
  validerJeu: route<ValidationJeu, CorpsValidationJeu>()('POST', 'jeux/{jeu}/validation/'),
  listerActualisations: route<Actualisation[]>()('GET', 'jeux/{jeu}/actualisations/'),
  actualiserJeu: route<Actualisation, CorpsActualisation>()('POST', 'jeux/{jeu}/actualisations/'),
  lireEcarts: route<EcartsActualisation>()('GET', 'jeux/{jeu}/actualisations/{actualisation}/ecarts/'),
  listerEtablissements: route<Page<SchoolDiagnostic>>()('GET', 'jeux/{jeu}/etablissements/'),
  lireEtablissement: route<EtablissementDetail>()('GET', 'jeux/{jeu}/etablissements/{ecole}/'),
  listerEnseignants: route<Page<EnseignantResume>>()('GET', 'jeux/{jeu}/enseignants/'),
  lireEnseignant: route<EnseignantDetail>()('GET', 'jeux/{jeu}/enseignants/{matricule}/'),
  rechercherEnseignants: route<ResultatRecherche<Teacher>>()('GET', 'jeux/{jeu}/recherche/enseignants/'),
  rechercherEtablissements: route<ResultatRecherche<SchoolDiagnostic>>()('GET', 'jeux/{jeu}/recherche/etablissements/'),
}

// --- Import des classeurs -------------------------------------------------------------

/** Colonnes que le serveur cherche dans un classeur, indispensables d'abord. */
export function listerColonnesAttendues(type: TypeColonnes, signal?: AbortSignal): Promise<ColonneAttendue[]> {
  return appeler(ROUTES.colonnesAttendues, { query: { type }, signal })
}

/**
 * Envoie un classeur au serveur, qui le lit et reconnaît ses colonnes.
 *
 * @param feuille feuille à lire ; la première du classeur par défaut.
 * @throws ApiError 422 si le fichier n'est pas un classeur lisible ou si la feuille est vide.
 */
export function envoyerFichier(type: TypeFichier, fichier: Blob, feuille?: string): Promise<FichierImporte> {
  return appeler(ROUTES.envoyerFichier, { corps: { type, fichier, feuille } })
}

/**
 * Corrige à la main la correspondance entre champs métier et colonnes du fichier.
 *
 * @param correspondances champ métier → en-tête retenu (`null` pour « aucune colonne »).
 */
export function corrigerCorrespondances(
  fichier: string,
  correspondances: Record<string, string | null>,
): Promise<FichierImporte> {
  return appeler(ROUTES.corrigerCorrespondances, { params: { fichier }, corps: { correspondances } })
}

// --- Jeux de données --------------------------------------------------------------------

/** Jeux de données enregistrés, du plus récent au plus ancien. */
export function listerJeux(signal?: AbortSignal): Promise<JeuDeDonnees[]> {
  return appeler(ROUTES.listerJeux, { signal })
}

/**
 * Crée un jeu à partir des deux fichiers envoyés. Le serveur construit les
 * entités, produit le rapport de qualité et calcule les scénarios de base.
 *
 * @throws ApiError 422 si une colonne requise n'est pas résolue.
 */
export function creerJeu(corps: CorpsCreationJeu): Promise<JeuCree> {
  return appeler(ROUTES.creerJeu, { corps })
}

/** Crée le jeu de démonstration embarqué (données synthétiques, jamais officielles). */
export function creerJeuDemonstration(): Promise<JeuCree> {
  return appeler(ROUTES.creerJeuDemonstration)
}

export function lireJeu(jeu: IdJeu, signal?: AbortSignal): Promise<JeuDeDonnees> {
  return appeler(ROUTES.lireJeu, { params: { jeu }, signal })
}

/** Supprime le jeu et tout ce qui en dépend (« Effacer les données »). */
export function supprimerJeu(jeu: IdJeu): Promise<void> {
  return appeler(ROUTES.supprimerJeu, { params: { jeu } })
}

/** Rapport de qualité du jeu et correspondance des colonnes de ses fichiers. */
export function lireQualite(jeu: IdJeu, signal?: AbortSignal): Promise<QualiteJeu> {
  return appeler(ROUTES.lireQualite, { params: { jeu }, signal })
}

// --- Validation et actualisation ----------------------------------------------------------

export function lireValidation(jeu: IdJeu, signal?: AbortSignal): Promise<ValidationJeu> {
  return appeler(ROUTES.lireValidation, { params: { jeu }, signal })
}

/**
 * Valide le jeu comme référence des projections (brouillon → validé).
 *
 * @throws ApiError 422 si un contrôle bloquant échoue ; le détail est dans `details`.
 */
export function validerJeu(jeu: IdJeu, auteur: string): Promise<ValidationJeu> {
  return appeler(ROUTES.validerJeu, { params: { jeu }, corps: { auteur } })
}

export function listerActualisations(jeu: IdJeu, signal?: AbortSignal): Promise<Actualisation[]> {
  return appeler(ROUTES.listerActualisations, { params: { jeu }, signal })
}

/**
 * Remplace les données de l'exercice par deux nouveaux fichiers, en conservant
 * les décisions qui restent valables. Déclenche un recalcul complet.
 */
export function actualiserJeu(jeu: IdJeu, corps: CorpsActualisation): Promise<Actualisation> {
  return appeler(ROUTES.actualiserJeu, { params: { jeu }, corps })
}

export function lireEcartsActualisation(
  jeu: IdJeu,
  actualisation: string,
  signal?: AbortSignal,
): Promise<EcartsActualisation> {
  return appeler(ROUTES.lireEcarts, { params: { jeu, actualisation }, signal })
}

// --- Établissements et enseignants ----------------------------------------------------------

/** Établissements du périmètre filtré, avec leur diagnostic. */
export function listerEtablissements(
  jeu: IdJeu,
  filtres: GlobalFilters,
  options: DemandePage & { recherche?: string } = {},
  signal?: AbortSignal,
): Promise<Page<SchoolDiagnostic>> {
  return appeler(ROUTES.listerEtablissements, {
    params: { jeu },
    query: { ...queryFiltres(filtres), ...queryPage(options), q: options.recherche || undefined },
    signal,
  })
}

/** Fiche d'un établissement : diagnostic détaillé et enseignants rattachés. */
export function lireEtablissement(jeu: IdJeu, ecole: string, signal?: AbortSignal): Promise<EtablissementDetail> {
  return appeler(ROUTES.lireEtablissement, { params: { jeu, ecole }, signal })
}

/** Filtres de la liste des enseignants. */
export interface FiltresEnseignants extends DemandePage {
  recherche?: string
  ecole?: string
  /** `true` : seulement les enseignants mobilisables ; `false` : seulement les autres. */
  mobilisable?: boolean
  /**
   * Scénario dont le vivier fixe la mobilité (au-delà de l'excédent de l'école,
   * l'enseignant n'est pas retenu) ; sans scénario, seule la règle d'excédent s'applique.
   */
  scenario?: string | null
}

/** Enseignants du périmètre, avec barème et mobilité calculés par le serveur. */
export function listerEnseignants(
  jeu: IdJeu,
  filtres: GlobalFilters,
  options: FiltresEnseignants = {},
  signal?: AbortSignal,
): Promise<Page<EnseignantResume>> {
  return appeler(ROUTES.listerEnseignants, {
    params: { jeu },
    query: {
      ...queryFiltres(filtres),
      ...queryPage(options),
      q: options.recherche || undefined,
      ecole: options.ecole,
      mobilisable: options.mobilisable,
      scenario: options.scenario ?? undefined,
    },
    signal,
  })
}

/** Fiche d'un enseignant : barème détaillé et explication de sa mobilité. */
export function lireEnseignant(jeu: IdJeu, matricule: string, signal?: AbortSignal): Promise<EnseignantDetail> {
  return appeler(ROUTES.lireEnseignant, { params: { jeu, matricule }, signal })
}

// --- Recherche --------------------------------------------------------------------------------

/** Retrouve un enseignant à partir d'une saisie libre (matricule, nom, prénom). */
export function rechercherEnseignants(
  jeu: IdJeu,
  saisie: string,
  signal?: AbortSignal,
): Promise<ResultatRecherche<Teacher>> {
  return appeler(ROUTES.rechercherEnseignants, { params: { jeu }, query: { q: saisie }, signal })
}

/** Retrouve un établissement à partir d'une saisie libre (code, nom, commune). */
export function rechercherEtablissements(
  jeu: IdJeu,
  saisie: string,
  signal?: AbortSignal,
): Promise<ResultatRecherche<SchoolDiagnostic>> {
  return appeler(ROUTES.rechercherEtablissements, { params: { jeu }, query: { q: saisie }, signal })
}
