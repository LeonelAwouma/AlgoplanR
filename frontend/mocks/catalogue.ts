/**
 * Catalogue des réponses factices en lecture.
 *
 * Les fichiers sont produits par `pnpm --dir moteur-reference fixtures` dans
 * public/donnees-factices/ et lus à l'exécution : un index associe chaque
 * chemin à sa famille, et une famille n'est chargée que lorsqu'un écran en a
 * besoin.
 *
 * Choix de la réponse : parmi les réponses enregistrées pour le chemin, on
 * retient celles dont tous les paramètres figurent dans la requête avec la
 * même valeur, puis la plus précise (le plus de paramètres). Les paramètres de
 * la requête qui n'ont servi à rien sont signalés : la réponse est alors une
 * approximation (par exemple une commune servie avec les chiffres de son
 * département).
 */

import type { EntreeCatalogue, EtatInitial, FichierCatalogue } from './format'

/** Lecture d'un fichier généré : son contenu JSON décodé. */
export type LectureFichier = (fichier: string) => Promise<unknown>

/** Dossier des données générées, servi par Next.js depuis public/. */
const DOSSIER = '/donnees-factices'

/** Lecture par défaut, dans le navigateur : les fichiers sont servis par Next.js. */
const lectureHttp: LectureFichier = async fichier => {
  const reponse = await fetch(`${DOSSIER}/${fichier}`)
  if (!reponse.ok) {
    throw new Error(
      `Données factices absentes (${fichier}). Générez-les avec « pnpm --dir moteur-reference fixtures ».`,
    )
  }
  return reponse.json()
}

let lecture: LectureFichier = lectureHttp
let index: Promise<Record<string, string>> | null = null
const familles = new Map<string, Promise<FichierCatalogue>>()

/** Remplace la lecture des fichiers (tests sous Node, qui lisent le disque) et vide le cache. */
export function definirLecture(nouvelle: LectureFichier): void {
  lecture = nouvelle
  index = null
  familles.clear()
}

async function lireJson<T>(fichier: string): Promise<T> {
  return (await lecture(fichier)) as T
}

/** État initial des objets modifiables, lu une fois au démarrage. */
export function lireEtatInitial(): Promise<EtatInitial> {
  return lireJson<EtatInitial>('etat-initial.json')
}

/** Réponses enregistrées pour un chemin, `null` si le chemin est inconnu. */
export async function entreesDe(chemin: string): Promise<EntreeCatalogue[] | null> {
  index ??= lireJson<Record<string, string>>('index.json')
  const famille = (await index)[chemin]
  if (!famille) return null
  let fichier = familles.get(famille)
  if (!fichier) {
    fichier = lireJson<FichierCatalogue>(`${famille}.json`)
    familles.set(famille, fichier)
  }
  return (await fichier)[chemin] ?? null
}

/** Valeurs d'un paramètre de requête, triées pour comparer des listes. */
function valeurs(parametres: URLSearchParams, cle: string): string[] {
  return parametres.getAll(cle).sort()
}

/** Une réponse choisie et les paramètres de la requête qu'elle a pris en compte. */
export interface Choix {
  entree: EntreeCatalogue
  utilises: Set<string>
}

/** Réponse la plus précise compatible avec les paramètres de la requête. */
export function choisir(entrees: EntreeCatalogue[], parametres: URLSearchParams): Choix | null {
  let meilleure: EntreeCatalogue | null = null
  for (const entree of entrees) {
    const compatible = Object.entries(entree.query).every(([cle, attendu]) => {
      const attendues = (Array.isArray(attendu) ? attendu : [attendu]).slice().sort()
      return valeurs(parametres, cle).join('\u0000') === attendues.join('\u0000')
    })
    if (compatible && (!meilleure || Object.keys(entree.query).length > Object.keys(meilleure.query).length)) {
      meilleure = entree
    }
  }
  return meilleure ? { entree: meilleure, utilises: new Set(Object.keys(meilleure.query)) } : null
}
