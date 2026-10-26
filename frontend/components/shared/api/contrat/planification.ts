/**
 * Contrat de l'API — contexte « Planification » : tableau prévisionnel sur cinq
 * ans, hypothèses de calcul, quotas de recrutement et indicateurs de suivi
 * (mémo de synthèse, §2.1 et §3 ; document des routes, sections 4.2 à 4.4 et 4.7).
 *
 * Les règles de calcul dépendent de points encore à valider (méthode officielle
 * d'attrition, règles de retraite, portée du vivier) : le contrat expose donc
 * les hypothèses retenues avec leur source et leur justification.
 */

import type { NiveauTerritorial } from './commun'
import type { EducationTerritory, SousSysteme } from './education'
import type { SourceVivier } from './nominations'
import type { ReferenceAttritionM1 } from './rapports-territoriaux'

/** Année du plan, de la rentrée du plan (N+1) à N+5. */
export type AnneePlan = 'N+1' | 'N+2' | 'N+3' | 'N+4' | 'N+5'

/** Années couvertes par le tableau, dans l'ordre. */
export const ANNEES_PLAN: readonly AnneePlan[] = ['N+1', 'N+2', 'N+3', 'N+4', 'N+5']

// --- Hypothèses ---------------------------------------------------------------------

/** Toute hypothèse est documentée : d'où vient la valeur, et pourquoi elle est retenue. */
export interface Justification {
  source: string
  justification: string
}

/** Méthode de calcul de l'attrition hors retraite. */
export type MethodeAttrition = 'taux_unique' | 'par_sous_systeme' | 'par_region'

/** Exception à l'âge légal de départ, par statut ou par catégorie. */
export interface ExceptionRetraite {
  critere: 'statut' | 'categorie'
  valeur: string
  ageLegal: number
}

/** Hypothèses de calcul de la planification, en vigueur pour un jeu. */
export interface Hypotheses {
  /** Nombre d'années projetées (5 selon le mémo). */
  horizon: number
  retraite: Justification & {
    ageLegal: number
    /** Date à laquelle l'âge est apprécié chaque année. */
    dateReference: 'rentree' | 'fin_annee_civile'
    /**
     * Année scolaire à laquelle les âges du fichier ont été mesurés (« 2026-2027 »). Vide : à la même date que les
     * effectifs, retenus comme situation de début de N+1. Sinon les âges sont ramenés au début de N+1.
     */
    anneeAges?: string | null
    exceptions: ExceptionRetraite[]
  }
  attrition: Justification & {
    methode: MethodeAttrition
    /** Taux annuel en %, pour la méthode « taux unique ». */
    tauxUnique: number
    parSousSysteme: Partial<Record<SousSysteme, number>>
    parRegion: Record<string, number>
    /** Conservé dans les hypothèses (lecture tolérante) mais non lu par le calcul : aucun contrôle ne le propose. */
    niveauArrondi: NiveauTerritorial
  }
  quotas: Justification & {
    /** Supposer recrutés les quotas des années précédentes pour projeter les suivantes. */
    anneesPrecedentesRealisees: boolean
  }
  vivier: Justification & {
    /** Sources de personnes retenues dans le vivier. */
    sources: SourceVivier[]
  }
  version: number
  modifieesLe: string | null
  modifieesPar: string | null
  /**
   * Référentiel M1 du rapport DRH (lecture seule, hors du bloc versionné) : 3,33 % d'attrition totale, dont 1,08 %
   * de retraites calculées nominativement et 2,25 % d'autres départs. Absent des jeux de démonstration hors ligne.
   */
  referenceAttrition?: ReferenceAttritionM1 | null
}

/** Modification des hypothèses : toute la configuration, avec son auteur et son motif. */
export type CorpsHypotheses = Omit<Hypotheses, 'version' | 'modifieesLe' | 'modifieesPar' | 'referenceAttrition'> & {
  auteur: string
  motif: string
}

