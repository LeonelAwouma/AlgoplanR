/**
 * Contrat de l'API — modèle « éducation » : territoires, établissements,
 * enseignants et diagnostic de ressources, tels que le backend les sérialise
 * en JSON.
 *
 * Repris du modèle du moteur de référence (moteur-reference/types/education.ts),
 * dont le backend Django est le portage. Seule différence : les dates sont des
 * chaînes ISO 8601, le JSON n'ayant pas de type date.
 */

/** Zone déclarée de l'établissement ou de rattachement de l'enseignant. */
export type Zone = 'urbaine' | 'semi_urbaine' | 'rurale' | 'inconnue'

/**
 * Sous-système d'enseignement (référentiel §1.2.3). Les deux sous-systèmes sont
 * traités séparément à toutes les étapes : aucun besoin n'est compensé de l'un à
 * l'autre et l'algorithme n'affecte personne hors de son sous-système.
 */
export type SousSysteme = 'francophone' | 'anglophone'

/** Zone de sécurité de l'école ou de la structure (référentiel §3.1). */
export type ZoneSecurite = 'verte' | 'jaune' | 'rouge'

/** Accessibilité retenue pour le poids de vulnérabilité (référentiel §3.1). */
export type Accessibilite = 'urbain' | 'semi_urbain' | 'rural' | 'rural_enclave'

/**
 * Classement d'une école après diagnostic (référentiel §2.4) :
 *   nécessiteuse si b > 0, excédentaire si x > 0, à examiner si a > 0,
 *   équilibrée dans les autres cas.
 */
export type ClassementEcole = 'necessiteuse' | 'excedentaire' | 'a_examiner' | 'equilibree'

/** Motif d'une demande de mutation (référentiel §3.2). */
export type MotifDemande = 'convenance' | 'sante' | 'regroupement_familial' | 'rotation_zone_difficile' | 'autre'

/** Niveaux de la hiérarchie géographique : Cameroun → Région → Département → Commune → École. */
export type TerritoryLevel = 'national' | 'region' | 'departement' | 'commune' | 'ecole'

/** Les six niveaux du cycle primaire camerounais, dans l'ordre pédagogique. */
export const NIVEAUX_PRIMAIRE = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'] as const
export type NiveauPrimaire = (typeof NIVEAUX_PRIMAIRE)[number]

/**
 * Sévérité de la situation d'un établissement. Les seuils qui séparent
 * « faible », « important » et « critique » sont configurables
 * (voir EngineSettings.seuilsSeverite) et documentés dans la Méthodologie.
 */
export type SchoolSeverity = 'excedent' | 'satisfaisant' | 'deficit_faible' | 'deficit_important' | 'deficit_critique'

/** Un nœud de la hiérarchie géographique, identifié par son chemin complet. */
export interface EducationTerritory {
  /** Chemin unique, ex. « Centre/Mfoundi/Yaoundé VII ». Vide pour le niveau national. */
  code: string
  level: TerritoryLevel
  nom: string
  region: string | null
  departement: string | null
  commune: string | null
  /** Code du territoire parent, `null` au niveau national. */
  parentCode: string | null
}

/**
 * Un établissement tel qu'il ressort du fichier importé, après normalisation.
 * Les champs « élèves » restent optionnels : les anciens fichiers, qui ne les
 * contiennent pas, doivent continuer à fonctionner (§26 du cahier des charges).
 */
export interface School {
  /**
   * Identifiant de l'unité de calcul : le code de l'école pour une école
   * monolingue, le code suivi de « -FR » ou « -EN » pour chaque section d'une
   * école bilingue (référentiel §2.4, « Écoles bilingues et sous-systèmes »).
   */
  id: string
  /** Code de l'établissement tel qu'il figure dans le fichier. */
  codeEcole: string
  /** Circonscription de l'inspection d'arrondissement (IAEB), vide si non renseignée. */
  iaeb: string
  /** Coordonnées géographiques, quand le fichier les fournit (cartographie). */
  latitude: number | null
  longitude: number | null
  nom: string
  region: string
  departement: string
  commune: string
  zone: Zone
  /** Zone telle qu'écrite dans le fichier, conservée pour l'affichage. */
  zoneBrute: string
  typeEtab: string

