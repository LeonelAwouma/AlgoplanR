/**
 * Client HTTP de l'API AlgoPlanR.
 *
 * Point de passage unique de tous les appels réseau du frontend : les
 * composants n'appellent jamais `fetch` directement. Le client :
 *   - construit l'URL à partir du descripteur de route et des paramètres ;
 *   - sérialise les paramètres de requête (listes répétées : `?zone=a&zone=b`) ;
 *   - envoie le corps en JSON ou en formulaire multipart (fichiers) ;
 *   - joint le jeton de l'application de bureau ;
 *   - convertit toute réponse non réussie en `ApiError`.
 *
 * Le transport (l'appel `fetch` lui-même) est remplaçable, pour les tests.
 */

import { configurationApi, EN_TETE_JETON, PREFIXE_API } from './config'
import { erreurDepuisReponse, erreurInjoignable } from './erreurs'
import {
  construireChemin,
  type ChampsMultipart,
  type DescripteurRoute,
  type MethodeHttp,
  type ModeEnvoi,
  type ParamsRoute,
} from './routes'

/** Valeur acceptée dans la chaîne de requête. `null` et `undefined` sont omis. */
export type ValeurRequete = string | number | boolean | null | undefined | readonly (string | number | boolean)[]

/** Paramètres de requête (`?cle=valeur`). */
export type ParametresRequete = Record<string, ValeurRequete>

/** Requête prête à partir, telle que la reçoit le transport. */
export interface RequeteApi {
  methode: MethodeHttp
  /** Gabarit d'origine, utile aux tests et aux journaux. */
  gabarit: string
  /** Chemin relatif, paramètres déjà remplacés (`jeux/12/diagnostic/`). */
  chemin: string
  query: ParametresRequete
  envoi: ModeEnvoi
  corps: unknown
  signal?: AbortSignal
}

/** Exécute une requête et renvoie le corps de la réponse décodé. */
export type Transport = (requete: RequeteApi) => Promise<unknown>

/** Options communes à tous les appels. */
interface OptionsCommunes {
  query?: ParametresRequete
  /** Annulation de la requête, transmise par TanStack Query quand le résultat n'est plus attendu. */
  signal?: AbortSignal
}

/** Options d'un appel, selon que la route a des paramètres de chemin et un corps. */
export type OptionsAppel<Gabarit extends string, Corps> = OptionsCommunes &
  ([ParamsRoute<Gabarit>] extends [never] ? { params?: undefined } : { params: ParamsRoute<Gabarit> }) &
  ([Corps] extends [undefined] ? { corps?: undefined } : { corps: Corps })

/** Les options sont facultatives seulement quand la route n'exige ni paramètre ni corps. */
type ArgumentsAppel<Gabarit extends string, Corps> = [ParamsRoute<Gabarit>] extends [never]
  ? [Corps] extends [undefined]
    ? [options?: OptionsAppel<Gabarit, Corps>]
    : [options: OptionsAppel<Gabarit, Corps>]
  : [options: OptionsAppel<Gabarit, Corps>]

/** Construit la chaîne de requête, en répétant la clé pour chaque élément d'une liste. */
export function serialiserQuery(query: ParametresRequete): string {
  const recherche = new URLSearchParams()
  for (const [cle, valeur] of Object.entries(query)) {
    if (valeur === null || valeur === undefined) continue
    if (Array.isArray(valeur)) {
      for (const element of valeur) recherche.append(cle, String(element))
    } else {
      recherche.append(cle, String(valeur))
    }
  }
  const texte = recherche.toString()
  return texte ? `?${texte}` : ''
}

/** Transforme les champs d'un formulaire multipart en `FormData`. */
function versFormData(champs: ChampsMultipart): FormData {
  const formulaire = new FormData()
  for (const [cle, valeur] of Object.entries(champs)) {
    if (valeur !== undefined) formulaire.append(cle, valeur)
  }
  return formulaire
}

/** Décode le corps d'une réponse : JSON s'il est annoncé, rien pour une réponse vide. */
async function lireCorps(reponse: Response): Promise<unknown> {
  if (reponse.status === 204) return undefined
  const type = reponse.headers.get('Content-Type') ?? ''
  if (type.includes('application/json')) return reponse.json()
  const texte = await reponse.text()
  return texte === '' ? undefined : texte
}

/** Transport par défaut : `fetch` vers le serveur configuré. */
export const transportHttp: Transport = async requete => {
  const { baseUrl, jeton } = configurationApi()
  const url = `${baseUrl}${PREFIXE_API}/${requete.chemin}${serialiserQuery(requete.query)}`

  const enTetes: Record<string, string> = { Accept: 'application/json' }
  if (jeton) enTetes[EN_TETE_JETON] = jeton

  let corps: BodyInit | undefined
  if (requete.corps !== undefined) {
    if (requete.envoi === 'multipart') {
      // Le navigateur fixe lui-même le Content-Type, avec la frontière du formulaire.
      corps = versFormData(requete.corps as ChampsMultipart)
    } else {
      enTetes['Content-Type'] = 'application/json'
      corps = JSON.stringify(requete.corps)
    }
  }

  let reponse: Response
  try {
    reponse = await fetch(url, { method: requete.methode, headers: enTetes, body: corps, signal: requete.signal })
  } catch (cause) {
    // Une annulation volontaire n'est pas une panne du serveur : elle remonte telle quelle.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw erreurInjoignable(cause)
  }

  const contenu = await lireCorps(reponse)
  if (!reponse.ok) throw erreurDepuisReponse(reponse.status, contenu)
  return contenu
}

let transportCourant: Transport = transportHttp

/**
 * Remplace le transport (tests, données factices).
 *
 * @returns une fonction qui rétablit le transport précédent.
 */
export function remplacerTransport(transport: Transport): () => void {
  const precedent = transportCourant
  transportCourant = transport
  return () => {
    transportCourant = precedent
  }
}

/**
 * Appelle une route de l'API.
 *
 * Le typage impose les paramètres de chemin du gabarit et le corps attendu, et
 * donne le type de la réponse :
 *
 * ```ts
 * const jeu = await appeler(ROUTES.lireJeu, { params: { jeu: '12' } })
 * ```
 *
 * @throws ApiError si le serveur refuse la requête ou ne répond pas.
 */
export async function appeler<Reponse, Gabarit extends string, Corps>(
  route: DescripteurRoute<Reponse, Gabarit, Corps>,
  ...[options]: ArgumentsAppel<Gabarit, Corps>
): Promise<Reponse> {
  const params = (options?.params ?? {}) as Record<string, string | number>
  const resultat = await transportCourant({
    methode: route.methode,
    gabarit: route.gabarit,
    chemin: construireChemin(route.gabarit, params),
    query: options?.query ?? {},
    envoi: route.envoi,
    corps: options?.corps,
    signal: options?.signal,
  })
  return resultat as Reponse
}