/** Version historisée des hypothèses. */
export interface VersionHypotheses {
  version: number
  modifieesLe: string
  modifieesPar: string | null
  motif: string
  hypotheses: Hypotheses
}

/** Fiche lisible des hypothèses, reprise dans le rapport et la méthodologie. */
export interface DocumentationHypotheses {
  sections: { titre: string; paragraphes: string[] }[]
}

/** Estimation d'un taux d'attrition à partir des données disponibles (non enregistrée). */
export interface EstimationAttrition {
  /** Taux proposé en %, `null` si les données ne permettent pas d'estimer. */
  tauxPropose: number | null
  methode: string
  /** Données sur lesquelles repose l'estimation. */
  base: string
  avertissements: string[]
}

// --- Tableau de planification ---------------------------------------------------------

/**
 * Détail de la projection d'une année, calculé par le serveur : de quoi reconstituer l'évolution des effectifs.
 * Facultatif : un serveur ou un jeu de données factices plus ancien ne le fournit pas.
 */
export interface DetailProjectionAnnee {
  /** Classes libérées par les directeurs déchargés, rapportées au périmètre. */
  directeursDecharges: number
  /** Recrutements de l'année : quota retenu s'il est fixé, sinon quota calculé (quotas supposés réalisés). */
  recrutement: number
  /** Effectif en fin d'année : début − retraites − attrition − directeurs + recrutements. */
  effectifFin: number
  /** Taux d'attrition appliqué (%), celui des hypothèses de planification. */
  tauxAttrition: number
  /** Élèves projetés des écoles dont l'effectif est connu. */
  eleves: number
  /** Élèves par enseignant projeté, `null` quand il n'est pas calculable. */
  rem: number | null
  /** Pourquoi `rem` est « non disponible » (écoles à effectif d'élèves inconnu) ; `null`/absent sinon. */
  remRaison?: string | null
}

/** Les huit indicateurs du mémo (§2.1), pour une année et un périmètre. */
export interface IndicateursAnnee extends Partial<DetailProjectionAnnee> {
  annee: AnneePlan
  /** Effectif enseignant disponible en début de période. */
  effectifDebut: number
  departsRetraite: number
  departsAttrition: number
  /** Besoin prévisionnel : somme de max(0 ; K − effectif). */
  besoin: number
  /** Ressources mobilisables depuis le vivier. */
  ressourcesVivier: number
  quotaCalcule: number
  /** Quota retenu après ajustement administratif, `null` tant qu'il n'a pas été fixé. */
  quotaRetenu: number | null
  nominationsPrevues: number
  nominationsRealisees: number
  deploiementsPrevus: number
  deploiementsRealises: number
  /** Besoin restant à couvrir après mobilisation des ressources. */
  besoinRestant: number
}

/** Indicateur numérique du tableau de planification (hors détail de la projection). */
export type CleIndicateurPlan = Exclude<keyof Omit<IndicateursAnnee, 'annee'>, keyof DetailProjectionAnnee>

/** Fiabilité d'un indicateur, selon la disponibilité des données sources. */
export interface FiabiliteIndicateur {
  indicateur: CleIndicateurPlan
  niveau: 'bonne' | 'partielle' | 'faible'
  detail: string
}

/** Tableau de planification d'un périmètre (`GET jeux/{jeu}/planification/`). */
export interface TableauPlanification {
  perimetre: string
  niveau: NiveauTerritorial
  sousSysteme: SousSysteme | null
  scenarioId: string | null
  version: number
  calculeLe: string
  annees: IndicateursAnnee[]
  fiabilite: FiabiliteIndicateur[]
}

/** Ventilation par territoire enfant (descente région → département → commune). */
export interface VentilationTerritoriale {
  niveau: NiveauTerritorial
  lignes: { territoire: EducationTerritory; annees: IndicateursAnnee[] }[]
}

