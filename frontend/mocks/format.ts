/**
 * Format des données factices, partagé avec leur générateur
 * (moteur-reference/scripts/generer-fixtures.ts), qui l'importe en type.
 *
 * Le générateur exécute les moteurs de référence sur le jeu de démonstration
 * et enregistre :
 *   - un catalogue de réponses en lecture, par chemin d'API, chacune avec les
 *     paramètres de requête qui l'ont produite ;
 *   - l'état initial des objets que les données factices font évoluer en
 *     mémoire (jeu, nominations, mouvements, quotas, hypothèses, audit…).
 */

import type {
  Actualisation,
  DataQualityReport,
  DecisionArbitrageAppliquee,
  EngineSettings,
  EstimationAttrition,
  EtatPlanification,
  EvenementAuditDetail,
  EvenementQuota,
  FaitPrinceApplique,
  FichierImporte,
  Hypotheses,
  ImpactEcolePrince,
  JeuDeDonnees,
  Mouvement,
  Nomination,
  PersonneVivier,
  PosteCompatible,
  PosteOuvert,
  QuotaRecrutement,
  Recrue,
  ResultatRecrutes,
  TypeFichier,
  ValidationJeu,
  VersionHypotheses,
  VersionPlanification,
} from '../components/shared/api/contrat'

import type { LieuEcole } from './suivi-planification'

/** Paramètres de requête d'une réponse enregistrée ; une liste répète la clé. */
export type Query = Record<string, string | string[]>

/** Une réponse enregistrée pour un chemin. */
export interface EntreeCatalogue {
  query: Query
  reponse: unknown
  /**
   * Liste complète, non paginée : les données factices appliquent elles-mêmes
   * la pagination, la recherche libre et les filtres simples.
   */
  liste?: true
}

/** Réponses enregistrées, par chemin concret sans le préfixe `/api/v1/`. */
export type FichierCatalogue = Record<string, EntreeCatalogue[]>

/** État initial des objets modifiables par les écritures factices. */
export interface EtatInitial {
  jeu: JeuDeDonnees
  qualite: DataQualityReport
  validation: ValidationJeu
  actualisations: Actualisation[]
  /** Fichier renvoyé à chaque envoi de classeur, selon sa nature. */
  fichiers: Record<TypeFichier, FichierImporte>
  parametres: EngineSettings
  faitsPrince: FaitPrinceApplique[]
  /**
   * Effet, école par école, du départ (`retrait`) ou de l'arrivée (`ajout`) d'un
   * enseignant : de quoi composer l'aperçu d'un fait du Prince sans calcul.
   */
  impactsPrince: Record<string, { retrait: ImpactEcolePrince; ajout: ImpactEcolePrince }>
  arbitrages: DecisionArbitrageAppliquee[]
  recrues: Recrue[]
  /** Candidats lus dans un fichier de recrues : renvoyés à tout import factice. */
  recruesExemple: Recrue[]
  /** Déploiement des recrues d'exemple, par scénario, servi une fois l'import fait. */
  recrutesParScenario: Record<string, ResultatRecrutes | null>
  hypotheses: Hypotheses
  historiqueHypotheses: VersionHypotheses[]
  quotas: QuotaRecrutement[]
  historiqueQuotas: EvenementQuota[]
  versionsPlanification: VersionPlanification[]
  etatPlanification: EtatPlanification
  /** Réponse à toute demande d’estimation du taux d’attrition. */
  estimationAttrition: EstimationAttrition
  /** Postes compatibles avec chaque personne du vivier, du meilleur score au moins bon. */
  rapprochements: Record<string, PosteCompatible[]>
  vivier: PersonneVivier[]
  postesOuverts: PosteOuvert[]
  nominations: Nomination[]
  mouvements: Mouvement[]
  audit: EvenementAuditDetail[]
  /** Lieu de chaque école, pour situer les décisions dans un périmètre de planification. */
  ecoles: Record<string, LieuEcole>
}
