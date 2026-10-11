/**
 * Présentation des sélections territoriales : niveau atteint, libellé, fil
 * d'Ariane, libellés des territoires non renseignés.
 *
 * Aucune agrégation ici : les totaux et l'arbre territorial viennent du serveur.
 */

import {
  FILTRES_VIDES,
  SELECTION_NATIONALE,
  type GlobalFilters,
  type SchoolDiagnostic,
  type TerritoryLevel,
  type TerritorySelection,
} from '../api/contrat'

export { FILTRES_VIDES, SELECTION_NATIONALE }

/** Libellés substitués aux territoires vides, identiques à ceux du serveur. */
export const LIBELLE_MANQUANT = {
  region: 'Région non renseignée',
  departement: 'Département non renseigné',
  commune: 'Commune non renseignée',
} as const

/** Niveau atteint par une sélection. */
export function selectionLevel(selection: TerritorySelection): TerritoryLevel {
  if (selection.commune) return 'commune'
  if (selection.departement) return 'departement'
  if (selection.region) return 'region'
  return 'national'
}

/** Libellé lisible d'une sélection, utilisé dans les titres. */
export function selectionLabel(selection: TerritorySelection): string {
  return selection.commune ?? selection.departement ?? selection.region ?? 'Cameroun'
}

/** Fil d'Ariane complet, du niveau national jusqu'à la sélection courante. */
export function breadcrumb(selection: TerritorySelection): { label: string; selection: TerritorySelection }[] {
  const elements: { label: string; selection: TerritorySelection }[] = [
    { label: 'Cameroun', selection: SELECTION_NATIONALE },
  ]
  if (selection.region) {
    elements.push({
      label: selection.region,
      selection: { region: selection.region, departement: null, commune: null },
    })
  }
  if (selection.region && selection.departement) {
    elements.push({
      label: selection.departement,
      selection: { region: selection.region, departement: selection.departement, commune: null },
    })
  }
  if (selection.region && selection.departement && selection.commune) {
    elements.push({ label: selection.commune, selection: { ...selection } })
  }
  return elements
}

/** Libellés territoriaux d'une école, avec substitution explicite des valeurs vides. */
export function territoiresDe(d: SchoolDiagnostic): { region: string; departement: string; commune: string } {
  return {
    region: d.school.region || LIBELLE_MANQUANT.region,
    departement: d.school.departement || LIBELLE_MANQUANT.departement,
    commune: d.school.commune || LIBELLE_MANQUANT.commune,
  }
}

/** Vrai si aucun filtre n'est actif. */
export function aucunFiltreActif(filtres: GlobalFilters): boolean {
  return (
    !filtres.territoire.region &&
    !filtres.territoire.departement &&
    !filtres.territoire.commune &&
    filtres.zones.length === 0 &&
    filtres.zonesSecurite.length === 0 &&
    filtres.typesEtab.length === 0 &&
    filtres.severites.length === 0 &&
    filtres.multigradesUniquement === null
  )
}

/** Sélection descendant d'un niveau sous la sélection courante. */
export function descendre(selection: TerritorySelection, nom: string): TerritorySelection {
  if (!selection.region) return { region: nom, departement: null, commune: null }
  if (!selection.departement) return { ...selection, departement: nom, commune: null }
  return { ...selection, commune: nom }
}
