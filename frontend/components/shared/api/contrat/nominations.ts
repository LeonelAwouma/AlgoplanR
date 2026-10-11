/**
 * Contrat de l'API — contexte « Nominations » : vivier consolidé, postes
 * ouverts, nominations et registre des mouvements (mémo de synthèse, §2.2 ;
 * document des routes, sections 4.5, 4.6 et 5).
 */

import type { SousSysteme, ZoneSecurite } from './education'
import type { AnneePlan } from './planification'
import type { ProximityLevel, ScoreBreakdown } from './simulation'

// --- Vivier -----------------------------------------------------------------------------

/** Origine d'une personne du vivier ; les sources au-delà des deux premières sont à confirmer. */
export type SourceVivier =
  'excedentaire' | 'laureat_sans_poste' | 'disponibilite' | 'fin_detachement' | 'reintegration' | 'autre'

/** Disponibilité d'une personne au regard des nominations en cours. */
export type DisponibiliteVivier = 'libre' | 'proposee' | 'nommee'

export interface PersonneVivier {
  id: string
  /** Matricule, `null` pour un lauréat qui n'en a pas encore. */
  matricule: string | null
  nom: string
  prenom: string
  source: SourceVivier
  sousSysteme: SousSysteme | null
  region: string
  departement: string
  commune: string
  ecoleOrigine: { id: string; nom: string } | null
  /** Barème individuel (enseignant) ou note d'admission (lauréat). */
  bareme: number | null
  note: number | null
  disponibilite: DisponibiliteVivier
  /** Contraintes en clair : proche de la retraite, zone rouge exclue, sous-système… */
  contraintes: string[]
}

export interface PersonneVivierDetail extends PersonneVivier {
  detailBareme: ScoreBreakdown | null
  historique: Nomination[]
}

/** Ajout de personnes d'autres sources (formulaire multipart). */
export interface CorpsImportVivier {
  [champ: string]: string | Blob | undefined
  fichier: Blob
  source: SourceVivier
  auteur: string
}

export interface BilanImportVivier {
  ajoutees: number
  refus: string[]
  manquantes: string[]
}

// --- Postes ouverts -----------------------------------------------------------------------

/** Statut d'un poste vacant : libre, réservé par une nomination validée, ou pourvu. */
export type StatutPoste = 'libre' | 'reserve' | 'pourvu'

export interface PosteOuvert {
  id: string
  schoolId: string
  nomEtab: string
  region: string
  departement: string
  commune: string
  sousSysteme: SousSysteme | null
  zoneSecurite: ZoneSecurite | null
  indicePriorite: number
  rang: number
  statut: StatutPoste
  nominationId: string | null
}

/** Rapprochement d'une personne et d'un poste, classé par score. */
export interface Rapprochement {
  score: ScoreBreakdown
  proximite: ProximityLevel
  /** Faux si une règle bloque l'affectation (sous-système, zone rouge…). */
  compatible: boolean
  motifs: string[]
}

export interface PosteCompatible extends Rapprochement {
  poste: PosteOuvert
}

export interface CandidatPoste extends Rapprochement {
  personne: PersonneVivier
}

// --- Nominations ---------------------------------------------------------------------------

/** Cycle de vie d'une nomination (document des routes, section 5). */
export type StatutNomination = 'proposee' | 'validee' | 'mise_en_oeuvre' | 'rejetee' | 'annulee'

/** Statuts encore modifiables : une nomination mise en œuvre est définitive. */
export const STATUTS_NOMINATION_ACTIFS: readonly StatutNomination[] = ['proposee', 'validee']

export type OrigineNomination = 'automatique' | 'manuelle' | 'import'

/** Changement de statut, conservé dans l'historique. */
export interface TransitionNomination {
  de: StatutNomination | null
  vers: StatutNomination
  le: string
  auteur: string | null
  motif: string | null
  reference: string | null
}

export interface Nomination {
  id: string
  personne: PersonneVivier
  poste: PosteOuvert
  annee: AnneePlan
  statut: StatutNomination
  origine: OrigineNomination
  motif: string | null
  referenceDecision: string | null
  referenceActe: string | null
  /** Date d'effet de la mise en œuvre (ISO 8601). */
  dateEffet: string | null
  creeeLe: string
  historique: TransitionNomination[]
}

export interface CorpsGenerationNominations {
  annee: AnneePlan
  /** Restreint la génération à un territoire. */
  region?: string | null
  departement?: string | null
  auteur: string
}

export interface BilanGenerationNominations {
  proposees: number
  /** Personnes sans poste compatible. */
  sansPoste: number
  postesSansCandidat: number
}

export interface CorpsNomination {
  personne: string
  poste: string
  annee: AnneePlan
  motif: string
  auteur: string
}

export interface CorpsValidationNomination {
  reference: string
  auteur: string
}

export interface CorpsMotifNomination {
  motif: string
  auteur: string
}

export interface CorpsMiseEnOeuvre {
  dateEffet: string
  referenceActe: string
  auteur: string
}

export interface CorpsLotNominations {
  action: 'valider' | 'rejeter'
  nominations: string[]
  /** Référence de la décision (validation) ou motif (rejet). */
  reference?: string
  motif?: string
  auteur: string
}

export interface BilanLot {
  traitees: number
  refus: { nomination: string; motif: string }[]
}

export interface CorpsImportNominations {
  [champ: string]: string | Blob | undefined
  fichier: Blob
  auteur: string
}

export interface BilanImportNominations {
  importees: number
  refus: string[]
  manquantes: string[]
}

export interface SyntheseNominations {
  parStatut: Record<StatutNomination, number>
  parTerritoire: { territoire: string; parStatut: Record<StatutNomination, number> }[]
  parAnnee: { annee: AnneePlan; parStatut: Record<StatutNomination, number> }[]
}

/** Filtres de la liste des nominations. */
export interface FiltresNominations {
  statut?: StatutNomination[]
  annee?: AnneePlan
  source?: SourceVivier
  region?: string | null
  departement?: string | null
}

// --- Registre des mouvements ----------------------------------------------------------------

export type TypeMouvement = 'redeploiement' | 'fait_prince' | 'deploiement_recrue' | 'nomination'

/** « Prévu » : décision validée ; « réalisé » : mise en œuvre effective. */
export type StatutMouvement = 'prevu' | 'realise'

export interface Mouvement {
  id: string
  type: TypeMouvement
  statut: StatutMouvement
  annee: AnneePlan
  personne: { matricule: string | null; nom: string }
  origine: { id: string; nom: string } | null
  destination: { id: string; nom: string; commune: string; region: string }
  /** Décision à l'origine du mouvement. */
  decision: { type: string; id: string; reference: string | null }
  creeLe: string
  realiseLe: string | null
}

export interface CorpsMiseEnOeuvreMouvement {
  dateEffet: string
  referenceActe: string
  auteur: string
}

/** Incohérence détectée dans le registre (double comptage). */
export interface AnomalieMouvement {
  code: 'personne_comptee_deux_fois' | 'poste_compte_deux_fois' | 'mouvement_sans_decision'
  libelle: string
  mouvements: string[]
}

export interface ControleMouvements {
  ok: boolean
  anomalies: AnomalieMouvement[]
}

export interface FiltresMouvements {
  type?: TypeMouvement[]
  statut?: StatutMouvement
  annee?: AnneePlan
  region?: string | null
  departement?: string | null
}
