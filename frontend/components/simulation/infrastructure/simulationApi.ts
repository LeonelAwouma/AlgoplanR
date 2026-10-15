/**
 * Accès à l'API du contexte « Simulation » (Moteur B) : scénarios, résultats
 * et leurs sections, flux d'un territoire, comparaison des scénarios
 * géographiques, choix du scénario retenu pour la planification.
 *
 * Routes :
 *   GET  scenarios/presets/
 *   GET  jeux/{jeu}/scenarios/                 POST jeux/{jeu}/scenarios/       POST jeux/{jeu}/scenarios/base/
 *   GET  jeux/{jeu}/scenarios/{scenario}/      DELETE …/{scenario}/             POST …/{scenario}/executer/
 *   GET  …/{scenario}/resultat/                …/affectations/                  …/affectations/{matricule}/explication/
 *        …/non-affectes/  …/vivier/  …/postes/  …/postes-non-couverts/  …/candidatures/  …/combinaisons/
 *        …/journal/  …/invariants/  …/projections/  …/recrutes/  …/flux/
 *   GET  jeux/{jeu}/comparaison/               PUT  jeux/{jeu}/scenario-retenu/
 *
 * Les résultats sont restreints par le serveur au territoire demandé
 * (paramètres `region`, `departement`, `commune`) : vue « destination » des
 * mouvements, complétée par le bilan des flux.
 */

import {
  appeler,
  queryPage,
  querySelection,
  route,
  type Candidature,
  type CombinaisonArbitrage,
  type ComparaisonScenarios,
  type CorpsCreationScenario,
  type CorpsScenarioRetenu,
  type DemandePage,
  type EcoleNonCouverte,
  type ExplicationProposition,
  type FluxTerritorial,
  type IdJeu,
  type InvariantCheck,
  type IssueCandidature,
  type JeuDeDonnees,
  type JournalSimulation,
  type NatureMouvement,
  type Page,
  type PoolTeacher,
  type PresetScenario,
  type ProjectionsScenario,
  type ProposedAssignment,
  type RedeploymentPool,
  type ResultatRecrutes,
  type ScenarioCalcule,
  type SimulationResult,
  type TeachingPost,
  type TerritorySelection,
} from '../../shared/api'

const S = 'jeux/{jeu}/scenarios/{scenario}'

const ROUTES = {
  presets: route<PresetScenario[]>()('GET', 'scenarios/presets/'),
  lister: route<ScenarioCalcule[]>()('GET', 'jeux/{jeu}/scenarios/'),
  creer: route<ScenarioCalcule, CorpsCreationScenario>()('POST', 'jeux/{jeu}/scenarios/'),
  base: route<ScenarioCalcule[]>()('POST', 'jeux/{jeu}/scenarios/base/'),
  lire: route<ScenarioCalcule>()('GET', `${S}/`),
  supprimer: route<void>()('DELETE', `${S}/`),
  executer: route<ScenarioCalcule>()('POST', `${S}/executer/`),
  resultat: route<SimulationResult>()('GET', `${S}/resultat/`),
  affectations: route<Page<ProposedAssignment>>()('GET', `${S}/affectations/`),
  explication: route<ExplicationProposition>()('GET', `${S}/affectations/{matricule}/explication/`),
  nonAffectes: route<Page<PoolTeacher>>()('GET', `${S}/non-affectes/`),
  vivier: route<RedeploymentPool>()('GET', `${S}/vivier/`),
  postes: route<Page<TeachingPost>>()('GET', `${S}/postes/`),
  postesNonCouverts: route<EcoleNonCouverte[]>()('GET', `${S}/postes-non-couverts/`),
  candidatures: route<Page<Candidature>>()('GET', `${S}/candidatures/`),
  combinaisons: route<CombinaisonArbitrage[]>()('GET', `${S}/combinaisons/`),
  journal: route<JournalSimulation>()('GET', `${S}/journal/`),
  invariants: route<InvariantCheck[]>()('GET', `${S}/invariants/`),
  projections: route<ProjectionsScenario>()('GET', `${S}/projections/`),
  recrutes: route<ResultatRecrutes | null>()('GET', `${S}/recrutes/`),
  flux: route<FluxTerritorial>()('GET', `${S}/flux/`),
  comparaison: route<ComparaisonScenarios>()('GET', 'jeux/{jeu}/comparaison/'),
  retenir: route<JeuDeDonnees, CorpsScenarioRetenu>()('PUT', 'jeux/{jeu}/scenario-retenu/'),
}

