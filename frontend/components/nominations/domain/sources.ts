/** Valeurs proposées dans les filtres et les imports du contexte « Nominations », dans l'ordre d'affichage. */

import type { SourceVivier, StatutNomination, StatutPoste, TypeMouvement } from '../../shared/api'

/** Sources que l'on peut importer depuis un fichier (les deux premières viennent des calculs). */
export const SOURCES_IMPORTABLES: readonly SourceVivier[] = [
  'disponibilite',
  'fin_detachement',
  'reintegration',
  'autre',
]

export const STATUTS_NOMINATION: readonly StatutNomination[] = [
  'proposee',
  'validee',
  'mise_en_oeuvre',
  'rejetee',
  'annulee',
]

export const STATUTS_POSTE: readonly StatutPoste[] = ['libre', 'reserve', 'pourvu']

export const TYPES_MOUVEMENT: readonly TypeMouvement[] = [
  'redeploiement',
  'fait_prince',
  'deploiement_recrue',
  'nomination',
]
