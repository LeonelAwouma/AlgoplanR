/**
 * Téléchargement d'un fichier produit par le serveur (classeur Excel d'une base après Prince).
 *
 * Le client JSON (`client.ts`) ne lit que du JSON ou du texte ; un fichier binaire passe ici. Les mêmes en-têtes
 * d'authentification sont joints (jeton de l'application de bureau et jeton de la session), et un refus est présenté
 * comme toute autre erreur de l'API.
 */

import { serialiserQuery, type ParametresRequete } from './client'
import { configurationApi, EN_TETE_JETON, PREFIXE_API } from './config'
import { ApiError, erreurDepuisReponse, erreurInjoignable } from './erreurs'
import { lireJeton, signalerRefus } from './jetonSession'

export interface FichierTelecharge {
  contenu: Blob
  nomFichier: string
}

/** Nom du fichier annoncé par `Content-Disposition`, à défaut `repli`. */
function nomAnnonce(entete: string | null, repli: string): string {
  const trouve = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(entete ?? '')
  return trouve ? decodeURIComponent(trouve[1]) : repli
}

/** Options d'un téléchargement : délai maximal d'attente de la réponse, et annulation par l'utilisateur. */
export interface OptionsTelechargement {
  /** Au-delà, l'attente s'arrête avec l'erreur `delai_depasse`. Sans valeur : aucune limite. */
  delaiMs?: number
  /** Annule la génération : erreur `annule`. */
  signal?: AbortSignal
}

/**
 * Télécharge un fichier d'une route GET du serveur.
 *
 * @param chemin chemin relatif au préfixe de l'API (`jeux/12/faits-prince/bases/enseignants/export/`).
 * @param repli nom du fichier si le serveur n'en annonce pas.
 * @param options délai maximal et annulation : une génération longue (export national, ~1 minute) ne reste jamais
 *   « en cours » sans fin, et l'utilisateur sait si elle a échoué, expiré ou été annulée.
 */
export async function telechargerDepuisServeur(
  chemin: string,
  query: ParametresRequete = {},
  repli = 'export.xlsx',
  options: OptionsTelechargement = {},
): Promise<FichierTelecharge> {
  const { baseUrl, jeton } = configurationApi()
  const enTetes: Record<string, string> = {}
  if (jeton) enTetes[EN_TETE_JETON] = jeton
  const session = lireJeton()
  if (session) enTetes.Authorization = `Bearer ${session}`

  const controleur = new AbortController()
  let delaiAtteint = false
  const minuteur =
    options.delaiMs === undefined
      ? undefined
      : setTimeout(() => {
          delaiAtteint = true
          controleur.abort()
        }, options.delaiMs)
  options.signal?.addEventListener('abort', () => controleur.abort(), { once: true })

  try {
    let reponse: Response
    try {
      reponse = await fetch(`${baseUrl}${PREFIXE_API}/${chemin}${serialiserQuery(query)}`, {
        headers: enTetes,
        signal: controleur.signal,
      })
    } catch (cause) {
      throw erreurInterrompue(cause, delaiAtteint, options)
    }
    if (!reponse.ok) {
      const type = reponse.headers.get('Content-Type') ?? ''
      const corps: unknown = type.includes('application/json') ? await reponse.json() : await reponse.text()
      const erreur = erreurDepuisReponse(reponse.status, corps)
      if (reponse.status === 401 || reponse.status === 403) signalerRefus(erreur.code)
      throw erreur
    }
    try {
      return {
        contenu: await reponse.blob(),
        nomFichier: nomAnnonce(reponse.headers.get('Content-Disposition'), repli),
      }
    } catch (cause) {
      throw erreurInterrompue(cause, delaiAtteint, options)
    }
  } finally {
    if (minuteur !== undefined) clearTimeout(minuteur)
  }
}

/** Délai dépassé, annulation ou serveur injoignable : trois causes, trois messages. */
function erreurInterrompue(cause: unknown, delaiAtteint: boolean, options: OptionsTelechargement): ApiError {
  if (delaiAtteint) {
    const minutes = Math.round((options.delaiMs ?? 0) / 60000)
    return new ApiError(
      408,
      'delai_depasse',
      `La génération du fichier a dépassé ${minutes} minute(s) et a été abandonnée. Réessayez, ou exportez un périmètre plus petit (région, département).`,
    )
  }
  if (options.signal?.aborted) return new ApiError(499, 'annule', 'La génération du fichier a été annulée.')
  return erreurInjoignable(cause)
}
