/**
 * Libellés affichés des notions du référentiel et des nouvelles fonctions de
 * planification, partagés par les pages, le rapport et les exports.
 *
 * Ce sont des choix de présentation : le serveur renvoie des codes stables,
 * l'interface les traduit ici, à un seul endroit.
 */

import type {
  ClassementEcole,
  DisponibiliteVivier,
  GeographicScope,
  IssueCandidature,
  MotifDemande,
  NatureMouvement,
  ProximityLevel,
  SchoolSeverity,
  SourceVivier,
  SousSysteme,
  StatutFaitPrince,
  StatutJeu,
  StatutMouvement,
  StatutNomination,
  StatutPoste,
  StatutProposition,
  StatutQuota,
  StatutVoeu,
  TerritorialSummary,
  TerritoryLevel,
  TypeEvenementAudit,
  TypeMouvement,
  Zone,
  ZoneSecurite,
} from '../api/contrat'

// --- Mentions obligatoires -------------------------------------------------------------------

/** Mention affichée partout où des résultats de simulation sont présentés (§29). */
export const MENTION_SIMULATION =
  "Les résultats présentés sont issus d'une simulation d'aide à la décision. Ils ne constituent pas des décisions administratives de mutation, d'affectation ou de recrutement."

/** Mention affichée partout où le jeu de démonstration est utilisé. */
export const MENTION_DEMONSTRATION =
  "Données de démonstration — valeurs fictives générées par l'application. Elles ne constituent pas des statistiques officielles."

// --- Zones et territoires ----------------------------------------------------------------------

export const LIBELLE_ZONE_SECURITE: Record<ZoneSecurite, string> = {
  verte: 'Zone verte',
  jaune: 'Zone jaune',
  rouge: 'Zone rouge',
}

export const ZONES_SECURITE: ZoneSecurite[] = ['verte', 'jaune', 'rouge']

/** Rang de tri d'une zone de sécurité : 1 verte, 2 jaune, 3 rouge (non renseignée = verte). */
export function rangZoneSecurite(zone: ZoneSecurite | null): number {
  return zone === 'rouge' ? 3 : zone === 'jaune' ? 2 : 1
}

/**
 * Libellé de la zone de sécurité d'une école. Sans zone renseignée, le calcul la
 * compte en zone verte (aucun point de sécurité) : le libellé le dit.
 */
export function libelleZoneSecurite(zone: ZoneSecurite | null): string {
  return zone ? LIBELLE_ZONE_SECURITE[zone] : 'Zone verte (non renseignée)'
}

export const LIBELLE_SOUS_SYSTEME: Record<SousSysteme | 'non_renseigne', string> = {
  francophone: 'Francophone',
  anglophone: 'Anglophone',
  non_renseigne: 'Sous-système non renseigné',
}

/** Nom du niveau situé sous un niveau territorial (« région » sous le national…). */
export function libelleNiveauSous(niveau: TerritoryLevel): string {
  switch (niveau) {
    case 'national':
      return 'région'
    case 'region':
      return 'département'
    case 'departement':
      return 'commune'
    default:
      return 'établissement'
  }
}

/** Nom du niveau des enfants d'un nœud territorial. */
export function libelleNiveauEnfants(noeud: TerritorialSummary): string {
  return libelleNiveauSous(noeud.territory.level)
}

export const LIBELLE_ZONE: Record<Zone, string> = {
  urbaine: 'Urbaine',
  semi_urbaine: 'Semi-urbaine',
  rurale: 'Rurale',
  inconnue: 'Zone non renseignée',
}

// --- Diagnostic -----------------------------------------------------------------------------------

export const LIBELLE_SEVERITE: Record<SchoolSeverity, string> = {
  excedent: 'Excédent mobilisable',
  satisfaisant: 'Situation satisfaisante',
  deficit_faible: 'Déficit faible',
  deficit_important: 'Déficit important',
  deficit_critique: 'Déficit critique',
}

