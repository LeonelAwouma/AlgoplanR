/**
 * Jeton de la session de la personne connectée.
 *
 * Le serveur délivre un jeton à la connexion et n'en garde que l'empreinte ; il
 * contrôle lui-même l'expiration. Le jeton est tenu en mémoire et doublé dans le
 * stockage de session de la fenêtre, pour survivre à un rechargement : il
 * disparaît quand la fenêtre se ferme. Il n'est jamais écrit dans le stockage
 * local durable.
 *
 * Le client HTTP joint ce jeton à chaque requête et signale ici les refus
 * d'accès du serveur (session expirée, mot de passe à changer…), auxquels la
 * porte d'accès réagit.
 */

const CLE = 'algoplanr.session'

/** Refus d'accès du serveur qui changent l'écran affiché. */
export type EvenementAcces =
  'session_expiree' | 'session_invalide' | 'non_authentifie' | 'mot_de_passe_a_changer' | 'region_a_confirmer'

const CODES: ReadonlySet<string> = new Set<EvenementAcces>([
  'session_expiree',
  'session_invalide',
  'non_authentifie',
  'mot_de_passe_a_changer',
  'region_a_confirmer',
])

let courant: string | null | undefined
const abonnes = new Set<(evenement: EvenementAcces) => void>()

function stockage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

/** Jeton courant, `null` sans session. */
export function lireJeton(): string | null {
  if (courant === undefined) {
    try {
      courant = stockage()?.getItem(CLE) ?? null
    } catch {
      courant = null
    }
  }
  return courant
}

/** Remplace le jeton (connexion, changement de mot de passe) ; `null` l'oublie (déconnexion). */
export function definirJeton(jeton: string | null): void {
  courant = jeton
  try {
    if (jeton) stockage()?.setItem(CLE, jeton)
    else stockage()?.removeItem(CLE)
  } catch {
    // Stockage indisponible : le jeton reste en mémoire pour la durée de la page.
  }
}

/** S'abonne aux refus d'accès du serveur. Renvoie la fonction de désabonnement. */
export function surEvenementAcces(rappel: (evenement: EvenementAcces) => void): () => void {
  abonnes.add(rappel)
  return () => abonnes.delete(rappel)
}

/** Appelé par le client HTTP pour toute réponse 401 ou 403 : ne retient que les codes d'accès. */
export function signalerRefus(code: string): void {
  if (!CODES.has(code)) return
  for (const rappel of abonnes) rappel(code as EvenementAcces)
}
