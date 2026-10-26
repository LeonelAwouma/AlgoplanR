/**
 * Contrat de l'API — contexte « Données » : import des classeurs, jeux de
 * données, validation, actualisations, fiches établissement et enseignant,
 * recherche.
 */

import type { IdJeu } from './commun'
import type { School, SchoolDiagnostic, Teacher } from './education'
import type { ColumnMappingReport, DataQualityReport } from './qualite'
import type { ScoreBreakdown } from './simulation'
import type { BilanImportPrince } from './decisions'

/** Nature d'un classeur importé. */
export type TypeFichier = 'etablissements' | 'enseignants'

/** Classeur qui peut être envoyé au serveur : les deux fichiers de base, ou celui des faits du Prince. */
export type TypeFichierEnvoi = TypeFichier | 'prince'

/** Classeurs dont le serveur publie les colonnes attendues : les fichiers envoyés et celui des recrues. */
export type TypeColonnes = TypeFichierEnvoi | 'recrues'

/** Colonne que le serveur cherche dans un classeur (dictionnaire de reconnaissance). */
export interface ColonneAttendue {
  /** Nom du champ métier. */
  champ: string
  /** Libellé lisible. */
  label: string
  /** Colonne indispensable : son absence bloque l'analyse. */
  requis: boolean
  /** Ce que l'on perd si la colonne est absente. */
  consequence: string
  /** Intitulés reconnus, le premier servant d'exemple. */
  alias: string[]
}

/** Classeur reçu par le serveur, prêt à être rattaché à un jeu (`POST fichiers/`). */
export interface FichierImporte {
  id: string
  type: TypeFichierEnvoi
  nomFichier: string
  /** Feuilles du classeur ; une seule pour un CSV. */
  feuilles: string[]
  feuilleLue: string
  /** Nombre de lignes de données lues. */
  lignes: number
  /** Premières lignes, pour l'aperçu, indexées par en-tête. */
  apercu: Record<string, string | number | boolean | null>[]
  /** Reconnaissance des colonnes ; celles sous 0,85 de confiance sont à confirmer. */
  correspondances: ColumnMappingReport
  /** Fichier de la base nationale : un délégué n'en retient que les lignes de sa région. */
  baseNationale: boolean
}

/** Envoi d'un classeur (formulaire multipart). */
export interface CorpsEnvoiFichier {
  [champ: string]: string | Blob | undefined
  type: TypeFichierEnvoi
  fichier: Blob
  /** Feuille à lire ; la première par défaut. */
  feuille?: string
  /**
   * `'true'` : fichier de la base nationale (toutes régions). Le serveur n'en retient, pour un délégué, que
   * les écoles de sa région et les enseignants qui y sont attachés, au lieu de refuser le fichier.
   */
  baseNationale?: 'true'
}

/** Correction manuelle des correspondances : champ métier → en-tête du fichier (`null` = aucun). */
export interface CorpsCorrespondances {
  correspondances: Record<string, string | null>
}

/** Création d'un jeu à partir de deux fichiers déjà envoyés. */
export interface CorpsCreationJeu {
  etablissements: string
  enseignants: string
  /** Faits du Prince (DRH) : appliqués avant l'algorithme, qui calcule ensuite normalement le reste. */
  prince?: string
  /** Date de référence des âges (ISO 8601), aujourd'hui par défaut. */
  dateReference?: string
  /** Année scolaire des données importées, « AAAA-AAAA » (base des projections) : l'année en cours par défaut. */
  anneeScolaire?: string
  /** Sens de l'année saisie : année des données (par défaut) ou rentrée préparée (données de l'année précédente). */
  sensAnneeScolaire?: SensAnneeScolaire
  /** Jeu de test fictif, déclaré par la personne qui l'importe : un bandeau l'indique dans les vues et les exports. */
  donneesFictives?: boolean
}

/**
 * Sens de l'année saisie d'un jeu : `donnees` (année des données observées, la base), `rentree_preparee` (rentrée que
 * le jeu prépare : les données sont celles de l'année précédente), `non_confirme` (jeu antérieur à cette distinction,
 * lu comme l'année des données en attendant une confirmation explicite).
 */
export type SensAnneeScolaire = 'donnees' | 'rentree_preparee' | 'non_confirme'

/** Confirmation du sens de l'année ou déclaration de l'origine fictive d'un jeu (`PATCH jeux/{jeu}/`). */
export interface CorpsModificationJeu {
  sensAnneeScolaire?: SensAnneeScolaire
  donneesFictives?: boolean
}

/** Statut d'un jeu : il ne sert de référence aux projections qu'une fois validé. */
export type StatutJeu = 'brouillon' | 'valide'

/** Un jeu de données : l'exercice de planification, agrégat racine du backend. */
export interface JeuDeDonnees {
  id: IdJeu
  /** Jeu de démonstration embarqué, jamais présenté comme officiel. */
  demonstration: boolean
  importeLe: string
  fichiersSource: { etablissements: string | null; enseignants: string | null }
  anneeScolaire: string
  /** Sens de l'année saisie et année des données qui en découle (base des projections). */
  sensAnneeScolaire: SensAnneeScolaire
  anneeDonnees: string
  /** Origine fictive vérifiable : jeu de démonstration, ou marqueur déclaré ; jamais déduite du nom ni de la taille. */
  donneesFictives: boolean
  statut: StatutJeu
  nbEtablissements: number
  nbEnseignants: number
  /** Écoles hors structures administratives, après séparation des sections bilingues. */
  nbUnitesCalcul: number
  /** Scénario dont les mouvements alimentent la planification, `null` tant qu'aucun n'est retenu. */
  scenarioRetenuId: string | null
  /** Faits du Prince actuellement appliqués. */
  nbFaitsPrinceActifs: number
  donneesElevesDisponibles: boolean
  /** Nom donné par le serveur (import, démonstration, consolidation). */
  nom?: string
  /**
   * Portée fixée par le serveur : `regional` (ouvert au délégué de la région, en lecture au DRH),
   * `national` (jeu du DRH, consolidé ou de démonstration), `national_herite` (antérieur au contrôle des
   * accès : DRH, lecture seule).
   */
  portee?: PorteeJeu
  region?: string | null
}

