/**
 * Outils de comparaison de texte pour l'interface : recherche locale dans les
 * tableaux déjà chargés, rapprochement des noms de la carte et des données.
 *
 * Mêmes règles que la normalisation du moteur, pour qu'une recherche à l'écran
 * trouve ce que le serveur aurait trouvé.
 */

/** Convertit une valeur quelconque en texte, `''` pour `null` ou `undefined`. */
function texte(valeur: unknown): string {
  return valeur === null || valeur === undefined ? '' : String(valeur)
}

/** Clé de comparaison : sans accents, en minuscules, réduite aux lettres et chiffres. */
export function normalizeKey(valeur: unknown): string {
  return texte(valeur)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Comme `normalizeKey`, en conservant les séparations par un espace unique. */
export function normalizeLabel(valeur: unknown): string {
  return texte(valeur)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Distance d'édition entre deux textes (insertions, suppressions, substitutions). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let precedente = new Array<number>(b.length + 1)
  let courante = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) precedente[j] = j
  for (let i = 1; i <= a.length; i++) {
    courante[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1
      courante[j] = Math.min(courante[j - 1] + 1, precedente[j] + 1, precedente[j - 1] + cout)
    }
    ;[precedente, courante] = [courante, precedente]
  }
  return precedente[b.length]
}

/** Vrai si tous les mots de la recherche apparaissent dans l'un des textes fournis. */
export function correspondRecherche(recherche: string, ...textes: unknown[]): boolean {
  const mots = normalizeLabel(recherche).split(' ').filter(Boolean)
  if (mots.length === 0) return true
  const cible = textes.map(normalizeLabel).join(' ')
  return mots.every(mot => cible.includes(mot))
}