  /**
   * Capacité en maîtres BMAX = salles simple flux + 2 × salles double flux. Ce n'est pas le nombre de classes ouvertes :
   * 0 quand les salles ne sont pas renseignées (voir `sallesRenseignees`).
   */
  capaciteMaitres: number
  /** Classes réellement ouvertes (colonne optionnelle Classes_Ouvertes), `null` tant que le fichier ne la donne pas. */
  nombreClassesOuvertes: number | null
  /** Le fichier renseigne les salles : sinon la capacité est inconnue, et non nulle. */
  sallesRenseignees: boolean
  /** Salles de classe utilisables S (simple et double flux), `null` si non renseigné. */
  nbSallesClasse: number | null
  /** Parmi elles, salles fonctionnant en double flux (S^DF), `null` si non renseigné. */
  sallesDoubleFlux: number | null
  /** Niveaux ouverts (1 à 6), `null` si non renseigné : sert au minimum pédagogique. */
  niveauxOuverts: number | null
  /** Départs déjà connus pour la rentrée (retraites notamment), déclarés dans le fichier. */
  departsConnusDeclares: number | null

  sousSysteme: SousSysteme | null
  zoneSecurite: ZoneSecurite | null
  accessibilite: Accessibilite | null
  /**
   * Structure administrative (délégation régionale ou départementale, IAEB) : sans
   * élèves, ni REM ni BMAX, ses postes sont fixés par la hiérarchie.
   */
  estStructure: boolean
  nbEnseignantsEtat: number
  nbAutresEnseignants: number | null

  /**
   * Postes officiellement déclarés dans le fichier (`nb_postes_ouverts`).
   * `null` quand la colonne est absente : cette donnée n'est jamais écrasée
   * par le besoin calculé, les deux sont affichés séparément.
   */
  nbPostesOuvertsDeclares: number | null

  classesMultigrades: number
  /**
   * Vrai si le fichier renseigne les classes multigrades de l'école. Le minimum
   * pédagogique en dépend alors école par école : sans classe multigrade, chaque
   * niveau ouvert a son maître.
   */
  classesMultigradesRenseignees: boolean
  prioriteLocale: number

  effectifTotalEleves: number | null
  effectifFilles: number | null
  effectifGarcons: number | null
  effectifParNiveau: Partial<Record<NiveauPrimaire, number>>

  /** Index de la ligne source dans le classeur (1 = première ligne de données). */
  ligneSource: number
}

/** Un enseignant tel qu'il ressort du fichier importé, après normalisation. */
export interface Teacher {
  id: string
  nom: string
  prenom: string
  /** Date de naissance au format ISO 8601 (`1975-03-14`), `null` si inconnue. */
  dateNaissance: string | null
  age: number | null

  idEtabAttache: string
  communeAttache: string
  departementAttache: string
  regionAttache: string
  zoneAttache: Zone
  /** Circonscription IAEB de l'école d'attache. */
  iaebAttache: string

  ancienneteCarriereAns: number
  anciennetePosteAns: number
  situationFamiliale: string
  nbEnfants: number
  formationContinue: number

  statut: string
  payeParEtat: boolean

  sexe: string
  categorie: string
  fonction: string
  /** Sous-système de l'enseignant, d'après sa formation initiale. */
  sousSysteme: SousSysteme | null
  /** Écoles sollicitées, par ordre de préférence (codes d'établissement). Vide : pas de demande. */
  voeux: string[]
  motifDemande: MotifDemande | null
  /** École visée par un motif justifié (santé, regroupement familial), qui reçoit la bonification ciblée. */
  ecoleMotif: string | null
  /** Années de service en école de niveau de difficulté 1, puis 2 (dossier de carrière). */
  anneesZoneNiveau1: number
  anneesZoneNiveau2: number
  /** Rang tiré au sort avant la commission, pour le départage ultime. */
  rangTirage: number | null

