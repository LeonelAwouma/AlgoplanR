/** Arrondis du moteur de référence (moteur-reference/lib/data/normalize.ts). */

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Quotient, `null` si l'un des termes manque. */
export function ratio(numerateur: number | null, denominateur: number | null): number | null {
  if (numerateur == null || denominateur == null || denominateur === 0) return null
  return numerateur / denominateur
}
