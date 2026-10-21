/**
 * Synthèse territoriale (lot 4, sous-lots 4.6 / 4.7) : taux d'encadrement, couverture des besoins (deux
 * indicateurs distincts), couverture des écoles de plus de 100 élèves, attrition (modèle M1) et degré d'aléa,
 * calculés exclusivement par le serveur — le frontend ne fait que consulter, filtrer et déclencher les exports.
 *
 * Une valeur non calculable n'est jamais inventée : `statut` dit pourquoi (`sansObjet`, `nonCalculable`,
 * `indicatif`) et `raison` l'explique en clair.
 */

import type { NiveauTerritorial } from './commun'

export interface ValeurIndicateur {
  numerateur: number
  denominateur: number
  taux: number | null
  statut: 'normal' | 'sansObjet'
  raison: string | null
}

export interface ValeurAlea {
  valeur: number | null
  statut: 'nonCalculable' | 'indicatif' | 'normal'
  raison: string | null
}

/** Un indicateur comparé à l'import, après Prince, après simulation, puis N+1 à N+5 (base constante). */
export interface IndicateurParSituation {
  import: ValeurIndicateur
  apresPrince: ValeurIndicateur
  apresSimulation: ValeurIndicateur
  n1: ValeurIndicateur
  n2: ValeurIndicateur
  n3: ValeurIndicateur
  n4: ValeurIndicateur
  n5: ValeurIndicateur
  /** Taux N+5 moins taux à l'import, `null` si l'une des deux valeurs n'est pas calculable. */
  ecartN5Import: number | null
}

/** Disponible uniquement après simulation : par construction (E10), ce n'est pas un indicateur projetable. */
export interface CouvertureOperationnelle {
  apresSimulation: ValeurIndicateur
}

export interface AleaParSituation {
  import: ValeurAlea
  apresPrince: ValeurAlea
  apresSimulation: ValeurAlea
}

export type OrigineTauxAttrition = 'hypotheseNationale' | 'hypotheseRegionale' | 'hypotheseSousSysteme'

export interface AnneeAttrition {
  tauxPct: number | null
  origine: OrigineTauxAttrition | null
  departsAttrition: number | null
  departsRetraite: number | null
  directeursDecharges: number | null
}

/** Référentiel du modèle officiel M1 du SIGE (lecture seule, jamais modifiable). */
export interface ReferenceAttritionM1 {
  modele: string
  formule: string
  perimetre: string
  attritionTotalePct: number
  intervalleConfiancePoints: number
  retraitesPct: number
  autresDepartsPct: number
  fenetreDonnees: string
  nombreRegions: number
  nombreTransitionsAnnuelles: number
  source: string
}

export interface BlocAttrition {
  annees: { n1: AnneeAttrition; n2: AnneeAttrition; n3: AnneeAttrition; n4: AnneeAttrition; n5: AnneeAttrition }
  /** Hypothèse nationale ou régionale (jamais un taux observé) ; `null` sous le niveau régional. */
  referenceM1: ReferenceAttritionM1 | null
  /** Présente sous le niveau régional : le taux est hérité, pas mesuré à ce niveau. */
  note?: string
}

export interface IndicateursTerritoire {
  nbEcoles: number
  encadrement: IndicateurParSituation
  couvertureGlobale: IndicateurParSituation
  couvertureOperationnelle: CouvertureOperationnelle
  couvertureParec: IndicateurParSituation
  alea: AleaParSituation
  attrition: BlocAttrition
}

export interface ReferenceTerritoire {
  code: string
  niveau: string
  nom: string
  region: string | null
  departement: string | null
  commune: string | null
  codeParent: string
}

export interface EnfantTerritoire extends IndicateursTerritoire {
  territoire: ReferenceTerritoire
  libelleNiveau: string
}

export interface DefinitionIndicateur {
  code: string
  intitule: string
  /** Unité de l'indicateur : « élèves par enseignant » pour l'encadrement, « % » pour les couvertures. */
  unite: string
  formule: string
  population: string
  source: string
  limites: string
}

/** Réponse de `GET jeux/{jeu}/rapports/territorial/`. */
export interface RapportTerritorial {
  niveau: NiveauTerritorial
  libelleNiveau: string
  perimetre: Record<string, string>
  titre: string
  scenarioId: string
  noeud: IndicateursTerritoire
  niveauEnfants: string
  enfants: EnfantTerritoire[]
  registreIndicateurs: DefinitionIndicateur[]
}

/** Filtres de `GET jeux/{jeu}/rapports/territorial/` et de son export. */
export interface FiltresRapportTerritorial {
  region?: string
  departement?: string
  commune?: string
  iaeb?: string
  sousSysteme?: string
  /** Niveau forcé des enfants (par défaut, le niveau immédiatement sous le périmètre). */
  niveau?: 'region' | 'departement' | 'commune' | 'ecole' | 'iaeb'
  scenario?: string
}

export type FormatExport = 'xlsx' | 'docx'
export type TypeExportTerritorial = 'perimetre' | 'nationalComplet'

/** Année de projection d'un export : « n1 » (N+1) à « n5 » (N+5). */
export type AnneeExport = 'n1' | 'n2' | 'n3' | 'n4' | 'n5'

export interface OptionsExportTerritorial {
  format: FormatExport
  type?: TypeExportTerritorial
  /** Ne garde, parmi les colonnes de projection, que cette année (import et situations actuelles toujours présents). */
  annee?: AnneeExport
  /** Limite l'export à un seul indicateur (son `code` du registre) ; tous par défaut. */
  indicateur?: string
}
