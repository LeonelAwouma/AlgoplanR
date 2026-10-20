/**
 * Tableau complet des propositions d'affectation du rapport : en-têtes, ordre de lecture et lignes. Pur, sans
 * interface, pour être testé.
 */

import type { ProposedAssignment } from '../../shared/api'
import { LIBELLE_NATURE, LIBELLE_PROXIMITE, LIBELLE_STATUT_PROPOSITION } from '../../shared/kernel'

/** Deux décimales, à la française. */
const decimales = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** En-têtes des colonnes, dans l'ordre de `lignesAffectations`. */
export const ENTETES_AFFECTATIONS = [
  'N°',
  'Matricule',
  'Enseignant',
  'Sous-système',
  'École d’origine',
  'Commune d’origine',
  'École de destination',
  'Commune',
  'Département',
  'Région',
  'Nature',
  'Périmètre',
  'Statut',
  'Barème',
  'Score',
] as const

const fr = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' })

/** Propositions rangées pour la lecture : région, département, commune et école de destination, puis nom. */
export function ordonnerAffectations(assignments: readonly ProposedAssignment[]): ProposedAssignment[] {
  return [...assignments].sort(
    (a, b) =>
      fr(a.regionDestination, b.regionDestination) ||
      fr(a.departementDestination, b.departementDestination) ||
      fr(a.communeDestination, b.communeDestination) ||
      fr(a.nomEtabDestination, b.nomEtabDestination) ||
      fr(a.nomEns, b.nomEns) ||
      fr(a.prenomEns, b.prenomEns),
  )
}

/** Libellé de la nature, avec le rang du vœu satisfait quand il y en a un. */
function natureDe(a: ProposedAssignment): string {
  return a.rangVoeu != null ? `${LIBELLE_NATURE[a.nature]} (vœu ${a.rangVoeu})` : LIBELLE_NATURE[a.nature]
}

/** Lignes du tableau : une par proposition, numérotées dans l'ordre de lecture. */
export function lignesAffectations(assignments: readonly ProposedAssignment[]): string[][] {
  return ordonnerAffectations(assignments).map((a, i) => [
    String(i + 1),
    a.teacherId,
    `${a.nomEns} ${a.prenomEns}`.trim(),
    a.sousSysteme ?? '',
    a.nomEtabOrigine,
    a.communeOrigine,
    a.nomEtabDestination,
    a.communeDestination,
    a.departementDestination,
    a.regionDestination,
    natureDe(a),
    LIBELLE_PROXIMITE[a.niveauProximite],
    LIBELLE_STATUT_PROPOSITION[a.statut],
    decimales(a.bareme),
    decimales(a.score),
  ])
}
