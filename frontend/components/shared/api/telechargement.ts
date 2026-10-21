/**
 * Téléchargement d'un fichier produit par le serveur (classeur Excel d'une base après Prince).
 *
 * Le client JSON (`client.ts`) ne lit que du JSON ou du texte ; un fichier binaire passe ici. Les mêmes en-têtes
 * d'authentification sont joints (jeton de l'application de bureau et jeton de la session), et un refus est présenté
 * comme toute autre erreur de l'API.
 */

import { serialiserQuery, type ParametresRequete } from './client'
import { configurationApi, EN_TETE_JETON, PREFIXE_API } from './config'
import { erreurDepuisReponse, erreurInjoignable } from './erreurs'
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

/**
 * Télécharge un fichier d'une route GET du serveur.
 *
 * @param chemin chemin relatif au préfixe de l'API (`jeux/12/faits-prince/bases/enseignants/export/`).
 * @param repli nom du fichier si le serveur n'en annonce pas.
 */
export async function telechargerDepuisServeur(
  chemin: string,
  query: ParametresRequete = {},
  repli = 'export.xlsx',
): Promise<FichierTelecharge> {
  const { baseUrl, jeton } = configurationApi()
  const enTetes: Record<string, string> = {}
  if (jeton) enTetes[EN_TETE_JETON] = jeton
  const session = lireJeton()
  if (session) enTetes.Authorization = `Bearer ${session}`

  let reponse: Response
  try {
    reponse = await fetch(`${baseUrl}${PREFIXE_API}/${chemin}${serialiserQuery(query)}`, { headers: enTetes })
  } catch (cause) {
    throw erreurInjoignable(cause)
  }
  if (!reponse.ok) {
    const type = reponse.headers.get('Content-Type') ?? ''
    const corps: unknown = type.includes('application/json') ? await reponse.json() : await reponse.text()
    const erreur = erreurDepuisReponse(reponse.status, corps)
    if (reponse.status === 401 || reponse.status === 403) signalerRefus(erreur.code)
    throw erreur
  }
  return { contenu: await reponse.blob(), nomFichier: nomAnnonce(reponse.headers.get('Content-Disposition'), repli) }
}
