/**
 * Accès à l'API du contexte « Planification » : hypothèses de calcul, tableau
 * prévisionnel sur cinq ans, quotas de recrutement, indicateurs de suivi.
 *
 * Routes :
 *   GET  hypotheses/defaut/
 *   GET  jeux/{jeu}/hypotheses/   PUT jeux/{jeu}/hypotheses/
 *   GET  jeux/{jeu}/hypotheses/documentation/   GET jeux/{jeu}/hypotheses/historique/
 *   POST jeux/{jeu}/hypotheses/attrition/estimer/
 *   GET  jeux/{jeu}/planification/  …/territoires/  …/sous-systemes/  …/ecoles/  …/departs/
 *        …/fiabilite/  …/etat/  …/versions/  …/versions/{version}/  …/versions/comparer/
 *   POST jeux/{jeu}/planification/recalculer/
 *   GET  jeux/{jeu}/quotas/   PUT jeux/{jeu}/quotas/{annee}/{territoire}/
 *   POST jeux/{jeu}/quotas/valider/   GET jeux/{jeu}/quotas/historique/
 *   GET  jeux/{jeu}/indicateurs/   GET jeux/{jeu}/indicateurs/evolution/
 *
 * Le serveur recalcule la planification après chaque décision qui change les
 * effectifs ; `recalculer` ne sert qu'à forcer un calcul.
 */

import {
  appeler,
  queryPage,
  queryPerimetre,
  queryPlanification,
  route,
  type AnneePlan,
  type ComparaisonVersions,
  type CorpsAjustementQuota,
  type CorpsHypotheses,
  type CorpsValidationQuotas,
  type DemandePage,
  type DetailVersionPlanification,
  type DocumentationHypotheses,
  type EstimationAttrition,
  type EtatPlanification,
  type EvenementQuota,
  type EvolutionIndicateurs,
  type FiabiliteDonnees,
  type FiltresPerimetre,
  type FiltresPlanification,
  type Hypotheses,
  type IdJeu,
  type IndicateursSuivi,
  type LignePlanificationEcole,
  type Page,
  type PlanDeparts,
  type QuotaRecrutement,
  type TableauPlanification,
  type VentilationSousSystemes,
  type VentilationTerritoriale,
  type VersionHypotheses,
  type VersionPlanification,
} from '../../shared/api'

const P = 'jeux/{jeu}/planification'

const ROUTES = {
  hypothesesDefaut: route<Hypotheses>()('GET', 'hypotheses/defaut/'),
  hypotheses: route<Hypotheses>()('GET', 'jeux/{jeu}/hypotheses/'),
  modifierHypotheses: route<Hypotheses, CorpsHypotheses>()('PUT', 'jeux/{jeu}/hypotheses/'),
  documentation: route<DocumentationHypotheses>()('GET', 'jeux/{jeu}/hypotheses/documentation/'),
  historiqueHypotheses: route<VersionHypotheses[]>()('GET', 'jeux/{jeu}/hypotheses/historique/'),
  estimerAttrition: route<EstimationAttrition>()('POST', 'jeux/{jeu}/hypotheses/attrition/estimer/'),

  tableau: route<TableauPlanification>()('GET', `${P}/`),
  territoires: route<VentilationTerritoriale>()('GET', `${P}/territoires/`),
  sousSystemes: route<VentilationSousSystemes>()('GET', `${P}/sous-systemes/`),
  ecoles: route<Page<LignePlanificationEcole>>()('GET', `${P}/ecoles/`),
  departs: route<PlanDeparts>()('GET', `${P}/departs/`),
  fiabilite: route<FiabiliteDonnees>()('GET', `${P}/fiabilite/`),
  etat: route<EtatPlanification>()('GET', `${P}/etat/`),
  recalculer: route<EtatPlanification>()('POST', `${P}/recalculer/`),
  versions: route<VersionPlanification[]>()('GET', `${P}/versions/`),
  version: route<DetailVersionPlanification>()('GET', `${P}/versions/{version}/`),
  comparerVersions: route<ComparaisonVersions>()('GET', `${P}/versions/comparer/`),

  quotas: route<QuotaRecrutement[]>()('GET', 'jeux/{jeu}/quotas/'),
  ajusterQuota: route<QuotaRecrutement, CorpsAjustementQuota>()('PUT', 'jeux/{jeu}/quotas/{annee}/{territoire}/'),
  validerQuotas: route<QuotaRecrutement[], CorpsValidationQuotas>()('POST', 'jeux/{jeu}/quotas/valider/'),
  historiqueQuotas: route<EvenementQuota[]>()('GET', 'jeux/{jeu}/quotas/historique/'),

  indicateurs: route<IndicateursSuivi>()('GET', 'jeux/{jeu}/indicateurs/'),
  evolution: route<EvolutionIndicateurs>()('GET', 'jeux/{jeu}/indicateurs/evolution/'),
}

