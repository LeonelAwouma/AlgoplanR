/**
 * Contrat de l'API — modèle de la simulation d'affectation (Moteur B), aligné
 * sur le Référentiel technique de modélisation des plans de rotation, de
 * redéploiement et de déploiement. Repris du moteur de référence, sans les
 * structures internes au calcul que l'API n'expose pas (jeu de données brut,
 * index du diagnostic).
 *
 * Le vocabulaire est volontairement séparé du diagnostic (Moteur A) : ici on ne
 * parle plus de volumes observés mais de postes ouverts, de candidatures, de
 * propositions et de décisions d'arbitrage. Le moteur produit des propositions,
 * jamais des décisions irrévocables (§3.10).
 */

import type { ClassementEcole, PrioriteEcole, SousSysteme, Teacher, Zone } from './education'
import type { FaitPrinceApplique } from './prince'

/**
 * Périmètre géographique autorisé pour un mouvement.
 *   commune / département : contrainte de simulation ;
 *   étendu : niveau régional puis niveau central (demandes interrégionales, §3.6).
 */
export type GeographicScope = 'commune' | 'departement' | 'etendu'

/**
 * Barème individuel (étage 1) et score d'appariement (étage 2).
 *
 * Étage 1 — barème individuel, propre à l'enseignant :
 *   C1 carrière et zone, C2 ancienneté au poste, C3 charges familiales,
 *   C4 formation continue, C5 cohorte d'âge, chacun pondéré.
 * Étage 2 — score d'appariement enseignant ↔ poste :
 *   Z1 × barème + Z2 × poids du poste u + Z3 × proximité + Z4 × ajustements.
 *
 * Le barème ordonne les départs d'une école excédentaire ; le score d'appariement
 * choisit, à proximité égale, l'enseignant proposé sur un poste (redéploiement
 * obligatoire) et peut, en variante, classer les candidats à une même école.
 */
export interface ScoringConfig {
  seuils: {
    /** Jusqu'à cet âge, un enseignant est « jeune » (cohorte et appui aux multigrades). */
    ageJeuneAns: number
    /** À partir de cet âge, un enseignant est « senior ». */
    ageSeniorAns: number
  }
  poidsBaremeIndividuel: {
    carriereZone: number
    anciennetePoste: number
    chargesFamiliales: number
    formationContinue: number
    cohorteAge: number
  }
  /** Points par situation matrimoniale : plus l'enseignant est libre de ses mouvements, plus il en a. */
  pointsSituationFamiliale: Record<string, number>
  /** Points retirés par enfant à charge (C3). */
  pointsParEnfant: number
  /** Points par formation continue (C4), et plafond. */
  pointsParFormation: number
  plafondFormation: number
  /** C5 : points par cohorte d'âge. */
  pointsCohorte: { jeune: number; median: number; senior: number }
  poidsScoreAppariement: { bareme: number; poidsPoste: number; proximite: number; ajustements: number }
  pointsProximite: { memeCommune: number; memeIaeb: number; memeDepartement: number; memeRegion: number; autre: number }
  ajustements: {
    /** Jeune enseignant vers une école à classes multigrades. */
    jeuneVersMultigrades: number
    /** Senior vers une structure d'encadrement (IAEB, délégation). */
    seniorVersEncadrement: number
    /** Senior vers une école sans classe multigrade. */
    allegementSenior: number
    /** Enseignant d'une zone rurale, 5 ans au poste, vers une zone urbaine. */
    transitionRuralUrbain: number
    /**
     * Bonification ciblée : l'agent cite dans son motif (rapprochement de conjoint, suivi médical) une de ses écoles
     * demandées ; les points ne vont qu'à cette école. Sans école identifiée, aucun point.
     */
    bonificationCiblee: number
  }
}

