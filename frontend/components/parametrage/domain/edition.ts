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