/** Ventilation par sous-système. */
export interface VentilationSousSystemes {
  lignes: { sousSysteme: SousSysteme | 'non_renseigne'; annees: IndicateursAnnee[] }[]
}

/** Projection d'une école. */
export interface LignePlanificationEcole {
  schoolId: string
  nomEtab: string
  region: string
  departement: string
  commune: string
  sousSysteme: SousSysteme | null
  cible: number
  annees: { annee: AnneePlan; effectif: number; departsRetraite: number; besoin: number; excedent: number }[]
}

/** Départ à la retraite prévu, nominatif. */
export interface DepartRetraitePrevu {
  annee: AnneePlan
  matricule: string
  nom: string
  schoolId: string
  nomEtab: string
  dateNaissance: string | null
  ageAuDepart: number
  /** Âge légal déjà atteint au début de N+1 : départ imputé à N+1 (CORR_60). */
  dejaEligible?: boolean
}

/** Plan des départs : retraites nominatives et attrition estimée par territoire. */
export interface PlanDeparts {
  retraites: DepartRetraitePrevu[]
  attrition: { annee: AnneePlan; territoire: string; sousSysteme: SousSysteme | 'non_renseigne'; departs: number }[]
}

// --- Rapport prévisionnel (tableaux du rapport DRH, §3 à §9) ---------------------------------------------

/** Scénarios de recrutement du rapport DRH. */
export type ScenarioRecrutement = 'min' | 'maintien' | 'besoin' | 'plafond'

/** Ligne d'un tableau annuel : valeur de base (ou `null`) puis une valeur par année de l'horizon. */
export interface LigneTableauRapport {
  libelle: string
  valeurs: (number | null)[]
  /** Vrai pour les lignes de taux d'encadrement (une décimale), faux pour les effectifs (entiers). */
  decimal: boolean
}

export interface RecrutementsRegion extends Record<ScenarioRecrutement, number> {
  region: string
  remBase: number | null
  /** Degré d'aléa (1 − R²) de la région, `null` quand il n'est pas calculable. */
  alea: number | null
  remFinal: { min: number | null; besoin: number | null; plafond: number | null }
}

export interface RetraitesRegion {
  region: string
  annees: number[]
  total: number
}

export interface LigneRedeploiement {
  territoire: string
  ecoles: number
  ecolesDeficit: number
  ecolesExcedent: number
  ecolesEquilibre: number
  ecolesSansEleves: number
  excedents: number
  deficits: number
  redeployableArrondissement: number
  cohorte: number
  retraites: number
}

export interface FichePrioriteRegion {
  region: string
  priorite: 1 | 2 | 3
  remBase: number | null
  /** Retraites de l'horizon en % du stock. */
  partRetraites: number
  situation: string
  orientation: string
  recrutements: Record<ScenarioRecrutement, number>
  retraites: number[]
  problemes: { titre: string; detail: string }[]
  prioriteRapportDrh: number | null
}

/** Tableaux du rapport DRH calculés sur les données du jeu (primaire seulement). */
export interface RapportPrevisionnel {
  perimetre: string
  scenarioId: string
  horizon: number
  annees: AnneePlan[]
  national: {
    annees: string[]
    lignes: LigneTableauRapport[]
    remReference: number
    remFinal: Record<ScenarioRecrutement, number | null>
    /** Raison pour laquelle les taux d'encadrement obtenus sont « non disponibles » ; absente sinon. */
    remIndisponible?: string | null
  }
  retraitesRegions: { lignes: RetraitesRegion[]; national: RetraitesRegion }
  scenariosRegions: { lignes: RecrutementsRegion[]; national: RecrutementsRegion }
  redeploiement: { lignes: LigneRedeploiement[]; national: LigneRedeploiement; seuilCohorte: number }
  priorites: FichePrioriteRegion[]
  limites: string[]
  parametres: {
    remReference: number
    ecartRem: number
    seuilRetraites: number
    plancherRetraites: boolean
    plafond: number
  }
}

