/**
 * Thème d'affichage : clair ou sombre.
 *
 * Le thème est porté par l'attribut `data-theme` de `<html>`, que lisent les
 * variables de couleur de app/globals.css. Il est appliqué avant le premier
 * affichage par `SCRIPT_THEME` (inséré dans app/layout.tsx), pour éviter un
 * éclair de la mauvaise couleur au chargement ; la session prend ensuite le
 * relais. Sans choix enregistré, on suit le réglage du système.
 */

export type Theme = 'clair' | 'sombre'

/**
 * Script exécuté pendant la lecture du HTML, avant le premier affichage.
 * La clé et l'encodage JSON sont ceux de `preferences.ts` (`algobaba.theme`).
 */
export const SCRIPT_THEME = `(function(){try{var t=JSON.parse(localStorage.getItem("algobaba.theme")||"null")}catch(e){t=null}if(t!=="clair"&&t!=="sombre"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"sombre":"clair"}document.documentElement.setAttribute("data-theme",t)})()`

/** Thème du système d'exploitation, clair par défaut. */
export function themeSysteme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'clair'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair'
}

/** Thème actuellement appliqué à la page. */
export function themeApplique(): Theme {
  if (typeof document === 'undefined') return 'clair'
  return document.documentElement.getAttribute('data-theme') === 'sombre' ? 'sombre' : 'clair'
}

/** Applique un thème à la page. */
export function appliquerTheme(theme: Theme): void {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', theme)
}
