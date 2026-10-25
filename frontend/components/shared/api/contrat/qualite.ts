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

/** École dont l'effectif déclaré diffère du nombre de matricules rattachés. */
export interface EcartEffectifEcole {
  ecole: string
  nomEcole: string
  enseignantsDeclares: number
  matriculesRattaches: number
  /** Déclarés − rattachés : positif quand des matricules manquent au fichier des enseignants. */
  ecart: number
}

/**
 * Réconciliation des effectifs, pour toutes les écoles. Règle : l'effectif déclaré fait foi ; l'écart est un
 * avertissement, bloquant seulement pour une école touchée par un fait du Prince.
 */
export interface ReconciliationEffectifs {
  ecolesComparees: number
  ecolesEnEcart: number
  ecolesSansEffectifDeclare: number
  ecartTotal: number
  ecartAbsoluTotal: number
  /** Les plus grands écarts d'abord ; limitée, voir `listeTronquee`. */
  ecoles: EcartEffectifEcole[]
  listeTronquee: boolean
  regle: string
}

/** Anomalie de rattachement relevée en isolant une région dans une base nationale. */
export interface AnomalieImportRegional {
  fichier: 'etablissements' | 'enseignants'
  /** Numéro de ligne dans le classeur. */
  ligne: number
  code: string
  motif: string
  valeur: string
}

/**
 * Bilan de l'isolement d'une région dans une base nationale (import d'un délégué régional). Les enseignants non
 * rattachés ou au rattachement ambigu ne sont attribués à aucune région : ils sont écartés et listés.
 */
export interface BilanImportRegional {
  region: string
  etablissementsFichier: number
  etablissementsRetenus: number
  etablissementsAutresRegions: number
  /** Établissements écartés : code manquant, région illisible, code porté par plusieurs régions. */
  etablissementsEcartes: number
  enseignantsFichier: number
  enseignantsRetenus: number
  enseignantsAutresRegions: number
  enseignantsNonRattaches: number
  enseignantsAmbigus: number
  anomalies: AnomalieImportRegional[]
  anomaliesTronquees: boolean
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
  /** `null` quand les fichiers ne permettent pas la comparaison (colonne d'effectif ou de rattachement absente). */
  reconciliationEffectifs?: ReconciliationEffectifs | null
  /** Présent seulement quand un délégué a importé une base nationale. */
  importRegional?: BilanImportRegional | null
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
  dataset: 'etablissements' | 'enseignants' | 'prince'
  enTetes: string[]
  matches: ColumnMatch[]
  /** En-têtes du fichier qui n'ont été rattachés à aucun champ métier. */
  enTetesInconnus: string[]
  /** `true` tant qu'un champ requis n'est pas résolu. */
  incomplet: boolean
}
