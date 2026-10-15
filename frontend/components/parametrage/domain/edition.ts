/**
 * Édition des règles du moteur dans un formulaire : chaque champ applique une
 * transformation pure au jeu de règles en cours de saisie.
 */

import type { EngineSettings } from '../../shared/api'

/** Applique une transformation au jeu de règles en cours de saisie. */
export type MajParametres = (transformation: (parametres: EngineSettings) => EngineSettings) => void

/** Valeur numérique d'un champ de saisie ; un champ vidé vaut 0. */
export function nombreSaisi(valeur: string): number {
  return valeur === '' ? 0 : Number(valeur)
}

/** Arrondi au centième, sans les artefacts de la virgule flottante (0,1 + 0,2). */
function centieme(valeur: number): number {
  return Math.round(valeur * 100) / 100
}

/** Somme de pondérations, arrondie au centième. */
export function sommePoids(poids: Record<string, number>): number {
  return centieme(Object.values(poids).reduce((somme, p) => somme + p, 0))
}

/**
 * Fixe un poids d'un groupe dont la somme vaut 1 et ajuste les autres.
 *
 * Le reste (1 − nouveau poids) est réparti entre les autres critères au prorata
 * de leurs poids actuels, ce qui conserve leurs proportions ; s'ils sont tous à
 * 0, il est partagé à parts égales. Les poids sont arrondis au centième et
 * l'écart d'arrondi est porté par le plus grand des autres, pour que la somme
 * fasse exactement 1.
 */
export function reequilibrerPoids<K extends string>(
  poids: Record<K, number>,
  cle: NoInfer<K>,
  valeur: number,
): Record<K, number> {
  const fixe = centieme(Math.min(1, Math.max(0, valeur)))
  const autres = (Object.keys(poids) as K[]).filter(k => k !== cle)
  const resultat: Record<K, number> = { ...poids }
  resultat[cle] = fixe
  if (autres.length === 0) return resultat

  const reste = centieme(1 - fixe)
  const sommeAutres = autres.reduce((somme, k) => somme + Math.max(0, poids[k]), 0)
  for (const k of autres) {
    const part = sommeAutres > 0 ? Math.max(0, poids[k]) / sommeAutres : 1 / autres.length
    resultat[k] = centieme(reste * part)
  }

  const ecart = centieme(reste - autres.reduce((somme, k) => somme + resultat[k], 0))
  if (ecart !== 0) {
    const plusGrand = autres.reduce((max, k) => (resultat[k] > resultat[max] ? k : max), autres[0])
    resultat[plusGrand] = centieme(resultat[plusGrand] + ecart)
  }
  return resultat
}
