/**
 * Contrat de l'API — contexte « Données » : import des classeurs, jeux de
 * données, validation, actualisations, fiches établissement et enseignant,
 * recherche.
 */

import type { IdJeu } from './commun'
import type { School, SchoolDiagnostic, Teacher } from './education'
import type { ColumnMappingReport, DataQualityReport } from './qualite'
import type { ScoreBreakdown } from './simulation'

/** Nature d'un classeur importé. */
export type TypeFichier = 'etablissements' | 'enseignants'

/** Classeurs dont le serveur publie les colonnes attendues : les deux fichiers de base et celui des recrues. */
export type TypeColonnes = TypeFichier | 'recrues'

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
  type: TypeFichier
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
}

/** Envoi d'un classeur (formulaire multipart). */
export interface CorpsEnvoiFichier {
  [champ: string]: string | Blob | undefined
  type: TypeFichier
  fichier: Blob
  /** Feuille à lire ; la première par défaut. */
  feuille?: string
}

/** Correction manuelle des correspondances : champ métier → en-tête du fichier (`null` = aucun). */
export interface CorpsCorrespondances {
  correspondances: Record<string, string | null>
}

/** Création d'un jeu à partir de deux fichiers déjà envoyés. */
export interface CorpsCreationJeu {
  etablissements: string
  enseignants: string
  /** Date de référence des âges (ISO 8601), aujourd'hui par défaut. */
  dateReference?: string
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
}

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
}

/** Contrôle effectué avant de valider un jeu comme référence. */
export interface ControleValidation {
  code: string
  libelle: string
  ok: boolean
  /** Un contrôle bloquant non satisfait empêche la validation. */
  bloquant: boolean
  detail: string
}

/** Validation d'un jeu comme référence des projections. */
export interface CorpsValidationJeu {
  auteur: string
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