/** Périmètre et options d'une requête de planification. */
export type RequetePlanification = FiltresPerimetre & FiltresPlanification

/** Paramètres de requête combinés du périmètre et des options de planification. */
function query(requete: RequetePlanification) {
  return { ...queryPerimetre(requete), ...queryPlanification(requete) }
}

// --- Hypothèses ------------------------------------------------------------------------------

export function lireHypothesesDefaut(signal?: AbortSignal): Promise<Hypotheses> {
  return appeler(ROUTES.hypothesesDefaut, { signal })
}

export function lireHypotheses(jeu: IdJeu, signal?: AbortSignal): Promise<Hypotheses> {
  return appeler(ROUTES.hypotheses, { params: { jeu }, signal })
}

/**
 * Remplace les hypothèses en vigueur. La version précédente est historisée et
 * la planification est recalculée.
 *
 * @throws ApiError 422 si une valeur est incohérente (taux négatif, horizon nul…) ou si le motif manque.
 */
export function modifierHypotheses(jeu: IdJeu, corps: CorpsHypotheses): Promise<Hypotheses> {
  return appeler(ROUTES.modifierHypotheses, { params: { jeu }, corps })
}

/** Fiche lisible des hypothèses en vigueur. */
export function lireDocumentationHypotheses(jeu: IdJeu, signal?: AbortSignal): Promise<DocumentationHypotheses> {
  return appeler(ROUTES.documentation, { params: { jeu }, signal })
}

export function lireHistoriqueHypotheses(jeu: IdJeu, signal?: AbortSignal): Promise<VersionHypotheses[]> {
  return appeler(ROUTES.historiqueHypotheses, { params: { jeu }, signal })
}

/** Propose un taux d'attrition à partir des données, sans l'enregistrer. */
export function estimerAttrition(jeu: IdJeu): Promise<EstimationAttrition> {
  return appeler(ROUTES.estimerAttrition, { params: { jeu } })
}

// --- Tableau de planification -------------------------------------------------------------------

/** Tableau N+1 → N+5 du périmètre : les huit indicateurs du mémo, et leur fiabilité. */
export function lireTableauPlanification(
  jeu: IdJeu,
  requete: RequetePlanification = {},
  signal?: AbortSignal,
): Promise<TableauPlanification> {
  return appeler(ROUTES.tableau, { params: { jeu }, query: query(requete), signal })
}

/** Même tableau, ventilé par territoire enfant du périmètre. */
export function lireVentilationTerritoriale(
  jeu: IdJeu,
  requete: RequetePlanification = {},
  signal?: AbortSignal,
): Promise<VentilationTerritoriale> {
  return appeler(ROUTES.territoires, { params: { jeu }, query: query(requete), signal })
}

/** Même tableau, ventilé par sous-système. */
export function lireVentilationSousSystemes(
  jeu: IdJeu,
  requete: RequetePlanification = {},
  signal?: AbortSignal,
): Promise<VentilationSousSystemes> {
  return appeler(ROUTES.sousSystemes, { params: { jeu }, query: query(requete), signal })
}

/** Projection école par école, paginée. */
export function listerPlanificationEcoles(
  jeu: IdJeu,
  requete: RequetePlanification = {},
  page: DemandePage = {},
  signal?: AbortSignal,
): Promise<Page<LignePlanificationEcole>> {
  return appeler(ROUTES.ecoles, { params: { jeu }, query: { ...query(requete), ...queryPage(page) }, signal })
}

