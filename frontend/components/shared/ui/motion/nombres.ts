/**
 * Lecture et réécriture des nombres affichés en français (« 1 234 », « 53,09 »,
 * « 36 % »), pour animer un compteur sans changer son format.
 */

/** Valeur affichée décomposée : texte avant, nombre, décimales, texte après. */
export interface NombreAffiche {
  prefixe: string
  valeur: number
  decimales: number
  suffixe: string
}

/**
 * Décompose un nombre affiché, ou renvoie `null` si le texte ne contient pas
 * exactement un nombre (« — », « … », « 12 / 40 », texte libre) : il n'est
 * alors pas animé.
 */
export function decomposerNombre(texte: string): NombreAffiche | null {
  const nombres = texte.match(/-?\d[\d\s  ]*(?:,\d+)?/g)
  if (!nombres || nombres.length !== 1) return null
  // L'espace qui précède une unité (« 36 % ») appartient au suffixe.
  const brut = nombres[0].replace(/[\s  ]+$/, '')
  const debut = texte.indexOf(brut)
  const sansEspaces = brut.replace(/[\s  ]/g, '')
  const valeur = Number(sansEspaces.replace(',', '.'))
  if (!Number.isFinite(valeur)) return null
  const virgule = sansEspaces.indexOf(',')
  return {
    prefixe: texte.slice(0, debut),
    valeur,
    decimales: virgule === -1 ? 0 : sansEspaces.length - virgule - 1,
    suffixe: texte.slice(debut + brut.length),
  }
}

/** Réécrit un nombre au format d'origine (séparateurs français, mêmes décimales). */
export function formaterNombre(nombre: NombreAffiche, valeur: number): string {
  const texte = valeur.toLocaleString('fr-FR', {
    minimumFractionDigits: nombre.decimales,
    maximumFractionDigits: nombre.decimales,
  })
  return `${nombre.prefixe}${texte}${nombre.suffixe}`
}
