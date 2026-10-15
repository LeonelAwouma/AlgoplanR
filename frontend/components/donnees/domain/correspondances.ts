/**
 * Lecture de la correspondance des colonnes renvoyée par le serveur : ce qui
 * manque, ce qui est à confirmer, ce qui est reconnu.
 *
 * Le serveur fait la reconnaissance ; ces fonctions décident seulement de ce
 * que l'interface montre à l'utilisateur.
 */

import type { ColumnMappingReport, ColumnMatch, TypeFichier } from '../../shared/api'

/** En dessous de cette confiance, un rapprochement est présenté comme « à confirmer ». */
export const SEUIL_CONFIRMATION = 0.85

/** Colonnes indispensables qu'aucun en-tête du fichier ne couvre : l'analyse est bloquée. */
export function colonnesRequisesManquantes(correspondances: ColumnMappingReport): ColumnMatch[] {
  return correspondances.matches.filter(m => m.requis && m.enTete === null)
}

/** Colonnes rapprochées par ressemblance, qui méritent une vérification humaine. */
export function colonnesAConfirmer(correspondances: ColumnMappingReport): ColumnMatch[] {
  return correspondances.matches.filter(m => m.enTete !== null && m.confiance < SEUIL_CONFIRMATION)
}

/** Nombre de champs métier rattachés à une colonne du fichier. */
export function nombreDeColonnesReconnues(correspondances: ColumnMappingReport): number {
  return correspondances.matches.filter(m => m.enTete !== null).length
}

/** Présentation des deux classeurs attendus. */
export const DESCRIPTION_FICHIER: Record<TypeFichier, { titre: string; texte: string }> = {
  etablissements: {
    titre: 'Établissements',
    texte:
      'La liste des écoles, avec leur territoire, leur nombre de classes et leurs enseignants. Les effectifs d’élèves sont facultatifs : sans eux, les indicateurs pédagogiques ne sont simplement pas calculés.',
  },
  enseignants: {
    titre: 'Enseignants',
    texte:
      'La liste du personnel, avec son école de rattachement et les éléments du barème (ancienneté, situation familiale, formation continue).',
  },
}

/** Les deux classeurs, dans l'ordre d'affichage. */
export const TYPES_FICHIER: readonly TypeFichier[] = ['etablissements', 'enseignants']

/** Formats de classeur acceptés par le serveur. */
export const FORMATS_ACCEPTES = '.xlsx,.xls,.xlsm,.csv'