// --- Tableau prévisionnel complet (Planification – Projection sur 5 ans) ---------------------------------

/** Nature d'une valeur : observée dans les données, estimée par une formule, hypothèse, ou provisoire. */
/**
 * Qualification statistique d'une valeur : observée (source de l'année de base ou acte enregistré), projetée (calculée
 * pour une année future), estimée, hypothèse (paramètre retenu), provisoire, non disponible (donnée manquante, avec sa raison) ou sans objet (base d'un flux).
 */
export type NatureValeur =
  'observe' | 'projete' | 'estime' | 'hypothese' | 'provisoire' | 'non_disponible' | 'sans_objet'

/** Ligne du tableau complet : base puis une valeur par année (`null` : sans objet ou non disponible). */
export interface LignePrevisionnel {
  cle: string
  libelle: string
  valeurs: (number | null)[]
  nature: NatureValeur
  /** Nature de chaque case (même longueur que `valeurs`) : une valeur future n'est jamais « observée ». */
  natures?: NatureValeur[]
  decimal: boolean
  unite: 'nombre' | 'pourcentage'
  /** Définition ou mode de calcul, affiché en vue Analyste. */
  detail: string
  /** Pourquoi une valeur est absente (même longueur que `valeurs`, `null` quand la valeur existe). */
  raisons?: (string | null)[]
}

/** Résultat d'un scénario de recrutement sur l'horizon. */
export interface ResumeScenario {
  scenario: ScenarioRecrutement
  libelle: string
  recrutements: number[]
  recrutementsTotal: number
  /** Stock administratif en fin d'année. */
  effectifFin: number[]
  /** Enseignants disponibles pour tenir une classe en fin d'année. */
  disponiblesFin: number[]
  /** REM obtenu chaque année, `null` quand il n'est pas calculable. */
  rem: (number | null)[]
  ecartReference: (number | null)[]
  remFinal: number | null
  ecartFinal: number | null
  /** Enseignants qui manquent encore en fin d'horizon pour atteindre le REM de référence, `null` si non calculable. */
  besoinRestantFinal: number | null
  besoinRestantRaison: string | null
}

/** Indicateur du rapport MINEDUB sans donnée dans AlgoPlanR : jamais inventé, jamais ajouté aux totaux. */
export interface DonneeNonDisponible {
  indicateur: string
  valeur: null
  sourceManquante: string
}

/** Hypothèse du calcul, et si elle doit encore être validée administrativement. */
export interface HypotheseMethodologique {
  code: string
  libelle: string
  valeur: string
  aValider: boolean
}

/** Provenance d'un tableau : jeu, année, périmètre réel, complétude et date de calcul. */
export interface ContextePrevisionnel {
  jeuNom: string
  jeuSource: string
  jeuPortee: string
  jeuRegion: string | null
  anneeScolaire: string
  /** Année saisie à la création, son sens et l'année des données qui en découle (base des projections). */
  anneeSaisie?: string
  sensAnneeScolaire?: 'donnees' | 'rentree_preparee' | 'non_confirme'
  anneeDonnees?: string
  /** Origine fictive vérifiable (jeu de démonstration ou marqueur déclaré). */
  donneesFictives?: boolean
  fichiersSource: Record<string, string>
  perimetre: string
  niveau: NiveauTerritorial
  perimetreFiltre: boolean
  ecolesPerimetre: number
  ecolesJeu: number
  /** Σ Enseignants_Actuels : personnels rattachés administrativement (pas tous chargés de classe). */
  personnelsStockDeclare: number
  /** Matricules distincts du fichier des enseignants rattachés aux écoles du périmètre. */
  personnelsNominatifs: number
  ecolesDonneesIncompletes: number
  ecolesElevesInconnus: number
  ecolesMinimumProvisoire: number
  ecolesSallesFluxInconnu: number
  versionPlanification: number | null
  calculeLe: string | null
  editeLe: string
}

