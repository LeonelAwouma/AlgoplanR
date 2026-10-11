/**
 * Adresse et jeton de l'API AlgoPlanR.
 *
 * L'adresse est résolue dans cet ordre :
 *   1. application de bureau : `window.algobaba.api`, exposé par electron-app/preload.js
 *      une fois le backend lancé par Electron (port libre et jeton tirés au démarrage) ;
 *   2. variable `NEXT_PUBLIC_API_URL`, en développement (`http://127.0.0.1:8000`) ;
 *   3. même origine : Django sert le frontend et l'API sur le même port.
 */

/** Préfixe commun à toutes les routes. */
export const PREFIXE_API = '/api/v1'

/** En-tête qui porte le jeton exigé par le backend local. */
export const EN_TETE_JETON = 'X-AlgoPlanR-Jeton'

export interface ConfigurationApi {
  /** Origine du serveur, sans barre finale ; vide pour la même origine. */
  baseUrl: string
  /** Jeton à joindre à chaque requête, `null` hors de l'application de bureau. */
  jeton: string | null
}

/** Retire la barre oblique finale d'une adresse. */
function sansBarreFinale(adresse: string): string {
  return adresse.endsWith('/') ? adresse.slice(0, -1) : adresse
}

/**
 * Configuration courante. Lue à chaque appel : dans l'application de bureau,
 * le pont Electron peut être disponible après le premier rendu.
 */
export function configurationApi(): ConfigurationApi {
  const bureau = typeof window !== 'undefined' ? window.algobaba?.api : undefined
  if (bureau) return { baseUrl: sansBarreFinale(bureau.baseUrl), jeton: bureau.jeton }

  const variable = process.env.NEXT_PUBLIC_API_URL
  return { baseUrl: variable ? sansBarreFinale(variable) : '', jeton: null }
}
