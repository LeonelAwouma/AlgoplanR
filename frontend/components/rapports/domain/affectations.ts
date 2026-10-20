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

// --- Consultation à l'écran -------------------------------------------------------------------------------------
// L'écran consulte une page de 50 ou 100 lignes, filtrable ; le document imprimé et l'annexe Word reprennent TOUTES les
// lignes (`lignesAffectations`), jamais celles de la page consultée.

/** Colonnes affichées à l'écran (indices de `ENTETES_AFFECTATIONS`) : de quoi lire sans défilement horizontal. */
export const COLONNES_CONSULTATION = [1, 2, 4, 6, 7, 9, 10, 14] as const

/** Indices des colonnes filtrables dans une ligne de `lignesAffectations`. */
const I = { matricule: 1, enseignant: 2, origine: 4, destination: 6, commune: 7, departement: 8, region: 9 }

export const TAILLES_PAGE = [50, 100] as const

export interface FiltresAffectations {
  region: string
  departement: string
  commune: string
  recherche: string
}

export const FILTRES_AFFECTATIONS_VIDES: FiltresAffectations = {
  region: '',
  departement: '',
  commune: '',
  recherche: '',
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Valeurs proposées par un filtre : celles qui existent dans les lignes, en tenant compte des filtres amont. */
export function optionsFiltre(
  lignes: readonly (readonly string[])[],
  colonne: 'region' | 'departement' | 'commune',
  filtres: FiltresAffectations,
): string[] {
  const amont: ('region' | 'departement' | 'commune')[] = ['region', 'departement', 'commune']
  const retenues = lignes.filter(l =>
    amont.slice(0, amont.indexOf(colonne)).every(c => !filtres[c] || l[I[c]] === filtres[c]),
  )
  return [...new Set(retenues.map(l => l[I[colonne]]).filter(v => v !== ''))].sort(fr)
}

/** Lignes conservées par les filtres (région, département, commune exacts ; recherche libre sur matricule, nom, écoles). */
export function filtrerLignes(lignes: readonly string[][], filtres: FiltresAffectations): string[][] {
  const q = sansAccents(filtres.recherche.trim())
  return lignes.filter(
    l =>
      (!filtres.region || l[I.region] === filtres.region) &&
      (!filtres.departement || l[I.departement] === filtres.departement) &&
      (!filtres.commune || l[I.commune] === filtres.commune) &&
      (q === '' || [I.matricule, I.enseignant, I.origine, I.destination].some(c => sansAccents(l[c]).includes(q))),
  )
}

export interface PageLignes<T> {
  lignes: T[]
  /** Page effectivement servie, entre 1 et `pages` (une page demandée hors bornes est ramenée dans les bornes). */
  page: number
  pages: number
  total: number
  /** Rang (à partir de 1) de la première et de la dernière ligne servies ; 0 sans ligne. */
  de: number
  a: number
}

/** Une page de `taille` lignes. */
export function paginer<T>(lignes: readonly T[], page: number, taille: number): PageLignes<T> {
  const t = Math.max(1, Math.floor(taille))
  const pages = Math.max(1, Math.ceil(lignes.length / t))
  const p = Math.min(pages, Math.max(1, Math.floor(page) || 1))
  const debut = (p - 1) * t
  const extrait = lignes.slice(debut, debut + t)
  return {
    lignes: extrait,
    page: p,
    pages,
    total: lignes.length,
    de: extrait.length === 0 ? 0 : debut + 1,
    a: debut + extrait.length,
  }
}