/** Audit des départs à la retraite : comptes par année et méthode nominative. */
export interface AuditRetraites {
  lignes: {
    annee: string
    departs: number
    dejaEligibles: number
    atteignantAgeLegal: number
    tauxStockDeclare: number | null
    tauxPersonnelsNominatifs: number | null
  }[]
  dejaEligiblesDebut: number
  sansAge: number
  doublons: number
  personnelsNominatifs: number
  stockDeclare: number
  methode: string
  decalageAges: number
  anneeAges: string | null
}

/** Avertissement de cohérence affiché en tête de la projection et des exports (jamais un recalage silencieux). */
export interface AvertissementCoherence {
  code:
    | 'donnees_fictives'
    | 'sens_annee_non_confirme'
    | 'effectifs_discordants'
    | 'retraites_non_imputables'
    | 'agents_hors_ecoles'
    | 'depassement_plafond'
    | 'annee_ages_absente'
    | 'agents_sans_age'
  gravite: 'important' | 'information'
  message: string
  annee?: string
}

/** Rapprochement d'une école : stock déclaré (Enseignants_Actuels) et agents nominatifs rattachés. */
export interface RapprochementEcole {
  idEcole: string
  nomEcole: string
  region: string
  stockDeclare: number
  stockApresPlan: number
  agentsNominatifs: number
  /** Stock déclaré − agents nominatifs ; aucun des deux n'est corrigé. */
  ecart: number
  retraitesN1: number
  retraitesHorizon: number
  retraitesRetireesDuStock: number
  /** Retraites identifiées au-delà du stock déclaré restant de l'école : ni retirées du stock, ni remplacées. */
  retraitesNonImputables: number
  agentsSansAge: number
  doublons: number
  anomalies: string[]
}

/** Rapprochement des effectifs du périmètre : synthèse et écoles (anomalies d'abord). */
export interface RapprochementEffectifs {
  synthese: {
    ecoles: number
    stockDeclare: number
    stockApresPlan: number
    agentsNominatifs: number
    ecolesConcordantes: number
    ecolesEcartPositif: number
    ecartPositif: number
    ecolesEcartNegatif: number
    ecartNegatif: number
    /** Agents rattachés à aucune école projetée ; `null` quand le périmètre est filtré. */
    agentsHorsEcoles: number | null
    doublons: number
    agentsSansAge: number
    retraitesN1: number
    retraitesHorizon: number
    retraitesRetireesDuStock: number
    retraitesNonImputables: number
    ecolesRetraitesSuperieuresAuStock: number
    concordanceComplete: boolean
  }
  ecoles: RapprochementEcole[]
  ecolesTronquees: boolean
  methode: string
}