export type PorteeJeu = 'regional' | 'national' | 'national_herite'

/** Qualité d'un jeu et correspondance des colonnes de ses fichiers (`GET jeux/{jeu}/qualite/`). */
export interface QualiteJeu {
  /** Rapport de qualité, `null` pour le jeu de démonstration, produit par l'application elle-même. */
  rapport: DataQualityReport | null
  correspondances: Record<TypeFichier, ColumnMappingReport | null>
}

/** Réponse à la création d'un jeu. */
export interface JeuCree {
  jeu: JeuDeDonnees
  qualite: DataQualityReport
  /** Bilan du fichier des faits du Prince, absent quand aucun n'a été joint. */
  prince?: BilanImportPrince
}

/** Contrôle effectué avant de valider un jeu comme référence. */
export interface ControleValidation {
  code: string
  libelle: string
  ok: boolean
  /** Un contrôle bloquant non satisfait empêche la validation. */
  bloquant: boolean
  /**
   * Contrôle bloquant dont la DRH peut s'affranchir en validant « avec réserve » (écart d'effectif déclaré / matricules
   * pour les écoles touchées par un fait du Prince). Les contrôles structurels ne se dérogent jamais.
   */
  derogeable?: boolean
  detail: string
}

/** Validation d'un jeu comme référence des projections. */
export interface CorpsValidationJeu {
  auteur: string
  /** Motif de la validation « avec réserve DRH » ; obligatoire pour déroger, réservé à la DRH. */
  reserve?: string
}

/** Réserve émise par la DRH en validant un jeu malgré des contrôles dérogeables. */
export interface ReserveValidation {
  motif: string
  auteur: string
  le: string
  controles: { code: string; libelle: string; detail: string }[]
}

/** Actualisation d'un exercice avec deux nouveaux fichiers déjà envoyés. */
export interface CorpsActualisation {
  etablissements: string
  enseignants: string
  auteur: string
}

/** État de validation d'un jeu (étape 1 de la chaîne de traitement). */
export interface ValidationJeu {
  statut: StatutJeu
  valideLe: string | null
  validePar: string | null
  /** Renseignée quand le jeu est validé « avec réserve DRH » ; `null` pour une validation normale. */
  reserve?: ReserveValidation | null
  controles: ControleValidation[]
}

/** Actualisation des données d'un même exercice. */
export interface Actualisation {
  id: string
  realiseeLe: string
  realiseePar: string | null
  fichiersSource: { etablissements: string; enseignants: string }
  /** Résumé des écarts, détaillés par `actualisations/{actualisation}/ecarts/`. */
  resume: { arrivees: number; departs: number; changementsEcole: number; decisionsInvalidees: number }
}

/** Écarts introduits par une actualisation. */
export interface EcartsActualisation {
  arrivees: { matricule: string; nom: string; ecole: string }[]
  departs: { matricule: string; nom: string; ecole: string }[]
  changementsEcole: { matricule: string; nom: string; ancienneEcole: string; nouvelleEcole: string }[]
  /** Décisions (fait du Prince, arbitrage, nomination) qui ne s'appliquent plus. */
  decisionsInvalidees: { type: string; id: string; motif: string }[]
}

/** Fiche détaillée d'un établissement. */
export interface EtablissementDetail {
  diagnostic: SchoolDiagnostic
  /** Enseignants rattachés, après faits du Prince. */
  enseignants: Teacher[]
  /** Structure administrative : sans diagnostic d'élèves. */
  structure: boolean
}

/** Situation familiale d'un enseignant, telle que le barème la retient (C3). */
export interface SituationRetenue {
  /** Libellé de la situation reconnue, ou la valeur déclarée si elle n'est pas reconnue. */
  libelle: string
  /** Vrai si la valeur déclarée correspond à une situation du barème. */
  reconnue: boolean
  /** Points accordés au barème. */
  points: number
}

/** Ligne de la liste des enseignants. */
export interface EnseignantResume {
  teacher: Teacher
  nomEtab: string
  /** Barème individuel (étage 1). */
  bareme: number
  /** L'enseignant entre au vivier de redéploiement du scénario demandé. */
  mobilisable: boolean
  /**
   * Explication en clair : pourquoi l'enseignant est mobilisable ou non (fait du
   * Prince, inéligibilité, école sans excédent, au-delà de l'excédent…).
   */
  motif: string
  situation: SituationRetenue
}

/** Fiche détaillée d'un enseignant. */
export interface EnseignantDetail extends EnseignantResume {
  ecole: School | null
  /** Détail du barème, composante par composante. */
  detailBareme: ScoreBreakdown
}

/** Résultat d'une recherche par saisie libre (matricule, nom, code école). */
export interface ResultatRecherche<T> {
  /** Élément désigné sans ambiguïté, `null` s'il faut choisir. */
  trouve: T | null
  /** Éléments qui conviennent aussi bien, à départager par l'utilisateur. */
  candidats: T[]
}
