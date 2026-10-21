/**
 * Enseignants : ligne du serveur Django (colonnes du fichier, rattachement à
 * l'école et barème) → `Teacher`, `EnseignantResume` et `EnseignantDetail`.
 */

import type { EngineSettings, EnseignantResume, ScoreBreakdown, SituationRetenue, Teacher } from '../../contrat'
import {
  categorieSituation,
  LIBELLES_SITUATION,
  motifDemande,
  nombre,
  nombreOuNull,
  sousSysteme,
  texte,
  zone,
} from './referentiel'

/** Enseignant tel que le sert le serveur (`Enseignant.vers_dict`). */
export interface EnseignantDjango {
  Matricule_Enseignant: string
  nom: string
  prenom: string
  Sous_Systeme_Formation: string
  Ecole_Attache_Actuelle: string
  Age: number | null
  /** Âge renseigné dans le fichier : faux quand la colonne est absente (35 ans supposés) ou la cellule vide. */
  age_connu?: boolean
  /** Déplacé par un fait du Prince : `Ecole_Attache_Actuelle` est alors la destination décidée. */
  fait_prince?: boolean
  /** École du fichier importé (avant les faits du Prince). */
  ecole_reference?: string
  nom_ecole_reference?: string
  Anciennete_Carriere: number
  Anciennete_Poste_Actuel: number
  Annees_Zone_Difficulte_1: number
  Annees_Zone_Difficulte_2: number
  Situation_Matrimoniale: string
  Nombre_Enfants_A_Charge: number
  Formations_Continues: number
  Voeu_1: string
  Voeu_2: string
  Voeu_3: string
  Motif_Bonification: string
  commune_attache: string
  departement_attache: string
  region_attache: string
  iaeb_attache: string
  zone_attache: string
  etab_attache_excedentaire: boolean
  bareme: number
  /** Liste des enseignants seulement. */
  dans_vivier?: boolean
  /** Liste des enseignants seulement : raison de l'exclusion du calcul (retraite…). */
  exclu_du_calcul?: string
  /** Vivier d'un scénario seulement. */
  affecte?: boolean
  /** Vivier d'un scénario seulement : `hors_region` si seul un poste libre d'une autre région subsiste. */
  motif_non_affectation?: string
}

/** Détail d'un barème ou d'un score tel que le sert le serveur. */
export interface DetailDjango {
  composantes: { code: string; valeur: number; poids: number; contribution: number }[]
  total: number
}

/** Libellés des composantes du barème (C1 à C5) et du score d'appariement (Z1 à Z4). */
const LIBELLES_COMPOSANTE: Record<string, string> = {
  C1_carriere_zone: 'C1 · Carrière et zone',
  C2_anciennete_poste: 'C2 · Ancienneté au poste',
  C3_charges_familiales: 'C3 · Charges familiales',
  C4_formation_continue: 'C4 · Formation continue',
  C5_cohorte_age: "C5 · Cohorte d'âge",
  Z1_bareme_individu: 'Z1 · Barème individuel',
  Z2_poids_poste_Up: 'Z2 · Poids du poste',
  Z3_proximite: 'Z3 · Proximité',
  Z4_ajustements: 'Z4 · Ajustements',
  note_admission: 'Note d’admission',
  rang_concours: 'Rang au concours',
}

/** Détail d'un barème ou d'un score → décomposition du contrat. */
export function versBreakdown(d: DetailDjango | null | undefined): ScoreBreakdown {
  if (!d) return { total: 0, components: [] }
  return {
    total: d.total,
    components: d.composantes.map(c => ({
      label: LIBELLES_COMPOSANTE[c.code] ?? c.code,
      valeur: c.valeur,
      poids: c.poids,
      contribution: c.contribution,
    })),
  }
}

/**
 * Somme écrite d'une décomposition : « Z1 · Barème individuel (22.75 × 0.25 = 5.6875) + … ».
 * Quatre décimales : à deux, la somme des termes affichés ne retomberait pas sur le total.
 */
