/**
 * Lecture de la correspondance des colonnes renvoyée par le serveur : ce qui
 * manque, ce qui est à confirmer, ce qui est reconnu.
 *
 * Le serveur fait la reconnaissance ; ces fonctions décident seulement de ce
 * que l'interface montre à l'utilisateur.
 */

import type { ColumnMappingReport, ColumnMatch, TypeFichier, TypeFichierEnvoi } from '../../shared/api'

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
export const DESCRIPTION_FICHIER: Record<TypeFichierEnvoi, { titre: string; texte: string }> = {
  etablissements: {
    titre: 'Fichier des établissements',
    texte:
      'La liste des écoles, avec leur territoire, leur nombre de classes et leurs enseignants. Les effectifs d’élèves sont facultatifs : sans eux, les indicateurs pédagogiques ne sont simplement pas calculés.',
  },
  enseignants: {
    titre: 'Fichier des enseignants',
    texte:
      'Facultatif. La liste nominative du personnel, avec son école de rattachement et les éléments du barème (ancienneté, situation familiale, formation continue). Sans lui, les analyses scolaires restent disponibles ; les retraites individuelles, les âges et les affectations individuelles ne sont pas calculables.',
  },
  prince: {
    titre: 'Faits du prince',
    texte:
      'Les décisions d’affectation de l’autorité : un enseignant du vivier et l’école où il est imposé. Elles passent avant l’algorithme, qui calcule ensuite normalement le reste.',
  },
}

/** Les deux classeurs, dans l'ordre d'affichage : celui des établissements est obligatoire, celui des enseignants facultatif. */
export const TYPES_FICHIER: readonly TypeFichier[] = ['etablissements', 'enseignants']

/** Formats de classeur acceptés par le serveur. */
export const FORMATS_ACCEPTES = '.xlsx,.xls,.xlsm,.csv'

/**
 * Message affiché avant la validation quand seul le fichier des établissements est fourni, pour que le mode soit
 * connu avant l'analyse. Une fois le jeu créé, le serveur renvoie son propre message de mode (`messageModeImport`).
 */
export const MESSAGE_ETABLISSEMENTS_SEULS =
  'Vous pouvez poursuivre avec les établissements seuls. Les analyses scolaires seront disponibles, mais les retraites, les affectations individuelles et certains scénarios resteront incomplets jusqu’à l’importation des enseignants.'
