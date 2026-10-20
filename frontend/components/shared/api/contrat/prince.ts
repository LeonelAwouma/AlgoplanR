/**
 * Contrat de l'API — fait de Prince : redéploiement d'un enseignant décidé par
 * la DRH, en dehors de l'algorithme.
 *
 * Ce n'est pas une proposition de simulation : c'est une décision. Elle est
 * appliquée sans aucun des contrôles de l'algorithme (ancienneté, âge, statut,
 * besoin de l'école de destination, excédent de l'école d'origine, périmètre
 * géographique). Une fois appliquée, elle devient un fait acquis dont
 * l'algorithme tient compte dans tous ses calculs : l'enseignant est rattaché à
 * sa nouvelle école et n'est plus jamais remis en mouvement, et les effectifs des
 * deux écoles sont mis à jour avant le calcul des besoins et des excédents.
 */

import type { BilanImportPrince } from './decisions'

/** Un établissement, figé à la date de la décision pour rester lisible si les données changent. */
export interface LieuPrince {
  id: string
  nom: string
  commune: string
  departement: string
  region: string
}

/** Une décision enregistrée. */
export interface FaitPrince {
  id: string
  /** Matricule de l'enseignant redéployé. */
  teacherId: string
  /** Code de l'établissement de destination. */
  schoolDestinationId: string
  /** Référence de la décision (note de service, courrier…), facultative. */
  reference: string
  /** Date de la décision, au format ISO. */
  decideLe: string
  /** Nom de l'enseignant, figé à la date de la décision. */
  enseignant: string
  origine: LieuPrince
  destination: LieuPrince
}

/**
 * Sort d'une décision au regard des données actuellement chargées : une décision
 * peut viser un enseignant ou une école absents du fichier importé.
 */
export type StatutFaitPrince =
  | 'applique'
  | 'applique_avec_alerte'
  | 'rejete'
  | 'enseignant_introuvable'
  | 'ecole_introuvable'
  | 'meme_ecole'
  | 'doublon'
  /** Devenue impossible après une actualisation des données : jamais appliquée, motif conservé. */
  | 'invalide'

export interface FaitPrinceApplique {
  fait: FaitPrince
  statut: StatutFaitPrince
  /** Explication en clair du statut. */
  motif: string
}

/** Effet d'un redéploiement sur les effectifs d'une école. */
export interface ImpactEcolePrince {
  nom: string
  effectifAvant: number
  effectifApres: number
  besoinAvant: number
  besoinApres: number
  excedentAvant: number
  excedentApres: number
}

/** Conséquences prévisibles d'un fait de Prince, montrées avant de le valider. */
export interface ImpactPrince {
  /** `null` quand l'école de rattachement de l'enseignant est absente des données. */
  origine: ImpactEcolePrince | null
  destination: ImpactEcolePrince
  /** Observations factuelles : ce que l'algorithme n'aurait pas fait, ou ce que la décision provoque. */
  observations: string[]
}

// --- Application des faits aux bases (prétraitement) -----------------------------------------------------------------

/**
 * Les faits actifs sont appliqués aux bases importées avant tout calcul : chaque enseignant déplacé est rattaché à
 * son école de destination, les effectifs des deux écoles sont mis à jour et leurs indicateurs recalculés. Les bases
 * obtenues sont consultables à l'écran et exportables ; ce sont des bases dérivées pour simulation, non des décisions
 * administratives mises en œuvre.
 */

/** Totaux d'un ensemble de bases, avant ou après les faits du Prince. */
export interface TotauxPrince {
  ecoles: number
  enseignants: number
  besoinPostes: number
  ecolesDeficitaires: number
}

export interface ResumeApplicationPrince {
  identifiees: number
  appliquees: number
  /** Parmi les décisions appliquées, celles qui portent au moins une alerte. */
  avecAlerte: number
  rejetees: number
}

export type StatutDecisionPrince = 'appliquee' | 'appliquee_avec_alerte' | 'rejetee'

/** Une décision du Prince et ce qu'on en a fait. */
export interface DecisionApplicationPrince {
  ordre: number
  matricule: string
  enseignant: string
  ecoleOrigine: string
  nomEcoleOrigine: string
  ecoleDestination: string
  nomEcoleDestination: string
  statut: StatutDecisionPrince
  alertes: string[]
  motifsRejet: string[]
  reference: string
  /** Effectif déclaré et besoin des deux écoles avant / après ; `null` pour une décision rejetée. */
  origine: {
    effectifAvant: number | null
    effectifApres: number | null
    besoinAvant: number | null
    besoinApres: number | null
  }
  destination: {
    effectifAvant: number | null
    effectifApres: number | null
    besoinAvant: number | null
    besoinApres: number | null
  }
  /** Décision que l'essai à blanc d'un fichier ajouterait ; toujours `false` hors essai. */
  nouvelle: boolean
}

/** Écart entre l'effectif déclaré d'une école touchée et le nombre de matricules qui lui sont rattachés. */
export interface EcartEffectifPrince {
  ecole: string
  nomEcole: string
  enseignantsDeclares: number
  matriculesRattaches: number
  ecart: number
}

export interface ApplicationPrince {
  resume: ResumeApplicationPrince
  avant: TotauxPrince
  apres: TotauxPrince
  decisions: DecisionApplicationPrince[]
  ecartsEffectifs: EcartEffectifPrince[]
}

/** Essai à blanc d'un fichier : ce que l'import enregistrerait, et les bases qui en résulteraient. */
export interface ApercuImportPrince {
  bilan: BilanImportPrince
  application: ApplicationPrince
}

/** Bases consultables après application des faits du Prince. */
export type BaseApresPrince = 'etablissements' | 'enseignants' | 'journal'

/**
 * Lignes des bases, avec les noms de colonnes des classeurs exportés : les colonnes officielles des fichiers importés
 * (valeurs après les faits du Prince) suivies des colonnes propres au Prince.
 */
export interface LigneEtablissementApresPrince {
  Identifiant_Ecole: string
  nom_etab: string
  Region: string
  Departement: string
  Commune: string
  Sous_Systeme: string
  Effectif_Eleves_Attendus: number
  Enseignants_Actuels: number
  Enseignants_Avant_Prince: number
  Enseignants_Apres_Prince: number
  REM_Avant: number | null
  REM_Apres: number | null
  Besoin_Avant: number
  Besoin_Apres: number
  Touche_Par_Prince: 'OUI' | 'NON'
}

export interface LigneEnseignantApresPrince {
  Matricule_Enseignant: string
  nom: string
  prenom: string
  Sous_Systeme_Formation: string
  Ecole_Attache_Actuelle: string
  Anciennete_Poste_Actuel: number
  Ecole_Origine_Prince: string
  /** École et région du fichier importé, et région après la décision : l'ancienne région reste lisible. */
  Ecole_Initiale?: string
  Region_Initiale?: string
  Region_Apres_Decision?: string
  Ecole_Affectation_Prince: string
  Statut_Prince: string
  Reference_Decision: string
}

export interface LigneJournalPrince {
  Ordre: number
  Matricule_Enseignant: string
  Nom_Enseignant: string
  Ecole_Origine: string
  Nom_Ecole_Origine: string
  Ecole_Destination: string
  Nom_Ecole_Destination: string
  Statut: string
  Alertes: string
  Motifs_Rejet: string
  Reference_Decision: string
}

/** Filtres de consultation d'une base après Prince. */
export interface FiltresBaseApresPrince {
  /** Seulement les écoles / enseignants touchés par une décision. */
  concernes?: boolean
  recherche?: string
}
