/**
 * Accès brut au serveur Django pour les conversions : lectures, écritures,
 * lecture complète d'une liste paginée et mémorisation des lectures coûteuses.
 *
 * Le serveur sert ses listes par pages d'au plus 5 000 lignes, au format
 * `{ count, page, taille, pages, resultats }`. Les conversions lisent toutes les
 * pages (quatre à la fois, autant que de fils du serveur), puis filtrent, trient
 * et paginent elles-mêmes selon le contrat.
 */

import type { ParametresRequete, Transport } from '../client'
import type { MethodeHttp, ModeEnvoi } from '../routes'

/** Page telle que la sert le serveur Django. */
export interface PageDjango<T> {
  count: number
  page: number
  taille: number
  pages: number
  resultats: T[]
}

/** Taille de page maximale acceptée par le serveur (domaine/commun/pagination.py). */
const TAILLE_MAX = 5000
/** Pages lues en même temps. */
const LECTURES_SIMULTANEES = 4
/**
 * Durée de vie d'une lecture mémorisée ; toute écriture sur le jeu la vide aussi.
 * Lire les 10 000 écoles d'un jeu national coûte une quinzaine de secondes au serveur.
 */
const DUREE_CACHE_MS = 30 * 60 * 1000

const cache = new Map<string, { valeur: Promise<unknown>; expire: number }>()

/** Oublie les lectures mémorisées d'un jeu, ou toutes. */
export function viderCache(jeu?: string): void {
  if (jeu === undefined) {
    cache.clear()
    return
  }
  for (const cle of cache.keys()) if (cle.startsWith(`${jeu}|`)) cache.delete(cle)
}

export class Acces {
  constructor(
    private readonly envoyer: Transport,
    private readonly signal?: AbortSignal,
  ) {}

  /** GET d'un chemin relatif au préfixe `/api/v1/`. */
  lire<T>(chemin: string, query: ParametresRequete = {}): Promise<T> {
    return this.requete<T>('GET', chemin, query)
  }

  /** Requête d'écriture. */
  ecrire<T>(methode: MethodeHttp, chemin: string, corps?: unknown, envoi: ModeEnvoi = 'json'): Promise<T> {
    return this.requete<T>(methode, chemin, {}, corps, envoi)
  }

  /** Toutes les lignes d'une liste paginée, et la première page (qui porte les champs annexes). */
  async toutes<T, P extends PageDjango<T> = PageDjango<T>>(
    chemin: string,
    query: ParametresRequete = {},
  ): Promise<{ lignes: T[]; premiere: P }> {
    const page = (n: number) => this.lire<P>(chemin, { ...query, page: n, taille: TAILLE_MAX })
    const premiere = await page(1)
    const lignes = [...premiere.resultats]
    const restantes = Array.from({ length: Math.max(0, premiere.pages - 1) }, (_, i) => i + 2)
    for (let i = 0; i < restantes.length; i += LECTURES_SIMULTANEES) {
      const lot = await Promise.all(restantes.slice(i, i + LECTURES_SIMULTANEES).map(page))
      for (const p of lot) lignes.push(...p.resultats)
    }
    return { lignes, premiere }
  }

  /**
   * Mémorise une lecture coûteuse d'un jeu. Le chargement se fait sans le
   * signal d'annulation de l'appelant : d'autres écrans peuvent attendre le
   * même résultat. Un échec n'est pas mémorisé.
   */
  memo<T>(jeu: string, cle: string, charger: (acces: Acces) => Promise<T>): Promise<T> {
    const complete = `${jeu}|${cle}`
    const trouve = cache.get(complete)
    if (trouve && trouve.expire > Date.now()) return trouve.valeur as Promise<T>
    const valeur = charger(new Acces(this.envoyer))
    cache.set(complete, { valeur, expire: Date.now() + DUREE_CACHE_MS })
    valeur.catch(() => {
      if (cache.get(complete)?.valeur === valeur) cache.delete(complete)
    })
    return valeur
  }

  private requete<T>(
    methode: MethodeHttp,
    chemin: string,
    query: ParametresRequete,
    corps?: unknown,
    envoi: ModeEnvoi = 'json',
  ): Promise<T> {
    return this.envoyer({ methode, gabarit: chemin, chemin, query, envoi, corps, signal: this.signal }) as Promise<T>
  }
}
