/**
 * Pagination et tri, au format du contrat, d'une liste déjà convertie.
 */

import type { ParametresRequete, ValeurRequete } from '../client'
import type { Page } from '../pagination'

/** Accès à la valeur triée, par nom de champ du paramètre `tri`. */
export type ClesTri<T> = Record<string, (element: T) => unknown>

/** Valeur unique d'un paramètre de requête (le premier élément d'une liste). */
export function valeur(v: ValeurRequete): string | undefined {
  if (v === null || v === undefined) return undefined
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : undefined
  return String(v)
}

/** Toutes les valeurs d'un paramètre de requête. */
export function valeurs(v: ValeurRequete): string[] {
  if (v === null || v === undefined) return []
  return Array.isArray(v) ? v.map(String) : [String(v)]
}

/** Paramètre booléen : `undefined` s'il est absent. */
export function booleen(v: ValeurRequete): boolean | undefined {
  const t = valeur(v)
  if (t === undefined) return undefined
  return ['1', 'true', 'oui'].includes(t.toLowerCase())
}

function comparer(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'fr')
}

/** Lit un champ, éventuellement imbriqué (`teacher.nom`). */
function champ(element: unknown, chemin: string): unknown {
  return chemin.split('.').reduce<unknown>((v, cle) => (v as Record<string, unknown> | undefined)?.[cle], element)
}

/** Trie selon `tri` (`champ` ou `-champ`, plusieurs séparés par des virgules). */
export function trier<T>(elements: T[], tri: string | undefined, cles: ClesTri<T> = {}): T[] {
  if (!tri) return elements
  const criteres = tri
    .split(',')
    .map(c => c.trim())
    .filter(Boolean)
    .map(c => {
      const desc = c.startsWith('-')
      const nom = c.replace(/^-/, '')
      const lire = cles[nom] ?? ((e: T) => champ(e, nom))
      return { desc, lire }
    })
  return [...elements].sort((a, b) => {
    for (const { desc, lire } of criteres) {
      const r = comparer(lire(a), lire(b))
      if (r !== 0) return desc ? -r : r
    }
    return 0
  })
}

/** Page demandée par la requête ; `taille=0` demande toutes les lignes. */
export function paginer<T>(elements: T[], query: ParametresRequete, cles: ClesTri<T> = {}): Page<T> {
  const tries = trier(elements, valeur(query.tri), cles)
  const taille = Math.max(0, Number(valeur(query.taille) ?? 50) || 0)
  const page = Math.max(1, Number(valeur(query.page) ?? 1) || 1)
  if (taille === 0) return { elements: tries, total: tries.length, page: 1, taille: tries.length }
  return { elements: tries.slice((page - 1) * taille, page * taille), total: tries.length, page, taille }
}