export function formuleSomme(b: ScoreBreakdown): string {
  return b.components.map(c => `${c.label} (${c.valeur} × ${c.poids} = ${c.contribution.toFixed(4)})`).join(' + ')
}

/** Enseignant du contrat. `ligne` : rang de l'enseignant dans le fichier (à partir de 1). */
export function versTeacher(t: EnseignantDjango, ligne = 0): Teacher {
  return {
    id: t.Matricule_Enseignant,
    nom: texte(t.nom),
    prenom: texte(t.prenom),
    dateNaissance: null,
    age: t.age_connu === false ? null : nombreOuNull(t.Age),
    idEtabAttache: texte(t.Ecole_Attache_Actuelle),
    communeAttache: texte(t.commune_attache),
    departementAttache: texte(t.departement_attache),
    regionAttache: texte(t.region_attache),
    zoneAttache: zone(t.zone_attache),
    iaebAttache: texte(t.iaeb_attache),
    ancienneteCarriereAns: nombre(t.Anciennete_Carriere),
    anciennetePosteAns: nombre(t.Anciennete_Poste_Actuel),
    situationFamiliale: texte(t.Situation_Matrimoniale),
    nbEnfants: nombre(t.Nombre_Enfants_A_Charge),
    formationContinue: nombre(t.Formations_Continues),
    statut: '',
    payeParEtat: true,
    sexe: '',
    categorie: '',
    fonction: '',
    sousSysteme: sousSysteme(t.Sous_Systeme_Formation),
    voeux: [t.Voeu_1, t.Voeu_2, t.Voeu_3].map(texte).filter(v => v !== ''),
    motifDemande: motifDemande(t.Motif_Bonification),
    ecoleMotif: null,
    faitPrinceId: t.fait_prince ? t.Matricule_Enseignant : undefined,
    idEtabReference: t.ecole_reference ? texte(t.ecole_reference) : undefined,
    nomEtabReference: t.nom_ecole_reference ? texte(t.nom_ecole_reference) : undefined,
    anneesZoneNiveau1: nombre(t.Annees_Zone_Difficulte_1),
    anneesZoneNiveau2: nombre(t.Annees_Zone_Difficulte_2),
    rangTirage: null,
    ligneSource: ligne,
  }
}

/** Situation familiale retenue par le barème (C3). */
export function situationRetenue(valeur: unknown, settings: EngineSettings): SituationRetenue {
  const { cle, reconnue } = categorieSituation(valeur)
  return {
    libelle: reconnue ? LIBELLES_SITUATION[cle] : texte(valeur) || 'Non renseignée',
    reconnue,
    points: reconnue ? (settings.scoring.pointsSituationFamiliale[cle] ?? 0) : 0,
  }
}

/** Pourquoi l'enseignant est, ou n'est pas, dans le vivier de redéploiement. */
export function motifMobilite(t: EnseignantDjango, mobilisable: boolean): string {
  if (t.exclu_du_calcul) return `Exclu du calcul : ${t.exclu_du_calcul}.`
  if (mobilisable) return "Retenu dans le vivier : son école d'attache a un excédent de maîtres."
  if (t.etab_attache_excedentaire)
    return "École excédentaire, mais l'enseignant n'est pas parmi ceux que l'excédent permet de redéployer."
  return "Son école d'attache n'a pas d'excédent : il n'est pas mobilisable."
}

/** Ligne de la liste des enseignants. */
export function versEnseignantResume(
  t: EnseignantDjango,
  ligne: number,
  nomEtab: string,
  settings: EngineSettings,
): EnseignantResume {
  const mobilisable = Boolean(t.dans_vivier)
  return {
    teacher: versTeacher(t, ligne),
    nomEtab,
    bareme: nombre(t.bareme),
    mobilisable,
    motif: motifMobilite(t, mobilisable),
    situation: situationRetenue(t.Situation_Matrimoniale, settings),
  }
}
