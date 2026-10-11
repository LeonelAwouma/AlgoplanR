/**
 * Préférences d'interface conservées dans le navigateur.
 *
 * Seules des préférences non sensibles y figurent : le mode d'affichage, le nom
 * de l'agent qui signe les décisions et l'identifiant du dernier jeu ouvert,
 * pour le rouvrir au lancement suivant.
 * Les données elles-mêmes (établissements, enseignants, décisions) sont
 * conservées par le serveur, jamais dans le navigateur.
 */

const PREFIXE = 'algobaba.'

/** Clés autorisées : la liste est fermée, pour éviter tout stockage accidentel. */
export type ClePreference = 'vue' | 'jeu' | 'auteur'

/** Vrai si le stockage local est utilisable (absent au rendu statique, bloqué en mode privé). */
function disponible(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

/** Lit une préférence, ou renvoie la valeur par défaut si elle est absente ou illisible. */
export function lirePreference<T>(cle: ClePreference, defaut: T): T {
  if (!disponible()) return defaut
  try {
    const brut = window.localStorage.getItem(PREFIXE + cle)
    if (brut == null) return defaut
    return JSON.parse(brut) as T
  } catch {
    return defaut
  }
}

/** Enregistre une préférence ; `null` la supprime. */
export function ecrirePreference(cle: ClePreference, valeur: unknown): void {
  if (!disponible()) return
  try {
    if (valeur === null) window.localStorage.removeItem(PREFIXE + cle)
    else window.localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur))
  } catch {
    // Mode privé ou stockage plein : l'application continue sans persistance.
  }
}

/** Supprime toutes les préférences enregistrées par l'application. */
export function effacerPreferences(): void {
  if (!disponible()) return
  try {
    const aSupprimer: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const cle = window.localStorage.key(i)
      if (cle && cle.startsWith(PREFIXE)) aSupprimer.push(cle)
    }
    for (const cle of aSupprimer) window.localStorage.removeItem(cle)
  } catch {
    // Rien à faire : l'interface repart de toute façon de zéro.
  }
}