/** Règle de détermination du besoin d'une école (§2.2 à §2.4). */
export interface ReglesBesoin {
  /**
   * Norme d'encadrement : REM de référence, un maître pour ce nombre d'élèves (74,4 depuis le rapport MINEDUB
   * d'octobre 2026 ; 60 selon l'ancienne note de cadrage). Décimale conservée.
   */
  elevesParMaitre: number
  /** Tolérance d'arrondi : P = max(1 ; ⌈(N − tolérance) ÷ norme⌉). 0 = arrondi supérieur strict. */
  toleranceArrondi: number
  /** Regroupement des niveaux : nombre de niveaux tenus par un maître (2 = multigrade de deux niveaux). */
  niveauxParMaitre: number
  /**
   * Minimum pédagogique école par école : quand le fichier renseigne les classes
   * multigrades, une école sans multigrade a un maître par niveau ouvert, et chaque
   * classe multigrade économise un maître, dans la limite du regroupement.
   */
  minimumSelonMultigrades: boolean
  /** Le double flux est-il autorisé ? Sinon, une salle en double flux compte pour un maître. */
  doubleFluxAutorise: boolean
  /** Âge légal de départ à la retraite, pour repérer les départs connus et prévisibles. */
  ageRetraite: number
  /** Plancher du minimum pédagogique : m = max(plancher ; G) (3 par défaut, hypothèse à valider). */
  plancherPedagogique?: number
  /** Groupes pédagogiques supposés quand Classes_Multigrades n'est pas renseigné (6 : école complète). */
  groupesSecours?: number
  /** Lire Classes_Ouvertes comme le nombre de groupes-classes qui fonctionnent séparément (G observé). */
  groupesDepuisClassesOuvertes?: boolean
  /** Mobiliser sans validation l'excédent qui dépend d'une hypothèse sur les groupes (désactivé par défaut). */
  mobiliserExcedentIncertain?: boolean
}

/** Poids de vulnérabilité et indice de priorité des postes (§3.1). */
export interface ReglesPriorite {
  /** Coefficients t1 (accessibilité) et t2 (sécurité) du poids wp = t1·α + t2·σ, avec t1 + t2 = 1 (0,4 et 0,6). */
  coefAccessibilite: number
  coefSecurite: number
}

/** Rotation, redéploiement et score de priorité (§3.2 à §3.9). */
export interface ReglesMobilite {
  /**
   * Stabilité minimale au poste (5 ans) : seuil de recevabilité d'une demande et
   * du bonus forfaitaire de stabilité de C2.
   */
  stabiliteMinimaleAns: number
  /** C2 : au-delà de cette ancienneté au poste (6 ans), chaque année ajoute `pointsParAnSupplementaire`. */
  ancienneteDebutPointsAns: number
  /** C2 : bonus forfaitaire de stabilité, acquis dès la stabilité minimale (5 points). */
  pointsAncienneteBase: number
  pointsParAnSupplementaire: number
  /** Plafond de C2 ; 0 = sans plafond (la note n'en prévoit pas). */
  plafondAnciennete: number
  /** Proximité de la retraite (en années) : un enseignant à moins de cette durée de la retraite est « proche de la retraite ». */
  anneesAvantRetraite: number
  malusRetraite: number
  pointsAnneeNiveau1: number
  pointsAnneeNiveau2: number
  /** Plancher du multiplicateur de zone : Z = max(plancher ; 2·n1 + n2), 10 par défaut. */
  plancherZoneDifficile: number
  /** Traiter les vœux des enseignants (phase 1). */
  phaseVoeux: boolean
  /**
   * Régions étanches : un enseignant n'est affecté que dans sa région. Ceux pour qui il ne reste de poste
   * qu'ailleurs restent dans le vivier et vont à la commission d'arbitrage (le prince et la commission décident).
   */
  regionsEtanches: boolean
}

/**
 * Paramètres complets du produit. Une simulation en conserve une copie figée,
 * pour que ses résultats restent reproductibles.
 */
export interface EngineSettings {
  anneeScolaire: string
  besoin: ReglesBesoin
  /** Seuils de déficit relatif (besoin ÷ cible) séparant les sévérités. */
  seuilsSeverite: { faible: number; important: number }
  priorite: ReglesPriorite
  mobilite: ReglesMobilite
  scoring: ScoringConfig
}