/** Plan des départs : retraites nominatives et attrition par territoire. */
export function lirePlanDeparts(
  jeu: IdJeu,
  requete: RequetePlanification = {},
  signal?: AbortSignal,
): Promise<PlanDeparts> {
  return appeler(ROUTES.departs, { params: { jeu }, query: query(requete), signal })
}

/** Disponibilité des données qui fondent les projections. */
export function lireFiabilite(
  jeu: IdJeu,
  requete: RequetePlanification = {},
  signal?: AbortSignal,
): Promise<FiabiliteDonnees> {
  return appeler(ROUTES.fiabilite, { params: { jeu }, query: query(requete), signal })
}

export function lireEtatPlanification(jeu: IdJeu, signal?: AbortSignal): Promise<EtatPlanification> {
  return appeler(ROUTES.etat, { params: { jeu }, signal })
}

/** Force un recalcul ; il est normalement automatique après chaque décision. */
export function recalculerPlanification(jeu: IdJeu): Promise<EtatPlanification> {
  return appeler(ROUTES.recalculer, { params: { jeu } })
}

/** Versions conservées, de la plus récente à la plus ancienne. */
export function listerVersionsPlanification(jeu: IdJeu, signal?: AbortSignal): Promise<VersionPlanification[]> {
  return appeler(ROUTES.versions, { params: { jeu }, signal })
}

export function lireVersionPlanification(
  jeu: IdJeu,
  version: number,
  signal?: AbortSignal,
): Promise<DetailVersionPlanification> {
  return appeler(ROUTES.version, { params: { jeu, version }, signal })
}

/** Écarts entre deux versions, pour suivre le prévu et le réalisé. */
export function comparerVersionsPlanification(
  jeu: IdJeu,
  de: number,
  a: number,
  signal?: AbortSignal,
): Promise<ComparaisonVersions> {
  return appeler(ROUTES.comparerVersions, { params: { jeu }, query: { de, a }, signal })
}

// --- Quotas -----------------------------------------------------------------------------------

/** Quotas calculés et retenus, filtrables par année et par périmètre. */
export function listerQuotas(
  jeu: IdJeu,
  requete: RequetePlanification = {},
  signal?: AbortSignal,
): Promise<QuotaRecrutement[]> {
  return appeler(ROUTES.quotas, { params: { jeu }, query: query(requete), signal })
}

/**
 * Ajuste un quota ; l'écart au calcul reste visible avec son motif.
 *
 * @throws ApiError 409 si les quotas de cette année sont déjà validés.
 */
export function ajusterQuota(
  jeu: IdJeu,
  annee: AnneePlan,
  territoire: string,
  corps: CorpsAjustementQuota,
): Promise<QuotaRecrutement> {
  return appeler(ROUTES.ajusterQuota, { params: { jeu, annee, territoire }, corps })
}

/** Valide et fige les quotas d'une année. */
export function validerQuotas(jeu: IdJeu, corps: CorpsValidationQuotas): Promise<QuotaRecrutement[]> {
  return appeler(ROUTES.validerQuotas, { params: { jeu }, corps })
}

export function lireHistoriqueQuotas(jeu: IdJeu, signal?: AbortSignal): Promise<EvenementQuota[]> {
  return appeler(ROUTES.historiqueQuotas, { params: { jeu }, signal })
}

// --- Indicateurs ------------------------------------------------------------------------------

/** Indicateurs de suivi du périmètre. */
export function lireIndicateurs(
  jeu: IdJeu,
  perimetre: FiltresPerimetre = {},
  signal?: AbortSignal,
): Promise<IndicateursSuivi> {
  return appeler(ROUTES.indicateurs, { params: { jeu }, query: queryPerimetre(perimetre), signal })
}

/** Évolution des indicateurs d'une version de planification à l'autre. */
export function lireEvolutionIndicateurs(
  jeu: IdJeu,
  perimetre: FiltresPerimetre = {},
  signal?: AbortSignal,
): Promise<EvolutionIndicateurs> {
  return appeler(ROUTES.evolution, { params: { jeu }, query: queryPerimetre(perimetre), signal })
}