/** Niveaux de sévérité, du plus favorable au plus grave. */
export const SEVERITES: SchoolSeverity[] = [
  'excedent',
  'satisfaisant',
  'deficit_faible',
  'deficit_important',
  'deficit_critique',
]

export const LIBELLE_CLASSEMENT: Record<ClassementEcole, string> = {
  necessiteuse: 'Nécessiteuse',
  excedentaire: 'Excédentaire',
  a_examiner: 'À examiner',
  equilibree: 'Équilibrée',
}

// --- Simulation -------------------------------------------------------------------------------------

export const LIBELLE_SCOPE: Record<GeographicScope, string> = {
  commune: 'Commune',
  departement: 'Département',
  etendu: 'Étendu',
}

export const DESCRIPTION_SCOPE: Record<GeographicScope, string> = {
  commune:
    "Les mouvements restent dans la commune de l'enseignant : vœux, solutions proches et redéploiement obligatoire.",
  departement: "Les mouvements restent à l'intérieur du département de rattachement.",
  etendu:
    "Niveau régional, puis niveau central : les vœux interrégionaux et les besoins qu'aucune école de la région ne peut couvrir sont traités entre régions.",
}

/** Message obligatoire accompagnant le scénario sans contrainte géographique (§29). */
export const AVERTISSEMENT_SCENARIO_ETENDU =
  'Au niveau central, des mouvements entre régions sont proposés : ils supposent l’accord des deux régions et peuvent impliquer des déplacements longs.'

/** Les trois scénarios géographiques de référence, dans l'ordre d'affichage. */
export const SCENARIOS_GEOGRAPHIQUES: GeographicScope[] = ['commune', 'departement', 'etendu']

/** Identifiant d'un scénario géographique de référence, tel que le serveur le nomme. */
export function idScenarioGeographique(scope: GeographicScope): string {
  return `geo-${scope}`
}

export const LIBELLE_PROXIMITE: Record<ProximityLevel, string> = {
  meme_commune: 'Même commune',
  meme_iaeb: 'Même IAEB',
  meme_departement: 'Même département',
  meme_region: 'Même région',
  hors_region: 'Hors région',
}

export const LIBELLE_NATURE: Record<NatureMouvement, string> = {
  voeu: 'Vœu satisfait',
  hors_voeux: 'Proposition hors vœux',
  obligatoire: 'Redéploiement obligatoire',
  arbitrage: 'Décision de commission',
}

export const LIBELLE_STATUT_PROPOSITION: Record<StatutProposition, string> = {
  propose: 'Proposé',
  valide: 'Validé',
  arbitre: 'Arbitré',
  rejete: 'Rejeté',
}

export const LIBELLE_ISSUE: Record<IssueCandidature, string> = {
  affecte_voeu: 'Vœu satisfait',
  hors_voeux: 'Proposition hors vœux',
  projete_n2: 'Possibilité en N+2',
  sans_solution: 'Aucune solution prévisible',
  irrecevable: 'Non recevable',
  depart_non_valide: 'Départ non validé',
  arbitrage: 'Décision de commission',
}

export const LIBELLE_STATUT_VOEU: Record<StatutVoeu, string> = {
  examine: 'examiné',
  autre_sous_systeme: 'autre sous-système (commission)',
  hors_referentiel: 'école inconnue',
  hors_perimetre: 'hors du périmètre du scénario',
  au_dela_du_maximum: 'au-delà du nombre de vœux autorisé',
  meme_ecole: "école d'attache",
}

export const LIBELLE_MOTIF: Record<MotifDemande, string> = {
  convenance: 'Convenance personnelle',
  sante: 'Santé',
  regroupement_familial: 'Regroupement familial',
  rotation_zone_difficile: 'Rotation après service en zone difficile',
  autre: 'Autre',
}

// --- Fait du Prince ------------------------------------------------------------------------------------