/** Un poste à couvrir : une unité de besoin d'une école nécessiteuse, ou une place d'une structure. */
export interface TeachingPost {
  id: string
  schoolId: string
  nomEtab: string
  region: string
  departement: string
  commune: string
  zone: Zone
  typeEtab: string
  /** Circonscription IAEB de l'école. */
  iaeb: string
  sousSysteme: SousSysteme | null
  estStructure: boolean
  /** Section d'une école bilingue : le poste n'est pas « en classe standard monolingue ». */
  ecoleBilingue: boolean
  classesMultigrades: number
  prioriteLocale: number
  /** Postes ouverts de l'école dont ce poste est issu. */
  deficitEcole: number
  elevesParEnseignantEtat: number | null
  priorite: PrioriteEcole
  /** Rang de priorité (1 = servi en premier), toutes écoles et structures confondues. */
  rang: number
  pourvu: boolean
}

/** Un enseignant d'une école excédentaire, mobilisable en redéploiement obligatoire. */
export interface PoolTeacher {
  teacher: Teacher
  /** Barème individuel, qui ordonne les départs imposés au sein d'une école. */
  bareme: number
  ecoleOrigine: { id: string; nom: string; excedentMobilisable: number }
  rangDansEcole: number
  /** Protégé des transferts imposés (proximité de la retraite). */
  protege: boolean
  affecte: boolean
  /** Non affecté parce qu'il ne reste de poste libre que hors de sa région : à examiner par la commission d'arbitrage. */
  horsRegion?: boolean
}

/** Vivier de redéploiement : les maîtres au-delà de la dotation théorique (§2.4). */
export interface RedeploymentPool {
  teachers: PoolTeacher[]
  ecolesSources: {
    schoolId: string
    nomEtab: string
    region: string
    departement: string
    commune: string
    excedentMobilisable: number
    candidatsRetenus: number
  }[]
  exclusions: { code: string; label: string; count: number }[]
  /** Total des excédents mobilisables, avant toute contrainte géographique. */
  excedentTotal: number
}

/** Une composante du score, affichée telle quelle dans « Pourquoi cette proposition ? ». */
export interface ScoreComponent {
  label: string
  valeur: number
  poids: number
  contribution: number
}

export interface ScoreBreakdown {
  total: number
  components: ScoreComponent[]
}

/** Taux d'encadrement et turnover d'un territoire, avant l'algorithme (fichier d'origine) et après. */
export interface IndicateursEncadrement {
  territoire: string
  eleves: number
  enseignantsAvant: number
  enseignantsApres: number
  /** Élèves par enseignant. */
  remAvant: number
  remApres: number
  /** Enseignants du fichier. */
  effectif: number
  /** Enseignants dont l'ancienneté au poste est sous le seuil. */
  recents: number
  /** Enseignants déplacés par le scénario. */
  deplaces: number
  /** Parts de l'effectif, entre 0 et 1. */
  turnoverAvant: number
  turnoverApres: number
}

/** Comparaison avant / après de l'encadrement et du turnover pour un scénario. */
export interface ComparaisonEncadrement {
  scenarioId: string
  seuilAncienneteAns: number
  national: IndicateursEncadrement
  parRegion: IndicateursEncadrement[]
}

/** Niveau de proximité effectivement franchi par un mouvement. */
/** `meme_commune` couvre la même commune ou la même circonscription IAEB. */
export type ProximityLevel = 'meme_commune' | 'meme_departement' | 'meme_region' | 'hors_region'

/** Sort d'un vœu au moment de l'examen. */
export type StatutVoeu =
  'examine' | 'autre_sous_systeme' | 'hors_referentiel' | 'hors_perimetre' | 'au_dela_du_maximum' | 'meme_ecole'

