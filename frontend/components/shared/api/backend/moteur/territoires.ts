/**
 * Agrégations territoriales : Cameroun → Région → Département → Commune → École.
 *
 * L'arbre est construit à partir des seuls libellés présents dans les données
 * importées ; aucun découpage administratif n'est supposé ni complété. Une
 * école dont la région est vide est rattachée à un nœud explicitement nommé
 * « Région non renseignée », pour qu'elle reste comptée et visible.
 */

import type {
  EducationTerritory,
  SchoolDiagnostic,
  SchoolSeverity,
  TerritorialSummary,
  TerritoryLevel,
  Zone,
  ZoneSecurite,
} from '../../contrat'
import { agregerTotaux } from './diagnostic'

export const LIBELLE_MANQUANT = {
  region: 'Région non renseignée',
  departement: 'Département non renseigné',
  commune: 'Commune non renseignée',
} as const

const SEPARATEUR = ' / '

/** Construit le code d'un territoire à partir de son chemin. */
export function territoryCode(parts: (string | null)[]): string {
  return parts.filter((p): p is string => !!p).join(SEPARATEUR)
}

/** Découpe un code de territoire en ses composantes. */
export function parseTerritoryCode(code: string): {
  region: string | null
  departement: string | null
  commune: string | null
} {
  if (!code) return { region: null, departement: null, commune: null }
  const parts = code.split(SEPARATEUR)
  return { region: parts[0] ?? null, departement: parts[1] ?? null, commune: parts[2] ?? null }
}

/** Sélection territoriale courante, persistée dans l'état de l'application. */
export interface TerritorySelection {
  region: string | null
  departement: string | null
  commune: string | null
}

export const SELECTION_NATIONALE: TerritorySelection = { region: null, departement: null, commune: null }

/** Niveau atteint par une sélection. */
export function selectionLevel(selection: TerritorySelection): TerritoryLevel {
  if (selection.commune) return 'commune'
  if (selection.departement) return 'departement'
  if (selection.region) return 'region'
  return 'national'
}

/** Libellé lisible d'une sélection, utilisé dans les titres et les rapports. */
export function selectionLabel(selection: TerritorySelection): string {
  return selection.commune ?? selection.departement ?? selection.region ?? 'Cameroun'
}

/** Fil d'Ariane complet, du niveau national jusqu'à la sélection courante. */
export function breadcrumb(selection: TerritorySelection): { label: string; selection: TerritorySelection }[] {
  const items: { label: string; selection: TerritorySelection }[] = [
    { label: 'Cameroun', selection: SELECTION_NATIONALE },
  ]
  if (selection.region) {
    items.push({ label: selection.region, selection: { region: selection.region, departement: null, commune: null } })
  }
  if (selection.region && selection.departement) {
    items.push({
      label: selection.departement,
      selection: { region: selection.region, departement: selection.departement, commune: null },
    })
  }
  if (selection.region && selection.departement && selection.commune) {
    items.push({ label: selection.commune, selection: { ...selection } })
  }
  return items
}

/** Libellés territoriaux d'une école, avec substitution explicite des valeurs vides. */
export function territoiresDe(d: SchoolDiagnostic): { region: string; departement: string; commune: string } {
  return {
    region: d.school.region || LIBELLE_MANQUANT.region,
    departement: d.school.departement || LIBELLE_MANQUANT.departement,
    commune: d.school.commune || LIBELLE_MANQUANT.commune,
  }
}

/** Restreint une liste de diagnostics à la sélection territoriale courante. */
export function filtrerParTerritoire(
  diagnostics: SchoolDiagnostic[],
  selection: TerritorySelection,
): SchoolDiagnostic[] {
  if (!selection.region && !selection.departement && !selection.commune) return diagnostics
  return diagnostics.filter(d => {
    const t = territoiresDe(d)
    if (selection.region && t.region !== selection.region) return false
    if (selection.departement && t.departement !== selection.departement) return false
    if (selection.commune && t.commune !== selection.commune) return false
    return true
  })
}

/** Filtres globaux persistants du tableau de bord (§4). */
export interface GlobalFilters {
  territoire: TerritorySelection
  zones: Zone[]
  /** Zones de sécurité ; une école sans zone renseignée compte en zone verte, comme dans le calcul. */
  zonesSecurite: ZoneSecurite[]
  typesEtab: string[]
  severites: SchoolSeverity[]
  /** `null` = indifférent, `true` = uniquement les écoles à classes multigrades. */
  multigradesUniquement: boolean | null
}

export const FILTRES_VIDES: GlobalFilters = {
  territoire: SELECTION_NATIONALE,
  zones: [],
  zonesSecurite: [],
  typesEtab: [],
  severites: [],
  multigradesUniquement: null,
}

export function aucunFiltreActif(f: GlobalFilters): boolean {
  return (
    !f.territoire.region &&
    !f.territoire.departement &&
    !f.territoire.commune &&
    f.zones.length === 0 &&
    f.zonesSecurite.length === 0 &&
    f.typesEtab.length === 0 &&
    f.severites.length === 0 &&
    f.multigradesUniquement === null
  )
}

/** Applique l'ensemble des filtres globaux à une liste de diagnostics. */
export function appliquerFiltres(diagnostics: SchoolDiagnostic[], f: GlobalFilters): SchoolDiagnostic[] {
  let resultat = filtrerParTerritoire(diagnostics, f.territoire)
  if (f.zones.length > 0) resultat = resultat.filter(d => f.zones.includes(d.school.zone))
  if (f.zonesSecurite.length > 0)
    resultat = resultat.filter(d => f.zonesSecurite.includes(d.school.zoneSecurite ?? 'verte'))
  if (f.typesEtab.length > 0) resultat = resultat.filter(d => f.typesEtab.includes(d.school.typeEtab))
  if (f.severites.length > 0) resultat = resultat.filter(d => f.severites.includes(d.severite))
  if (f.multigradesUniquement === true) resultat = resultat.filter(d => d.school.classesMultigrades > 0)
  if (f.multigradesUniquement === false) resultat = resultat.filter(d => d.school.classesMultigrades === 0)
  return resultat
}

