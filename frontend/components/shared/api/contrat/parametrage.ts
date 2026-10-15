/**
 * Contrat de l'API — contexte « Paramétrage » : règles du moteur et inventaire
 * des situations familiales.
 */

import type { EngineSettings } from './simulation'

/** Mise à jour partielle des règles : seules les clés fournies changent, à toute profondeur. */
export type MiseAJourParametres = { [K in keyof EngineSettings]?: ProfondementPartiel<EngineSettings[K]> }

/** Rend toutes les propriétés facultatives, récursivement (les tableaux restent entiers). */
export type ProfondementPartiel<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: ProfondementPartiel<T[K]> }
    : T

/** Inventaire des situations familiales lues dans le fichier des enseignants. */
export interface InventaireSituations {
  reconnues: { cle: string; libelle: string; effectif: number; graphies: string[] }[]
  nonReconnues: { valeur: string; effectif: number }[]
  nonRenseignees: number
}
