/**
 * Tri des classeurs d'un dossier : chaque fichier va dans le compartiment
 * (établissements ou enseignants) dont il porte les colonnes.
 *
 * La décision repose sur les en-têtes du classeur, comparés aux colonnes
 * attendues de chaque compartiment et à leurs intitulés reconnus (le même
 * dictionnaire que le serveur). La colonne indispensable d'un compartiment
 * (code de l'école, matricule) compte davantage que les autres. Le nom du
 * fichier ne sert qu'à départager une égalité.
 */

import type { ColonneAttendue, TypeFichier } from '../../shared/api'

import { TYPES_FICHIER } from './correspondances'

/** Extensions des classeurs que le serveur sait lire. */
const EXTENSIONS = ['.xlsx', '.xls', '.xlsm', '.csv']

/** Poids de la colonne indispensable d'un compartiment, face à une colonne ordinaire. */
const POIDS_INDISPENSABLE = 5

/** Indices du nom de fichier, utilisés seulement pour départager une égalité. */
const INDICES_NOM: Record<TypeFichier, RegExp> = {
  etablissements: /etab|ecole|school|structure/,
  enseignants: /enseign|teacher|personnel|agent|matricule/,
}

/** Clé de comparaison d'un intitulé : minuscules, sans accents, séparateurs unifiés. */
export function cleIntitule(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Vrai pour un classeur lisible par le serveur, hors fichiers temporaires d'Excel (`~$…`). */
export function estClasseur(nom: string): boolean {
  const n = nom.toLowerCase()
  return !n.startsWith('~$') && EXTENSIONS.some(ext => n.endsWith(ext))
}

/** Score d'un classeur pour chaque compartiment : nombre de colonnes reconnues, indispensable pondérée. */
export function scores(
  entetes: string[],
  colonnes: Record<TypeFichier, ColonneAttendue[]>,
): Record<TypeFichier, number> {
  const presents = new Set(entetes.map(cleIntitule).filter(Boolean))
  const resultat = {} as Record<TypeFichier, number>
  for (const type of TYPES_FICHIER) {
    resultat[type] = colonnes[type].reduce((total, c) => {
      const reconnue = [c.champ, ...c.alias].some(intitule => presents.has(cleIntitule(intitule)))
      return reconnue ? total + (c.requis ? POIDS_INDISPENSABLE : 1) : total
    }, 0)
  }
  return resultat
}

/** Compartiment d'un classeur, `null` si rien ne permet de trancher. */
export function compartimentDe(
  nomFichier: string,
  entetes: string[],
  colonnes: Record<TypeFichier, ColonneAttendue[]>,
): { type: TypeFichier | null; score: number } {
  const s = scores(entetes, colonnes)
  const classes = [...TYPES_FICHIER].sort((a, b) => s[b] - s[a])
  const [premier, second] = classes
  if (s[premier] === 0) return { type: null, score: 0 }
  if (s[premier] > s[second]) return { type: premier, score: s[premier] }
  const nom = cleIntitule(nomFichier)
  const parNom = TYPES_FICHIER.filter(t => s[t] === s[premier] && INDICES_NOM[t].test(nom))
  return parNom.length === 1 ? { type: parNom[0], score: s[premier] } : { type: null, score: s[premier] }
}

/** Classeur du dossier, avec ses en-têtes (ou l'erreur de lecture). */
export interface ClasseurLu<F> {
  fichier: F
  /** Chemin dans le dossier choisi, pour l'affichage. */
  chemin: string
  entetes: string[] | null
  erreur?: string
}

/** Répartition des classeurs d'un dossier entre les compartiments. */
export interface Repartition<F> {
  retenus: Partial<Record<TypeFichier, ClasseurLu<F>>>
  ignores: { chemin: string; motif: string }[]
}

/**
 * Répartit les classeurs : pour chaque compartiment, le classeur au meilleur
 * score. Les autres sont ignorés, avec leur motif.
 */
export function repartir<F>(
  classeurs: ClasseurLu<F>[],
  colonnes: Record<TypeFichier, ColonneAttendue[]>,
): Repartition<F> {
  const retenus: Partial<Record<TypeFichier, ClasseurLu<F> & { score: number }>> = {}
  const ignores: Repartition<F>['ignores'] = []

  for (const c of classeurs) {
    if (!c.entetes) {
      ignores.push({ chemin: c.chemin, motif: c.erreur ?? 'Classeur illisible.' })
      continue
    }
    const { type, score } = compartimentDe(c.chemin, c.entetes, colonnes)
    if (!type) {
      ignores.push({
        chemin: c.chemin,
        motif:
          score === 0
            ? 'Aucune colonne attendue reconnue.'
            : 'Colonnes communes aux deux compartiments : renommez le fichier (« etablissements… » ou « enseignants… ») ou déposez-le à la main.',
      })
      continue
    }
    const deja = retenus[type]
    if (!deja || score > deja.score) {
      if (deja) ignores.push({ chemin: deja.chemin, motif: `Un autre classeur correspond mieux aux ${type}.` })
      retenus[type] = { ...c, score }
    } else {
      ignores.push({ chemin: c.chemin, motif: `Un autre classeur correspond mieux aux ${type}.` })
    }
  }
  return { retenus, ignores }
}