function territoire(
  level: TerritoryLevel,
  nom: string,
  region: string | null,
  departement: string | null,
  commune: string | null,
  parentCode: string | null,
): EducationTerritory {
  return { code: territoryCode([region, departement, commune]), level, nom, region, departement, commune, parentCode }
}

/**
 * Construit l'arbre territorial complet à partir des diagnostics fournis.
 * Chaque nœud porte ses totaux agrégés et la liste des écoles rattachées.
 */
export function construireArbreTerritorial(diagnostics: SchoolDiagnostic[]): TerritorialSummary {
  interface Bucket {
    nom: string
    diagnostics: SchoolDiagnostic[]
    enfants: Map<string, Bucket>
  }

  const racine: Bucket = { nom: 'Cameroun', diagnostics: [], enfants: new Map() }

  for (const d of diagnostics) {
    const t = territoiresDe(d)
    racine.diagnostics.push(d)

    let region = racine.enfants.get(t.region)
    if (!region) {
      region = { nom: t.region, diagnostics: [], enfants: new Map() }
      racine.enfants.set(t.region, region)
    }
    region.diagnostics.push(d)

    let departement = region.enfants.get(t.departement)
    if (!departement) {
      departement = { nom: t.departement, diagnostics: [], enfants: new Map() }
      region.enfants.set(t.departement, departement)
    }
    departement.diagnostics.push(d)

    let commune = departement.enfants.get(t.commune)
    if (!commune) {
      commune = { nom: t.commune, diagnostics: [], enfants: new Map() }
      departement.enfants.set(t.commune, commune)
    }
    commune.diagnostics.push(d)
  }

  const parPostes = (a: TerritorialSummary, b: TerritorialSummary) =>
    b.totals.postesNecessaires - a.totals.postesNecessaires || a.territory.nom.localeCompare(b.territory.nom, 'fr')

  function sommaire(
    bucket: Bucket,
    level: TerritoryLevel,
    region: string | null,
    departement: string | null,
    commune: string | null,
    parentCode: string | null,
  ): TerritorialSummary {
    const code = territoryCode([region, departement, commune])
    let children: TerritorialSummary[] = []
    if (level === 'national') {
      children = [...bucket.enfants.values()].map(b => sommaire(b, 'region', b.nom, null, null, code))
    } else if (level === 'region') {
      children = [...bucket.enfants.values()].map(b => sommaire(b, 'departement', region, b.nom, null, code))
    } else if (level === 'departement') {
      children = [...bucket.enfants.values()].map(b => sommaire(b, 'commune', region, departement, b.nom, code))
    }
    children.sort(parPostes)

    return {
      territory: territoire(level, bucket.nom, region, departement, commune, parentCode),
      totals: agregerTotaux(bucket.diagnostics),
      schoolIds: bucket.diagnostics.map(d => d.school.id),
      children,
    }
  }

  return sommaire(racine, 'national', null, null, null, null)
}

/** Retrouve le nœud correspondant à une sélection, `null` s'il n'existe pas. */
export function trouverNoeud(arbre: TerritorialSummary, selection: TerritorySelection): TerritorialSummary | null {
  let courant: TerritorialSummary = arbre
  for (const nom of [selection.region, selection.departement, selection.commune]) {
    if (!nom) return courant
    const enfant = courant.children.find(c => c.territory.nom === nom)
    if (!enfant) return null
    courant = enfant
  }
  return courant
}

/** Liste plate des régions, pour la carte et les graphiques par région. */
export function resumesParRegion(arbre: TerritorialSummary): TerritorialSummary[] {
  return arbre.children
}

/**
 * Territoires où déficits et excédents coexistent : ce sont ceux où un
 * redéploiement interne peut avoir un effet sans mouvement longue distance.
 */
export function territoiresMixtes(noeuds: TerritorialSummary[]): TerritorialSummary[] {
  return noeuds
    .filter(n => n.totals.postesNecessaires > 0 && n.totals.excedentMobilisable > 0)
    .sort(
      (a, b) =>
        Math.min(b.totals.postesNecessaires, b.totals.excedentMobilisable) -
        Math.min(a.totals.postesNecessaires, a.totals.excedentMobilisable),
    )
}

/** Libellé du niveau immédiatement sous un nœud, au pluriel. */
export function libelleNiveauEnfants(noeud: TerritorialSummary): string {
  switch (noeud.territory.level) {
    case 'national':
      return 'région'
    case 'region':
      return 'département'
    case 'departement':
      return 'commune'
    default:
      return 'établissement'
  }
}

/** Valeurs distinctes disponibles pour alimenter les menus de filtres. */
export function optionsDeFiltre(diagnostics: SchoolDiagnostic[]): {
  regions: string[]
  typesEtab: string[]
  zones: Zone[]
} {
  const regions = new Set<string>()
  const types = new Set<string>()
  const zones = new Set<Zone>()
  for (const d of diagnostics) {
    regions.add(d.school.region || LIBELLE_MANQUANT.region)
    if (d.school.typeEtab) types.add(d.school.typeEtab)
    zones.add(d.school.zone)
  }
  return {
    regions: [...regions].sort((a, b) => a.localeCompare(b, 'fr')),
    typesEtab: [...types].sort((a, b) => a.localeCompare(b, 'fr')),
    zones: [...zones],
  }
}