/** Tableau prévisionnel complet du périmètre (`GET jeux/{jeu}/planification/previsionnel/`). */
export interface PrevisionnelComplet {
  perimetre: string
  niveau: NiveauTerritorial
  sousSysteme: SousSysteme | null
  scenarioId: string
  baseCalcul: BaseCalculPlanification
  /** « Base (2024-2025) » puis « N+1 (2025-2026) »… : la base est l'année du jeu, N+1 l'année scolaire suivante. */
  annees: string[]
  anneeScolairePlan: string | null
  /** Année de base : l'année scolaire des données du jeu, `null` si elle est inconnue. */
  anneeBase?: string | null
  /** Passage de la base à N+1 : le stock observé est retenu comme situation de début de N+1. */
  hypotheseTransition?: string
  /** Provenance et périmètre réel du tableau. */
  contexte?: ContextePrevisionnel
  /** Départs à la retraite du périmètre, année par année, et méthode. */
  auditRetraites?: AuditRetraites
  /** Stock déclaré et liste nominative rapprochés école par école. */
  rapprochement?: RapprochementEffectifs
  /** Incohérences et réserves à afficher en tête de la projection et des exports. */
  avertissements?: AvertissementCoherence[]
  /** Bandeau des données fictives (texte exact), `null` pour des données réelles. */
  texteDonneesFictives?: string | null
  /** Les personnels de la cartographie ne sont pas nécessairement tous des maîtres chargés de classe. */
  avertissementPersonnels?: string
  groupes: { code: 'A' | 'B' | 'C' | 'D' | 'E'; titre: string; lignes: LignePrevisionnel[] }[]
  scenarios: ResumeScenario[]
  remReference: number
  remIndisponible: string | null
  ecoles: number
  ecolesMinimumProvisoire: number
  ecolesElevesInconnus: number
  /** Phrase du mode « non renseigné », `null` quand toutes les écoles renseignent leurs groupes. */
  messageMinimumProvisoire: string | null
  /** Écoles selon la provenance de leurs groupes pédagogiques. */
  minimumPedagogique: { observe: number; estime: number; secours: number; indetermine: number }
  /** Minimum provisoire et besoin final incertain, comptés séparément (écoles). */
  fiabilite?: {
    minimumProvisoire: number
    minimumProvisoireSansEffet: number
    besoinProvisoire: number
    besoinEstime: number
    besoinConfirme: number
  }
  /** Postes manquants (Σ b à la base) selon la fiabilité du besoin. */
  besoinsParStatut: { confirme: number; estime: number; provisoire: number }
  nonDisponibles: DonneeNonDisponible[]
  hypotheses: HypotheseMethodologique[]
}

export type StatutEcoleRedeploiement = 'deficit' | 'excedent' | 'equilibre' | 'sans_eleves'

/** Listes nominatives du volet redéploiement. */
export interface ListesRapportPrevisionnel {
  seuilCohorte: number
  ecoles: {
    idEcole: string
    nomEcole: string
    region: string
    departement: string
    commune: string
    eleves: number | null
    c1Enseignants: number
    c3Necessaires: number
    deficit: number
    excedent: number
    statut: StatutEcoleRedeploiement
  }[]
  cohorte: {
    matricule: string
    nom: string
    idEcole: string
    nomEcole: string
    region: string
    departement: string
    commune: string
    anciennetePoste: number
    statutEcole: StatutEcoleRedeploiement
  }[]
}

/**
 * Degré d'aléa d'un territoire : 1 − R² de la régression du nombre d'enseignants sur le nombre d'élèves,
 * école par école (0 = les enseignants suivent parfaitement les effectifs, 1 = aucun alignement linéaire).
 * Ne pas confondre avec le taux de déséquilibre des dotations, (B + X) ÷ ΣK, des simulations.
 */
export interface LigneAlea {
  /** Région, ou « National » pour la ligne d'ensemble. */
  region: string
  /** `null` quand l'aléa n'est pas calculable ; `raison` en donne alors le motif. */
  alea: number | null
  raison: string | null
  ecoles: number
  /** Écoles dont l'effectif d'élèves est connu : seules elles entrent dans la régression. */
  ecolesAvecEleves: number
  /** Écart à l'aléa national (points), `null` si l'une des deux valeurs manque. */
  ecartNational: number | null
}

/** Degré d'aléa national et par région (`GET jeux/{jeu}/planification/alea/`). */
export interface DegreAlea {
  perimetre: string
  scenarioId: string
  /** Aléa après le recalcul : bases après les faits du Prince et les mouvements du scénario. */
  national: LigneAlea
  regions: LigneAlea[]
  /** Aléa à l'import : effectifs déclarés des bases importées, avant les faits du Prince et avant l'algorithme. */
  avant?: { national: LigneAlea; regions: LigneAlea[] }
}