  /**
   * Renseigné quand l'enseignant a été redéployé par fait de Prince (décision
   * de la DRH). Il est alors rattaché à sa nouvelle école et exclu du vivier :
   * l'algorithme ne le remet jamais en mouvement.
   */
  faitPrinceId?: string
  /**
   * École de référence : celle du fichier importé. Pour un enseignant déplacé par un fait du Prince, l'école de
   * rattachement des bases est la destination décidée ; l'école de référence en est distincte.
   */
  idEtabReference?: string
  nomEtabReference?: string

  ligneSource: number
}

/** Raison factuelle expliquant la position d'une école dans les priorités (§9). */
export interface DiagnosticReason {
  code:
    | 'deficit'
    | 'pression_eleves'
    | 'classes_multigrades'
    | 'priorite_locale'
    | 'effectif_eleve'
    | 'ecart_postes_declares'
  /** Phrase prête à afficher, construite uniquement à partir des données calculées. */
  texte: string
}

/**
 * Diagnostic de ressources d'un établissement (Moteur A). Ne contient aucune
 * proposition d'affectation : uniquement des volumes observés et calculés.
 */
export interface SchoolDiagnostic {
  school: School

  enseignantsEtat: number

  /**
   * Dotation théorique D = max(P ; m) : ce dont les élèves ont besoin. L'école ne
   * descend jamais sous ce seuil par redéploiement.
   */
  enseignantsMinimumAConserver: number
  /** Besoin en maîtres b = max(0 ; K − E) : postes à ouvrir. */
  besoinTheorique: number
  /** Postes déclarés dans le fichier, `null` si la colonne est absente. */
  postesDeclares: number | null
  /** postesDeclares − besoinTheorique, `null` si les postes déclarés manquent. */
  ecartBesoinDeclare: number | null
  /** Excédent mobilisable x = max(0 ; E − D). */
  excedentTheorique: number
  /**
   * Enseignants réellement redéployables : au plus x, parmi ceux qui ont l'ancienneté de poste requise
   * (le vivier du moteur). Absent des anciennes données : l'excédent théorique en tient lieu.
   */
  enseignantsMobilisables?: number

  /** Grandeurs du calcul du besoin, dans l'ordre du référentiel (§2.4). */
  calcul: CalculBesoin
  classement: ClassementEcole
  priorite: PrioriteEcole

  elevesParEnseignant: number | null
  elevesParEnseignantEtat: number | null
  elevesParClasse: number | null
  effectifMoyenParNiveau: number | null
  /**
   * Rapport entre les élèves par enseignant État et la cible configurée.
   * `null` si la cible n'est pas renseignée ou si les effectifs manquent.
   */
  pressionPedagogique: number | null

  /** Nombre d'enseignants manquants (= besoinTheorique). */
  deficitAbsolu: number
  /** deficitAbsolu / besoinNormatif, `null` si le besoin normatif est nul. */
  deficitRelatif: number | null

  severite: SchoolSeverity
  raisons: DiagnosticReason[]
}