export interface VoeuExamine {
  rang: number
  code: string
  /** Unité de calcul correspondante, `null` si l'école est inconnue. */
  schoolId: string | null
  nomEtab: string
  statut: StatutVoeu
  /**
   * Score d'appariement de l'agent avec un poste de cette école (Z1 à Z4, calculé par le serveur) ;
   * `null` quand l'école n'a aucun poste ouvert.
   */
  score: number | null
  /** Part du score due aux ajustements contextuels (âge, structure, zone) ; `null` sans score. Le motif saisi n'y entre pas. */
  ajustementsContextuels: number | null
  /** Composantes du score : barème (Z1), poids du poste (Z2), proximité (Z3), ajustements (Z4) ; `null` sans score. */
  composantes: { bareme: number; poidsPoste: number; proximite: number; ajustements: number } | null
  interregional: boolean
}

/** Issue d'une candidature après traitement. */
export type IssueCandidature =
  'affecte_voeu' | 'hors_voeux' | 'projete_n2' | 'sans_solution' | 'irrecevable' | 'depart_non_valide' | 'arbitrage'

/** Un enseignant qui demande une mutation, avec ses vœux et son score (§3.2 et §3.3). */
export interface Candidature {
  teacher: Teacher
  ecoleOrigine: { id: string; nom: string; excedent: number; classement: ClassementEcole | null }
  recevable: boolean
  motifsIrrecevabilite: string[]
  voeux: VoeuExamine[]
  /** A : points d'ancienneté au poste. */
  pointsAnciennete: number
  /** Z : points de service en zone difficile. */
  pointsZoneDifficile: number
  /** Proche de la retraite : malus sur A et protection éventuelle. */
  procheRetraite: boolean
  protege: boolean
  /** Rang dans le classement unique (barème décroissant, puis départage). */
  rangClassement: number
  issue: IssueCandidature
  /** Explication en clair de l'issue. */
  detailIssue: string
}

/** Nature d'un mouvement du plan (§3.10, figure 2). */
export type NatureMouvement = 'voeu' | 'hors_voeux' | 'obligatoire' | 'arbitrage'

/** Statut d'une proposition (§3.10). */
export type StatutProposition = 'propose' | 'valide' | 'arbitre' | 'rejete'

/** Une proposition d'affectation du plan de rotation et de redéploiement. */
export interface ProposedAssignment {
  /** Étape qui a produit la proposition (niveau régional, niveau central, solution proche…). */
  phase: string
  nature: NatureMouvement
  /** Rang du vœu satisfait, `null` hors vœux. */
  rangVoeu: number | null
  statut: StatutProposition
  annee: 'N+1'
  postId: string
  teacherId: string
  nomEns: string
  prenomEns: string
  sousSysteme: SousSysteme | null

  schoolOrigineId: string
  nomEtabOrigine: string
  communeOrigine: string
  departementOrigine: string
  regionOrigine: string

  schoolDestinationId: string
  nomEtabDestination: string
  communeDestination: string
  departementDestination: string
  regionDestination: string

  niveauProximite: ProximityLevel
  /** Score de priorité S (vœux, hors vœux) ou barème individuel (obligatoire). */
  bareme: number
  score: number
  breakdown: ScoreBreakdown
  /** Décision d'arbitrage à l'origine de la proposition, le cas échéant. */
  arbitrageId?: string
}

/** Un tour de l'algorithme d'acceptation différée, pour la traçabilité (§3.4). */
export interface TourAppariement {
  niveau: string
  tour: number
  demandes: { teacherId: string; schoolId: string }[]
  /** Candidats gardés provisoirement par chaque école, à la fin du tour. */
  gardes: { schoolId: string; teacherIds: string[] }[]
  refuses: string[]
}

/** Combinaison de redéploiement proposée à la commission pour une école non couverte (§3.5). */
export interface CombinaisonArbitrage {
  type: 'direct' | 'chaine' | 'permutation'
  schoolId: string
  nomEtab: string
  indicePriorite: number
  mouvements: { teacherId: string; nom: string; deId: string; deNom: string; versId: string; versNom: string }[]
  /** Distance administrative du mouvement le plus long. */
  proximite: ProximityLevel
  description: string
}

