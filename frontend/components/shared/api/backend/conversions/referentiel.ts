/**
 * Valeurs de référence : libellés du serveur Django (repris tels quels des
 * fichiers importés) vers les codes du contrat.
 */

import type { Accessibilite, MotifDemande, SousSysteme, Zone, ZoneSecurite } from '../../contrat'

/** Minuscules, sans accents ni espaces superflus. */
export function normaliser(texte: unknown): string {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/** « Urbain », « Semi-urbain », « Rural », « Rural enclavé » → accessibilité du référentiel. */
export function accessibilite(valeur: unknown): Accessibilite | null {
  const v = normaliser(valeur)
  if (v.includes('enclav')) return 'rural_enclave'
  if (v.includes('rural')) return 'rural'
  if (v.includes('semi')) return 'semi_urbain'
  if (v.includes('urbain')) return 'urbain'
  return null
}

/** Zone déclarée, déduite de l'accessibilité. */
export function zone(valeur: unknown): Zone {
  const a = accessibilite(valeur)
  if (a === 'urbain') return 'urbaine'
  if (a === 'semi_urbain') return 'semi_urbaine'
  if (a === 'rural' || a === 'rural_enclave') return 'rurale'
  return 'inconnue'
}

/** Libellés Django des zones du contrat, pour les filtres transmis au serveur. */
export const LIBELLES_ZONE: Record<Zone, string[]> = {
  urbaine: ['Urbain'],
  semi_urbaine: ['Semi-urbain'],
  rurale: ['Rural', 'Rural enclavé'],
  inconnue: [],
}

/** « Zone verte / jaune / rouge » → zone de sécurité, `null` si non renseignée. */
export function zoneSecurite(valeur: unknown): ZoneSecurite | null {
  const v = normaliser(valeur)
  if (v.includes('rouge')) return 'rouge'
  if (v.includes('jaune')) return 'jaune'
  if (v.includes('vert')) return 'verte'
  return null
}

/** « Francophone » / « Anglophone » → sous-système. */
export function sousSysteme(valeur: unknown): SousSysteme | null {
  const v = normaliser(valeur)
  if (v.startsWith('franco')) return 'francophone'
  if (v.startsWith('anglo')) return 'anglophone'
  return null
}

/** Vrai pour « Oui », « O », « 1 », « true ». */
export function estOui(valeur: unknown): boolean {
  return ['oui', 'o', '1', 'true', 'yes', 'vrai'].includes(normaliser(valeur))
}

/** Motif de bonification libre → motif de demande du contrat. */
export function motifDemande(valeur: unknown): MotifDemande | null {
  const v = normaliser(valeur)
  if (v === '') return null
  if (v.includes('sant')) return 'sante'
  if (v.includes('regroup') || v.includes('famil') || v.includes('conjoint')) return 'regroupement_familial'
  if (v.includes('rotation') || v.includes('difficile')) return 'rotation_zone_difficile'
  if (v.includes('convenance')) return 'convenance'
  return 'autre'
}

/** Situations familiales du barème du serveur (bareme.categorie_situation). */
export const LIBELLES_SITUATION: Record<string, string> = {
  celibataire: 'Célibataire',
  marie: 'Marié(e)',
  divorce: 'Divorcé(e)',
  veuf: 'Veuf / veuve',
}

/**
 * Catégorie de barème d'une situation déclarée, comme bareme.categorie_situation :
 * toute valeur qui n'évoque ni mariage, ni divorce, ni veuvage compte en célibataire.
 * `reconnue` dit si la valeur désigne vraiment l'une des quatre situations.
 */
export function categorieSituation(valeur: unknown): { cle: string; reconnue: boolean } {
  const v = normaliser(valeur)
  if (v.includes('mari')) return { cle: 'marie', reconnue: true }
  if (v.includes('divorc')) return { cle: 'divorce', reconnue: true }
  if (v.includes('veuf') || v.includes('veuve')) return { cle: 'veuf', reconnue: true }
  return { cle: 'celibataire', reconnue: v.includes('celib') }
}

/** Types d'établissement traités comme structures d'encadrement par le serveur (mobilite/score.py). */
export function estStructure(typeEtab: unknown): boolean {
  return ['IAEB', 'DREB', 'DELEGATION'].includes(String(typeEtab ?? '').toUpperCase())
}

/** Nombre, ou `null` pour une valeur absente ou non numérique. */
export function nombreOuNull(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined || valeur === '') return null
  const n = typeof valeur === 'number' ? valeur : Number(valeur)
  return Number.isFinite(n) ? n : null
}

/** Nombre, 0 par défaut. */
export function nombre(valeur: unknown): number {
  return nombreOuNull(valeur) ?? 0
}

/** Chaîne, vide par défaut. */
export function texte(valeur: unknown): string {
  return valeur === null || valeur === undefined ? '' : String(valeur)
}