/** Identifie un scénario d'un jeu. */
export interface RefScenario {
  jeu: IdJeu
  scenario: string
}

// --- Scénarios ----------------------------------------------------------------------------

/**
 * Modèles de scénarios (A à F).
 *
 * @param jeu si fourni, le serveur indique pour chaque modèle s'il est applicable aux données du jeu.
 */
export function listerPresets(jeu: IdJeu | null, signal?: AbortSignal): Promise<PresetScenario[]> {
  return appeler(ROUTES.presets, { query: { jeu: jeu ?? undefined }, signal })
}

export function listerScenarios(jeu: IdJeu, signal?: AbortSignal): Promise<ScenarioCalcule[]> {
  return appeler(ROUTES.lister, { params: { jeu }, signal })
}

/**
 * Crée un scénario et lance son calcul.
 *
 * @throws ApiError 422 si le modèle n'est pas applicable aux données du jeu.
 */
export function creerScenario(jeu: IdJeu, corps: CorpsCreationScenario): Promise<ScenarioCalcule> {
  return appeler(ROUTES.creer, { params: { jeu }, corps })
}

/** Calcule (ou recalcule) les trois scénarios géographiques de référence. */
export function calculerScenariosDeBase(jeu: IdJeu): Promise<ScenarioCalcule[]> {
  return appeler(ROUTES.base, { params: { jeu } })
}

export function lireScenario({ jeu, scenario }: RefScenario, signal?: AbortSignal): Promise<ScenarioCalcule> {
  return appeler(ROUTES.lire, { params: { jeu, scenario }, signal })
}

export function supprimerScenario({ jeu, scenario }: RefScenario): Promise<void> {
  return appeler(ROUTES.supprimer, { params: { jeu, scenario } })
}

/** Relance le calcul d'un scénario avec ses paramètres figés. */
export function executerScenario({ jeu, scenario }: RefScenario): Promise<ScenarioCalcule> {
  return appeler(ROUTES.executer, { params: { jeu, scenario } })
}

/** Désigne le scénario dont les mouvements alimentent la planification sur cinq ans. */
export function retenirScenario(jeu: IdJeu, scenario: string): Promise<JeuDeDonnees> {
  return appeler(ROUTES.retenir, { params: { jeu }, corps: { scenario } })
}

// --- Résultat et sections -------------------------------------------------------------------

/** Résultat complet d'un scénario, restreint au territoire sélectionné. */
export function lireResultat(
  ref: RefScenario,
  selection: TerritorySelection,
  signal?: AbortSignal,
): Promise<SimulationResult> {
  return appeler(ROUTES.resultat, { params: { ...ref }, query: querySelection(selection), signal })
}

/** Filtres des listes de mouvements. */
export interface FiltresAffectations extends DemandePage {
  selection?: TerritorySelection
  nature?: NatureMouvement
  recherche?: string
  /** Mouvements dont l'école est l'origine ou la destination. */
  ecole?: string
}

/** Propositions d'affectation, paginées. */
export function listerAffectations(
  ref: RefScenario,
  filtres: FiltresAffectations = {},
  signal?: AbortSignal,
): Promise<Page<ProposedAssignment>> {
  return appeler(ROUTES.affectations, {
    params: { ...ref },
    query: {
      ...(filtres.selection ? querySelection(filtres.selection) : {}),
      ...queryPage(filtres),
      nature: filtres.nature,
      q: filtres.recherche || undefined,
      ecole: filtres.ecole,
    },
    signal,
  })
}

/** « Pourquoi cette proposition ? » : composantes du score de l'affectation d'un enseignant. */
export function expliquerAffectation(
  ref: RefScenario,
  matricule: string,
  signal?: AbortSignal,
): Promise<ExplicationProposition> {
  return appeler(ROUTES.explication, { params: { ...ref, matricule }, signal })
}

