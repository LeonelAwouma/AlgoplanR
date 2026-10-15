/**
 * Adaptation au serveur Django.
 *
 * Le contrat de l'API (`../contrat`) a été écrit d'après le moteur de
 * référence ; le serveur Django, portage du moteur d'origine, sert les mêmes
 * chemins dans ses propres formats. Plutôt que de toucher aux écrans, chaque
 * route est convertie ici : la requête du contrat devient une ou plusieurs
 * requêtes au serveur, dont les réponses sont remises au format du contrat.
 *
 * Une route du manifeste que le serveur ne servirait pas ne part pas : elle
 * reçoit ici une erreur « fonction pas encore disponible ». Toutes les routes
 * du contrat sont aujourd'hui servies (planification, nominations, audit,
 * validation et actualisation des jeux et scénario retenu compris).
 *
 * Les conversions ne s'appliquent pas aux données factices, qui répondent déjà
 * au format du contrat.
 */

import type { RequeteApi, Transport } from '../client'
import { ApiError } from '../erreurs'
import { MANIFESTE_ROUTES, routesDuManifeste } from '../manifeste'
import { Acces, viderCache } from './acces'
import { conversionsArbitrage } from './routes/arbitrage'
import { conversionsAudit } from './routes/audit'
import { conversionsDiagnostic } from './routes/diagnostic'
import { conversionsDonnees } from './routes/donnees'
import { conversionsNominations } from './routes/nominations'
import { conversionsParametrage } from './routes/parametrage'
import { conversionsPlanification } from './routes/planification'
import { conversionsPrince } from './routes/prince'
import { conversionsRapports } from './routes/rapports'
import { conversionsRecrutement } from './routes/recrutement'
import { conversionsSimulation } from './routes/simulation'
import type { Conversion } from './types'

export { viderCache } from './acces'
export type { Conversion } from './types'

/** Conversions par route, sous la forme `MÉTHODE gabarit`. */
const CONVERSIONS: Record<string, Conversion> = {
  ...conversionsDonnees,
  ...conversionsDiagnostic,
  ...conversionsParametrage,
  ...conversionsPrince,
  ...conversionsSimulation,
  ...conversionsArbitrage,
  ...conversionsRecrutement,
  ...conversionsRapports,
  ...conversionsPlanification,
  ...conversionsNominations,
  ...conversionsAudit,
}

/** Routes du contrat que le serveur sert telles quelles, sans conversion (santé, suppressions, accès). */
const SERVIES_TELLES_QUELLES = new Set([
  'GET sante/',
  'DELETE jeux/{jeu}/',
  'DELETE jeux/{jeu}/faits-prince/{fait}/',
  'DELETE jeux/{jeu}/scenarios/{scenario}/',
  'DELETE jeux/{jeu}/arbitrages/{arbitrage}/',
  'DELETE jeux/{jeu}/recrues/',
  ...MANIFESTE_ROUTES.acces.map(([methode, gabarit]) => `${methode} ${gabarit}`),
])

/** Routes du manifeste que le serveur ne sert pas (aucune aujourd'hui ; contrôlé par les tests). */
export const ROUTES_NON_SERVIES: ReadonlySet<string> = new Set(
  routesDuManifeste().filter(r => !(r in CONVERSIONS) && !SERVIES_TELLES_QUELLES.has(r)),
)

/** Message des fonctions que le serveur ne prend pas encore en charge. */
export const MOTIF_NON_DISPONIBLE =
  'Cette fonction n’est pas encore disponible : le serveur AlgoPlanR ne la prend pas encore en charge.'

let desactivees = false

/** Les conversions s'appliquent face au serveur Django, pas aux données factices. */
export function conversionsActives(): boolean {
  return !desactivees && process.env.NEXT_PUBLIC_API_MOCK !== '1'
}

/**
 * Désactive les conversions (tests du client HTTP et des données factices).
 *
 * @returns une fonction qui les rétablit.
 */
export function desactiverConversions(): () => void {
  const precedent = desactivees
  desactivees = true
  return () => {
    desactivees = precedent
  }
}

/** Valeurs des paramètres d'un gabarit, lues dans le chemin concret. */
export function paramsDe(gabarit: string, chemin: string): Record<string, string> {
  const g = gabarit.split('/')
  const c = chemin.split('/')
  const params: Record<string, string> = {}
  g.forEach((segment, i) => {
    const nom = /^\{(\w+)\}$/.exec(segment)?.[1]
    if (nom && c[i] !== undefined) params[nom] = decodeURIComponent(c[i])
  })
  return params
}

/** Le serveur identifie ses jeux par un UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Conversion d'une requête, ou `null` si elle part telle quelle. Une écriture
 * vide toujours les lectures mémorisées du jeu concerné, convertie ou non.
 *
 * Un jeu dont l'identifiant n'est pas un UUID n'existe pas sur le serveur : c'est
 * en général le jeu « demonstration » des données factices, resté en mémoire du
 * navigateur. La réponse est alors un 404, sur lequel l'interface oublie le jeu ;
 * sans cela, `jeux/demonstration/` tomberait sur la route de création du jeu de
 * démonstration du serveur (POST seulement) et répondrait 405.
 */
export function conversionDe(
  requete: RequeteApi,
): ((requete: RequeteApi, envoyer: Transport) => Promise<unknown>) | null {
  // Routes d'accès : servies telles quelles, et sans vider les lectures mémorisées (le signal d'activité
  // part chaque minute pendant le travail).
  if (requete.gabarit.startsWith('acces/')) return null
  const jeu = paramsDe(requete.gabarit, requete.chemin).jeu
  if (jeu !== undefined && !UUID.test(jeu)) {
    return async () => {
      throw new ApiError(404, 'introuvable', 'Ce jeu de données n’existe pas sur le serveur AlgoPlanR.')
    }
  }
  const cle = `${requete.methode} ${requete.gabarit}`
  // Inutile d'interroger le serveur : il répondrait 404, que l'écran présenterait comme un élément disparu.
  if (ROUTES_NON_SERVIES.has(cle)) {
    return async () => {
      throw new ApiError(404, 'non_disponible', MOTIF_NON_DISPONIBLE)
    }
  }
  const conversion = CONVERSIONS[cle]
  if (!conversion && requete.methode === 'GET') return null
  return async (r, envoyer) => {
    const params = paramsDe(r.gabarit, r.chemin)
    try {
      return conversion ? await conversion(r, new Acces(envoyer, r.signal), params) : await envoyer(r)
    } finally {
      if (r.methode !== 'GET') viderCache(params.jeu)
    }
  }
}