export const LIBELLE_STATUT_PRINCE: Record<StatutFaitPrince, string> = {
  applique: 'Appliqué',
  enseignant_introuvable: 'Enseignant introuvable',
  ecole_introuvable: 'École introuvable',
  meme_ecole: 'Même école',
  doublon: 'Déjà redéployé',
}

// --- Situations familiales -------------------------------------------------------------------------------

/** Situations reconnues par le barème (C3), dans l'ordre d'affichage. */
export const SITUATIONS_CONNUES = ['celibataire', 'marie', 'divorce', 'veuf', 'separe', 'concubinage'] as const

export const LIBELLE_SITUATION: Record<string, string> = {
  celibataire: 'Célibataire',
  marie: 'Marié(e)',
  divorce: 'Divorcé(e)',
  veuf: 'Veuf / Veuve',
  separe: 'Séparé(e)',
  concubinage: 'Union libre / concubinage',
}

// --- Données ---------------------------------------------------------------------------------------------

export const LIBELLE_STATUT_JEU: Record<StatutJeu, string> = {
  brouillon: 'Brouillon',
  valide: 'Validé',
}

// --- Vivier, nominations et mouvements --------------------------------------------------------------------

/** Sources du vivier, dans l'ordre d'affichage. */
export const SOURCES_VIVIER: readonly SourceVivier[] = [
  'excedentaire',
  'laureat_sans_poste',
  'disponibilite',
  'fin_detachement',
  'reintegration',
  'autre',
]

export const LIBELLE_SOURCE_VIVIER: Record<SourceVivier, string> = {
  excedentaire: 'Enseignant excédentaire',
  laureat_sans_poste: 'Lauréat sans poste',
  disponibilite: 'Retour de disponibilité',
  fin_detachement: 'Fin de détachement',
  reintegration: 'Réintégration',
  autre: 'Autre source',
}

export const LIBELLE_DISPONIBILITE: Record<DisponibiliteVivier, string> = {
  libre: 'Disponible',
  proposee: 'Proposée sur un poste',
  nommee: 'Nommée',
}

export const LIBELLE_STATUT_NOMINATION: Record<StatutNomination, string> = {
  proposee: 'Proposée',
  validee: 'Validée',
  mise_en_oeuvre: 'Mise en œuvre',
  rejetee: 'Rejetée',
  annulee: 'Annulée',
}

export const LIBELLE_STATUT_POSTE: Record<StatutPoste, string> = {
  libre: 'Libre',
  reserve: 'Réservé',
  pourvu: 'Pourvu',
}

export const LIBELLE_TYPE_MOUVEMENT: Record<TypeMouvement, string> = {
  redeploiement: 'Redéploiement',
  fait_prince: 'Fait du Prince',
  deploiement_recrue: 'Déploiement de recrue',
  nomination: 'Nomination depuis le vivier',
}

export const LIBELLE_STATUT_MOUVEMENT: Record<StatutMouvement, string> = {
  prevu: 'Prévu',
  realise: 'Réalisé',
}

// --- Planification ------------------------------------------------------------------------------------------

export const LIBELLE_STATUT_QUOTA: Record<StatutQuota, string> = {
  calcule: 'Calculé',
  ajuste: 'Ajusté',
  valide: 'Validé',
}

// --- Audit ---------------------------------------------------------------------------------------------------

export const LIBELLE_TYPE_EVENEMENT: Record<TypeEvenementAudit, string> = {
  import: 'Import',
  actualisation: 'Actualisation des données',
  validation_donnees: 'Validation des données',
  parametres: 'Règles du moteur',
  hypotheses: 'Hypothèses de planification',
  scenario_retenu: 'Scénario retenu',
  fait_prince: 'Fait du Prince',
  arbitrage: 'Arbitrage',
  recrues: 'Recrues',
  nomination: 'Nomination',
  quota: 'Quota de recrutement',
  mouvement: 'Mouvement',
  recalcul: 'Recalcul',
}
