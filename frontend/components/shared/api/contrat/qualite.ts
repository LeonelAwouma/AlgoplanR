/**
 * Contrat de l'API — contrôle qualité des données importées (§11). Le rapport doit
 * rester explicable : chaque point retiré du score correspond à un problème
 * nommé, listé et localisable dans le fichier source.
 */

export type QualitySeverity = 'erreur' | 'avertissement'

/** Une famille de problèmes détectés, avec quelques exemples localisés. */
export interface QualityIssue {
  code: string
  severity: QualitySeverity
  /** Libellé lisible, ex. « établissements sans commune ». */
  label: string
  /** Ce que cela empêche de calculer, en langage simple. */
  consequence: string
  dataset: 'etablissements' | 'enseignants' | 'croisement'
  count: number
  /** Jusqu'à quelques identifiants ou numéros de ligne concernés. */
  exemples: string[]
  /** Points retirés du score de qualité par cette famille de problèmes. */
  penalite: number
}

/** Colonne attendue absente du fichier, avec l'impact de son absence. */
export interface MissingFieldReport {
  champ: string
  label: string
  dataset: 'etablissements' | 'enseignants'
  /** `true` si le calcul ne peut pas se faire du tout sans cette colonne. */
  bloquant: boolean
  consequence: string
}

/** Complétude de la hiérarchie géographique, indispensable aux scénarios. */
export interface TerritorialCompleteness {
  avecRegion: number
  avecDepartement: number
  avecCommune: number
  total: number
  /** Part des écoles dont les trois niveaux sont renseignés, entre 0 et 1. */
  tauxComplet: number
}

export interface DataQualityReport {
  /** Score sur 100, obtenu en retirant les pénalités listées dans `issues`. */
  score: number
  /** Qualification du score, pour l'affichage. */
  appreciation: 'Bonne' | 'Acceptable' | 'Fragile' | 'Insuffisante'

  errors: QualityIssue[]
  warnings: QualityIssue[]
  missingFields: MissingFieldReport[]

  duplicates: { dataset: 'etablissements' | 'enseignants'; id: string; occurrences: number }[]
  /** Enseignants rattachés à un identifiant d'école absent du fichier écoles. */
  unknownSchools: { teacherId: string; schoolId: string }[]
  invalidValues: QualityIssue[]
  territorialCompleteness: TerritorialCompleteness

  ecolesValides: number
  ecolesLues: number
  enseignantsValides: number
  enseignantsLus: number

  /** `true` si au moins une colonne « effectif élèves » a été reconnue. */
  donneesElevesDisponibles: boolean
  /** Détail des points retirés, pour rendre le score explicable. */
  detailScore: { label: string; points: number }[]
}

/** Résultat de la reconnaissance d'une colonne du classeur (§10 étape 3). */
export interface ColumnMatch {
  /** Nom du champ métier ciblé, ex. `effectifTotalEleves`. */
  champ: string
  label: string
  /** En-tête retenu dans le fichier, `null` si aucune correspondance. */
  enTete: string | null
  /** Comment la correspondance a été établie. */
  methode: 'exact' | 'alias' | 'normalise' | 'approchant' | 'manuel' | 'absent'
  /** Confiance de 0 à 1 ; en dessous de 0.85 une confirmation est demandée. */
  confiance: number
  requis: boolean
}

/** Table de correspondance complète d'un fichier importé. */
export interface ColumnMappingReport {
  dataset: 'etablissements' | 'enseignants'
  enTetes: string[]
  matches: ColumnMatch[]
  /** En-têtes du fichier qui n'ont été rattachés à aucun champ métier. */
  enTetesInconnus: string[]
  /** `true` tant qu'un champ requis n'est pas résolu. */
  incomplet: boolean
}