/** Disponibilité des données qui fondent les projections. */
export interface LigneFiabilite {
  territoire: string
  ecoles: number
  enseignants: number
  /** Parts entre 0 et 1. */
  tauxDateNaissance: number
  tauxSousSysteme: number
  tauxEffectifsEleves: number
}

export interface FiabiliteDonnees {
  global: LigneFiabilite
  parTerritoire: LigneFiabilite[]
}

/**
 * Scénario sur lequel le serveur calcule la planification. Sans scénario retenu explicitement, il se rabat sur le
 * scénario par défaut : la projection est alors provisoire et ne vaut pas décision validée.
 */
export interface BaseCalculPlanification {
  type: 'scenario_retenu' | 'scenario_par_defaut' | 'aucun'
  scenarioId: string | null
  scenarioNom: string | null
  provisoire: boolean
}

/** État du dernier calcul de la planification. */
export interface EtatPlanification {
  version: number
  calculeLe: string | null
  /** Ce qui a déclenché le dernier calcul (import, décision, hypothèses…). */
  declencheur: string | null
  obsolete: boolean
  scenarioRetenuId: string | null
  /** Absent des données factices. */
  baseCalcul?: BaseCalculPlanification
}

/** Instantané conservé à chaque recalcul. */
export interface VersionPlanification {
  version: number
  calculeLe: string
  declencheur: string
  auteur: string | null
}

export interface DetailVersionPlanification {
  version: VersionPlanification
  tableau: TableauPlanification
}

/** Écarts entre deux versions, indicateur par indicateur. */
export interface ComparaisonVersions {
  de: VersionPlanification
  a: VersionPlanification
  ecarts: { annee: AnneePlan; indicateur: CleIndicateurPlan; de: number; a: number }[]
}

// --- Quotas -----------------------------------------------------------------------------

/** Cycle d'un quota : calculé, éventuellement ajusté, puis validé (figé). */
export type StatutQuota = 'calcule' | 'ajuste' | 'valide'

export interface QuotaRecrutement {
  annee: AnneePlan
  codeTerritoire: string
  territoire: string
  sousSysteme: SousSysteme | 'non_renseigne'
  calcule: number
  retenu: number
  /** Motif de l'écart entre calcul et quota retenu, obligatoire en cas d'ajustement. */
  motifAjustement: string | null
  statut: StatutQuota
  ajustePar: string | null
  valideLe: string | null
}

/**
 * Ajustement d'un quota. Un même territoire porte un quota par sous-système :
 * le corps précise lequel.
 */
export interface CorpsAjustementQuota {
  sousSysteme: SousSysteme | 'non_renseigne'
  retenu: number
  motif: string
  auteur: string
}

export interface CorpsValidationQuotas {
  annee: AnneePlan
  auteur: string
}

export interface EvenementQuota {
  annee: AnneePlan
  codeTerritoire: string
  evenement: 'calcul' | 'ajustement' | 'validation'
  valeur: number
  motif: string | null
  auteur: string | null
  le: string
}

// --- Indicateurs de suivi -------------------------------------------------------------

export interface IndicateurSuivi {
  code:
    'couverture_besoin' | 'mobilisation_vivier' | 'realisation_nominations' | 'ecart_prevu_realise' | 'besoin_residuel'
  libelle: string
  valeur: number | null
  unite: 'pourcentage' | 'nombre'
  detail: string
}

export interface IndicateursSuivi {
  perimetre: string
  indicateurs: IndicateurSuivi[]
}

export interface EvolutionIndicateurs {
  points: { version: number; calculeLe: string; indicateurs: IndicateurSuivi[] }[]
}

// --- Filtres ----------------------------------------------------------------------------

/** Filtres propres aux routes de planification (section 3 du document des routes). */
export interface FiltresPlanification {
  /** Scénario dont les mouvements sont pris en compte ; le scénario retenu par défaut. */
  scenario?: string
  annee?: AnneePlan
  /** Version de la planification ; la dernière par défaut. */
  version?: number
}