/** Vœu portant sur l'autre sous-système, transmis à la commission (§3.10). */
export interface VoeuAutreSousSysteme {
  teacherId: string
  nom: string
  sousSystemeEnseignant: SousSysteme | null
  schoolId: string
  nomEtab: string
  sousSystemePoste: SousSysteme | null
  posteVacant: boolean
  /** Le départ de l'enseignant reste dans la limite de l'excédent de son école d'attache. */
  departDansLimiteExcedent: boolean
}

/** Projection sur l'année N+2 d'un enseignant resté dans le vivier (§3.9). */
export interface ProjectionN2 {
  teacherId: string
  nom: string
  schoolOrigineId: string
  nomEtabOrigine: string
  /** Poste projeté, `null` : aucune solution prévisible. */
  schoolId: string | null
  nomEtab: string | null
  rangVoeu: number | null
}

/** Un candidat au concours, à déployer sur les postes restés vacants (§3.8). */
export interface Recrue {
  id: string
  nom: string
  sexe: string
  sousSysteme: SousSysteme | null
  note: number
  communeResidence: string
  /** Écoles choisies, par ordre de préférence (trois au plus). */
  choix: string[]
  ligneSource: number
}

export interface AffectationRecrue {
  recrueId: string
  nom: string
  note: number
  schoolId: string
  nomEtab: string
  commune: string
  /** Choix satisfait, ou extension territoriale. */
  issue: 'choix' | 'departement' | 'region'
  rangChoix: number | null
}

export interface ResultatRecrutes {
  affectations: AffectationRecrue[]
  /** Candidats sans poste compatible dans leur région : vivier national pour arbitrage. */
  vivierNational: { recrueId: string; nom: string; note: number; motif: string }[]
  postesRestants: number
}

/** Agrégats d'un territoire pour un sous-système (§2.6). */
export interface AgregatSousSysteme {
  sousSysteme: SousSysteme | 'non_renseigne'
  /** B_T,s */
  besoin: number
  /** X_T,s */
  excedent: number
  /** SM_T,s */
  sallesManquantes: number
  /** min(B ; X) : besoin théoriquement couvrable par redéploiement. */
  couvrable: number
  /** max(0 ; B − X) : besoin restant après redéploiement. */
  restant: number
  /** E_T,s : effectif enseignant. */
  effectif: number
  /** REC_T,s = R + ⌈τ* × E ÷ 100⌉. */
  recrutementAPrevoir: number
  /** Somme des cibles K. */
  sommeCibles: number
}

export interface SyntheseTerritoriale {
  parSousSysteme: AgregatSousSysteme[]
  besoin: number
  excedent: number
  sallesManquantes: number
  couvrable: number
  restant: number
  recrutementAPrevoir: number
  /** Taux de déséquilibre des dotations : (besoin + excédent) ÷ somme des cibles, `null` sans cible. */
  tauxDesequilibre: number | null
  /**
   * Degré d'aléa statistique : 1 − R² de la régression, école par école, des enseignants sur les élèves
   * (distinct du taux de déséquilibre). `null` quand il n'est pas calculable (voir `degreAleaRaison`).
   */
  degreAlea: number | null
  /** Fiabilité (E5) : « non_calculable » sous 3 écoles renseignées, « indicatif » de 3 à 9, « normal » ensuite. */
  degreAleaStatut: 'non_calculable' | 'indicatif' | 'normal'
  degreAleaRaison: string | null
}

/** Décision d'une commission sur une proposition ou une affectation (§3.10). */
export interface DecisionArbitrage {
  id: string
  teacherId: string
  nomEnseignant: string
  /** Proposition algorithmique initiale, conservée telle quelle. */
  propositionInitiale: { schoolId: string; nomEtab: string; nature: NatureMouvement | null } | null
  decision: 'valider' | 'rejeter' | 'modifier'
  /** École retenue par la commission (décision « modifier »). */
  schoolDestinationId: string | null
  nomEtabDestination: string | null
  /** La commission change le sous-système de l'enseignant (§3.10). */
  changementSousSysteme: boolean
  motif: string
  instance: 'regionale' | 'centrale'
  decideLe: string
}

