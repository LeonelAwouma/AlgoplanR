/**
 * Arbre territorial et totaux : tels que le calcule le serveur
 * (`domaine/diagnostic/synthese.py:totaux_diagnostic`, `domaine/diagnostic/territoires.py:arbre_territorial`).
 * Aucun total n'est recalculé ici — cette conversion ne fait que renommer les clés en camelCase et assembler
 * les codes de territoire (`territoire()`).
 */

import type { TerritorialSummary, TerritorialTotals, TerritoryLevel } from '../../contrat'
import { territoire } from '../moteur/territoires'

/** Totaux d'un nœud, tels que le sert `totaux_diagnostic` (diagnostic plat, synthèse ou arbre territorial). */
export interface TotauxDjango {
  nb_ecoles: number
  besoin_postes: number
  excedent_enseignants: number
  excedent_mobilisable: number
  nb_ecoles_necessiteuses: number
  nb_ecoles_excedentaires: number
  nb_ecoles_zone_rouge: number
  nb_ecoles_a_examiner: number
  nb_ecoles_satisfaisantes: number
  salles_manquantes: number
  surnombre: number
  enseignants_en_poste: number
  classes: number | null
  autres_enseignants: number | null
  effectif_total_eleves: number | null
  eleves_par_enseignant_etat: number | null
  eleves_par_classe: number | null
  classes_multigrades: number
  /** Écoles au nombre de classes multigrades non renseigné (absent d'un ancien serveur : aucune). */
  multigrades_non_renseignes?: number
}

export function versTotaux(t: TotauxDjango): TerritorialTotals {
  return {
    ecolesAnalysees: t.nb_ecoles,
    ecolesEnDeficit: t.nb_ecoles_necessiteuses,
    ecolesAvecExcedent: t.nb_ecoles_excedentaires,
    ecolesSatisfaisantes: t.nb_ecoles_satisfaisantes,
    classes: t.classes,
    enseignantsEtat: t.enseignants_en_poste,
    autresEnseignants: t.autres_enseignants,
    postesNecessaires: t.besoin_postes,
    postesDeclares: null,
    excedentMobilisable: t.excedent_mobilisable,
    sallesManquantes: t.salles_manquantes,
    surnombre: t.surnombre,
    ecolesAExaminer: t.nb_ecoles_a_examiner,
    effectifTotalEleves: t.effectif_total_eleves,
    elevesParEnseignantEtat: t.eleves_par_enseignant_etat,
    elevesParClasse: t.eleves_par_classe,
    // Aucune école ne renseigne les classes multigrades : information inconnue (null), jamais « 0 classe ».
    classesMultigrades:
      t.nb_ecoles > 0 && (t.multigrades_non_renseignes ?? 0) >= t.nb_ecoles ? null : t.classes_multigrades,
    ecolesMultigradesNonRenseignees: t.multigrades_non_renseignes ?? 0,
  }
}

/** Nœud de l'arbre territorial complet, tel que le sert `arbre_territorial` (serveur). */
export interface NoeudArbreDjango {
  niveau: TerritoryLevel
  libelle: string
  perimetre: { region: string; departement: string; commune: string }
  totaux: TotauxDjango
  enfants: NoeudArbreDjango[]
  ecoles: string[]
}

/**
 * Arbre complet → `TerritorialSummary` récursif, pour que `trouverNoeud`/`territoiresMixtes`/la carte le lisent
 * exactement comme l'arbre construit autrefois côté interface — seule la source des totaux change.
 *
 * Le serveur ne porte les identifiants d'écoles qu'à l'arrondissement (`ecoles`, pour ne pas répéter 13 000
 * identifiants à chaque nœud) ; région et département les reconstruisent par union de leurs enfants, déjà
 * présents dans la même réponse — un assemblage d'identifiants, jamais un second calcul des totaux.
 */
export function versArbre(n: NoeudArbreDjango, parentCode: string | null = null): TerritorialSummary {
  const { region, departement, commune } = n.perimetre
  const t = territoire(n.niveau, n.libelle, region || null, departement || null, commune || null, parentCode)
  const children = n.enfants.map(e => versArbre(e, t.code))
  const schoolIds = n.niveau === 'commune' ? n.ecoles : children.flatMap(c => c.schoolIds)
  return { territory: t, totals: versTotaux(n.totaux), schoolIds, children }
}