/** Détail du calcul du besoin d'une école (référentiel §2.2 à §2.4). */
export interface CalculBesoin {
  /** N : élèves attendus, `null` sans effectif (le calcul se replie alors sur les classes). */
  eleves: number | null
  /** Enseignants de l'État en poste, avant déduction des départs connus. */
  enseignantsEnPoste: number
  /** Départs connus à la rentrée (retraites…). */
  departsConnus: number
  /** E : maîtres retenus à la rentrée. */
  enseignantsRetenus: number
  /** P : maîtres nécessaires selon la norme d'élèves par maître. */
  norme: number
  /** m : minimum pédagogique. */
  minimumPedagogique: number
  /** D = max(P ; m). */
  dotation: number
  /** BMAX : maîtres affectables selon les salles, `null` si les salles ne sont pas renseignées. */
  bmax: number | null
  /** K = min(D ; BMAX). */
  cible: number
  /** b = max(0 ; K − E). */
  besoin: number
  /** x = max(0 ; E − D). */
  excedent: number
  /** a = max(0 ; min(E ; D) − BMAX) : maîtres au-delà des salles mais utiles aux élèves. */
  surnombre: number
  /** s = max(0 ; D − BMAX) : salles manquantes, signalées comme besoin en infrastructures. */
  sallesManquantes: number
  /** REM actuel : élèves ÷ enseignants en poste, `null` sans élèves ou sans maître. */
  remActuel: number | null
  /** « norme_eleves » : règle du référentiel ; « repli_classes » : sans effectifs, une classe = un maître. */
  methode: 'norme_eleves' | 'repli_classes'
}

/** Poids de vulnérabilité et indice de priorité d'une école ou d'une structure (référentiel §3.1). */
export interface PrioriteEcole {
  /** α : points d'accessibilité. */
  pointsAccessibilite: number
  /** σ : points de sécurité. */
  pointsSecurite: number
  /** Vulnérabilité wp = t1·α + t2·σ (t1 + t2 = 1). */
  poids: number
  /** Niveau de difficulté 1, 2 ou 3 fixé par le poids. */
  niveauDifficulte: 1 | 2 | 3
  /** β : points de besoin selon le REM actuel (nul pour une structure). */
  pointsBesoin: number
  /** Poids du poste Up = wp + βp. */
  indice: number
  /** Zone de sécurité de l'école, `null` si non renseignée (comptée en zone verte). */
  zoneSecurite: ZoneSecurite | null
  zoneRouge: boolean
  /**
   * Rang d'accueil calculé par le serveur (1 = premier ; `null` pour une école sans besoin) : poids du poste décroissant,
   * écoles avant structures, puis REM le plus élevé. C'est l'ordre unique, affiché tel quel.
   */
  rang: number | null
}

/** Volume de besoin d'un établissement, utilisé pour construire les postes. */
export interface TeacherNeed {
  schoolId: string
  nombre: number
}

/** Volume d'excédent mobilisable d'un établissement, plafond de départs autorisés. */
export interface TeacherSurplus {
  schoolId: string
  nombre: number
}

/** Totaux d'un périmètre territorial, tous calculés à partir des diagnostics. */
export interface TerritorialTotals {
  ecolesAnalysees: number
  ecolesEnDeficit: number
  ecolesAvecExcedent: number
  ecolesSatisfaisantes: number

  /** Classes ouvertes des écoles qui les renseignent, `null` si aucune école ne les renseigne. */
  classes: number | null
  enseignantsEtat: number
  autresEnseignants: number | null

  postesNecessaires: number
  postesDeclares: number | null
  /** Enseignants réellement redéployables (somme des enseignantsMobilisables, comme « disponibles » du moteur). */
  excedentMobilisable: number
  /** SM_T : salles manquantes. */
  sallesManquantes: number
  /** Maîtres en surnombre par rapport aux salles, mais utiles aux élèves. */
  surnombre: number
  /** Écoles à examiner (surnombre lié aux salles). */
  ecolesAExaminer: number

  effectifTotalEleves: number | null
  elevesParEnseignantEtat: number | null
  /** Élèves ÷ classes ouvertes, sur les seules écoles qui donnent les deux ; `null` sinon. */
  elevesParClasse: number | null

  classesMultigrades: number
}

/** Agrégat d'un territoire, avec ses enfants directs dans la hiérarchie. */
export interface TerritorialSummary {
  territory: EducationTerritory
  totals: TerritorialTotals
  /** Identifiants des écoles rattachées à ce territoire (transitivement). */
  schoolIds: string[]
  children: TerritorialSummary[]
}
