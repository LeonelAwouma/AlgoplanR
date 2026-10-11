/** Utilitaires sur les objets de données reçus du serveur. */

/**
 * Copie profonde d'un objet de données (sans fonction ni classe), par exemple
 * des paramètres à modifier dans un formulaire sans toucher au cache.
 */
export function cloner<T>(valeur: T): T {
  return structuredClone(valeur)
}