/** Enseignants du vivier restés sans affectation. */
export function listerNonAffectes(
  ref: RefScenario,
  page: DemandePage = {},
  signal?: AbortSignal,
): Promise<Page<PoolTeacher>> {
  return appeler(ROUTES.nonAffectes, { params: { ...ref }, query: queryPage(page), signal })
}

/** Vivier de redéploiement du scénario : écoles sources et exclusions. */
export function lireVivierScenario(ref: RefScenario, signal?: AbortSignal): Promise<RedeploymentPool> {
  return appeler(ROUTES.vivier, { params: { ...ref }, signal })
}

/** Postes ouverts, classés par priorité. */
export function listerPostes(
  ref: RefScenario,
  options: DemandePage & { pourvu?: boolean; ecole?: string } = {},
  signal?: AbortSignal,
): Promise<Page<TeachingPost>> {
  return appeler(ROUTES.postes, {
    params: { ...ref },
    query: { ...queryPage(options), pourvu: options.pourvu, ecole: options.ecole },
    signal,
  })
}

/** Écoles restées sans maître, par ordre de priorité, avec les combinaisons proposées. */
export function listerPostesNonCouverts(ref: RefScenario, signal?: AbortSignal): Promise<EcoleNonCouverte[]> {
  return appeler(ROUTES.postesNonCouverts, { params: { ...ref }, signal })
}

/** Synthèse des vœux : toutes les demandes de mutation, recevables ou non. */
export function listerCandidatures(
  ref: RefScenario,
  options: DemandePage & { issue?: IssueCandidature; recherche?: string } = {},
  signal?: AbortSignal,
): Promise<Page<Candidature>> {
  return appeler(ROUTES.candidatures, {
    params: { ...ref },
    query: { ...queryPage(options), issue: options.issue, q: options.recherche || undefined },
    signal,
  })
}

/** Combinaisons de redéploiement soumises à la commission. */
export function listerCombinaisons(ref: RefScenario, signal?: AbortSignal): Promise<CombinaisonArbitrage[]> {
  return appeler(ROUTES.combinaisons, { params: { ...ref }, signal })
}

/** Journal d'exécution : tours de l'acceptation différée et étapes du calcul. */
export function lireJournal(ref: RefScenario, signal?: AbortSignal): Promise<JournalSimulation> {
  return appeler(ROUTES.journal, { params: { ...ref }, signal })
}

/** Contrôles métier vérifiés après le calcul. */
export function lireInvariants(ref: RefScenario, signal?: AbortSignal): Promise<InvariantCheck[]> {
  return appeler(ROUTES.invariants, { params: { ...ref }, signal })
}

/**
 * Projection N+1 → N+3 du scénario.
 *
 * @deprecated remplacée par la planification sur cinq ans (`contextes/planification`) ;
 *   conservée tant que le backend sert les deux.
 */
export function lireProjections(ref: RefScenario, signal?: AbortSignal): Promise<ProjectionsScenario> {
  return appeler(ROUTES.projections, { params: { ...ref }, signal })
}

/** Déploiement des recrues sur les postes restés vacants, `null` sans recrue importée. */
export function lireRecrutes(ref: RefScenario, signal?: AbortSignal): Promise<ResultatRecrutes | null> {
  return appeler(ROUTES.recrutes, { params: { ...ref }, signal })
}

/** Bilan des mouvements du territoire : reçus, sortants, internes, solde. */
export function lireFlux(
  ref: RefScenario,
  selection: TerritorySelection,
  signal?: AbortSignal,
): Promise<FluxTerritorial> {
  return appeler(ROUTES.flux, { params: { ...ref }, query: querySelection(selection), signal })
}

/** Scénarios calculés (géographiques puis personnalisés), restreints au territoire sélectionné. */
export function lireComparaison(
  jeu: IdJeu,
  selection: TerritorySelection,
  signal?: AbortSignal,
): Promise<ComparaisonScenarios> {
  return appeler(ROUTES.comparaison, { params: { jeu }, query: querySelection(selection), signal })
}