export interface DecisionArbitrageAppliquee {
  decision: DecisionArbitrage
  appliquee: boolean
  motif: string
}

/** Photographie d'une situation, avant ou après simulation. */
export interface SituationSnapshot {
  ecolesEnDeficit: number
  postesVacants: number
  deficitTotal: number
  parRegion: { region: string; deficit: number }[]
  pressionMoyenne: number | null
}

/** Vérification d'un invariant métier après simulation. */
export interface InvariantCheck {
  code: string
  label: string
  ok: boolean
  detail: string
}

export interface SimulationLogEntry {
  etape: string
  message: string
  valeur: number | null
}

/** Un scénario : un périmètre géographique et un jeu de paramètres figés. */
export interface SimulationScenario {
  id: string
  nom: string
  description: string
  scope: GeographicScope
  settings: EngineSettings
  createdAt: string
  predefini: boolean
}

/** Résultat complet d'une simulation : le plan de rotation et de redéploiement. */
export interface SimulationResult {
  scenarioId: string
  scenarioNom: string
  scope: GeographicScope

  besoinInitial: number
  postesCouverts: number
  besoinResiduel: number
  enseignantsDeplaces: number
  ecolesBeneficiaires: number
  ecolesSources: number
  tauxCouverture: number
  mouvementsParPerimetre: { niveau: ProximityLevel; nombre: number }[]
  /** Mouvements par nature : vœux, hors vœux, obligatoires, arbitrages. */
  mouvementsParNature: { nature: NatureMouvement; nombre: number }[]

  /** Plan individualisé : propositions retenues (les rejetées n'y figurent pas). */
  assignments: ProposedAssignment[]
  /** Enseignants du vivier sans affectation. */
  unmatchedTeachers: PoolTeacher[]
  uncoveredPosts: TeachingPost[]
  pool: RedeploymentPool

  /** Liste des postes classés par priorité (§3.1). */
  postes: TeachingPost[]
  /** Synthèse des vœux : toutes les demandes de mutation, recevables ou non (§3.2). */
  candidatures: Candidature[]
  /** Tours de l'algorithme d'acceptation différée (§3.4), tronqués sur de gros volumes. */
  tours: TourAppariement[]
  toursTronques: boolean
  combinaisons: CombinaisonArbitrage[]
  voeuxAutreSousSysteme: VoeuAutreSousSysteme[]
  projectionsN2: ProjectionN2[]
  /** Postes projetés en N+2 (départs prévisibles pendant N+1). */
  postesProjetesN2: number
  recrutes: ResultatRecrutes | null
  arbitrages: DecisionArbitrageAppliquee[]

  syntheseAvant: SyntheseTerritoriale
  syntheseApres: SyntheseTerritoriale
  /** Postes en zone rouge restés sans maître : volontariat, primes ou recrutement. */
  postesZoneRougeNonPourvus: number

  before: SituationSnapshot
  after: SituationSnapshot

  faitsPrince: FaitPrinceApplique[]

  invariants: InvariantCheck[]
  logs: SimulationLogEntry[]
  computedAt: string
}

export interface DecisionReportSection {
  titre: string
  /** Paragraphes de texte, tous construits à partir de valeurs calculées. */
  paragraphes: string[]
  /** Tableau optionnel accompagnant la section. */
  tableau?: { entetes: string[]; lignes: (string | number)[][] }
  /** Liste à puces optionnelle. */
  points?: string[]
}

/** Rapport décisionnel assemblé à partir des résultats calculés (§19). */
export interface DecisionReport {
  genereLe: string
  anneeScolaire: string
  perimetre: string
  sections: DecisionReportSection[]
}
