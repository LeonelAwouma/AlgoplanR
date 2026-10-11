/**
 * Support cartographique.
 *
 * Les fonds de carte proviennent de fichiers GeoJSON déposés localement dans
 * `public/geo/` : aucune tuile distante, aucun service en ligne. Si un fichier
 * est absent, la page bascule sur une représentation non spatiale qui porte les
 * mêmes valeurs, plutôt que d'afficher des contours inventés.
 *
 * Le rapprochement entre les libellés du fond de carte et ceux des données
 * importées est entièrement local : normalisation, table d'alias, puis
 * comparaison de chaînes. Les fonds publics disponibles nomment souvent les
 * régions du Cameroun en anglais (« Far North »), alors que les fichiers
 * administratifs les nomment en français (« Extrême-Nord ») : sans cette table,
 * la majorité des régions resteraient non appariées.
 */

import { REGIONS_CAMEROUN, type RegionCameroun } from '../../kernel/regions'
import { levenshtein } from '../../kernel/texte'

export { REGIONS_CAMEROUN, type RegionCameroun }

/** Chemin du fichier GeoJSON des régions, à déposer par l'administrateur. */
export const CHEMIN_GEOJSON_REGIONS = '/geo/cameroun-regions.geojson'
/** Chemin du fichier GeoJSON des départements, optionnel. */
export const CHEMIN_GEOJSON_DEPARTEMENTS = '/geo/cameroun-departements.geojson'
/** Chemin du fichier GeoJSON des arrondissements (communes), optionnel. */
export const CHEMIN_GEOJSON_ARRONDISSEMENTS = '/geo/cameroun-arrondissements.geojson'

/**
 * Dénominations alternatives des régions, sous forme normalisée.
 * Couvre l'anglais (fonds de carte internationaux), les abréviations usuelles et
 * les graphies sans trait d'union.
 */
const ALIAS_REGIONS: Record<string, RegionCameroun> = {
  adamaoua: 'Adamaoua',
  adamawa: 'Adamaoua',
  centre: 'Centre',
  center: 'Centre',
  central: 'Centre',
  est: 'Est',
  east: 'Est',
  extremenord: 'Extrême-Nord',
  farnorth: 'Extrême-Nord',
  extremenorth: 'Extrême-Nord',
  littoral: 'Littoral',
  coastal: 'Littoral',
  nord: 'Nord',
  north: 'Nord',
  nordouest: 'Nord-Ouest',
  northwest: 'Nord-Ouest',
  nw: 'Nord-Ouest',
  ouest: 'Ouest',
  west: 'Ouest',
  sud: 'Sud',
  south: 'Sud',
  sudouest: 'Sud-Ouest',
  southwest: 'Sud-Ouest',
  sw: 'Sud-Ouest',
}

/** Géométrie minimale exploitée par la carte : polygones et multipolygones. */
export interface GeoGeometry {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}

export interface GeoFeature {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: GeoGeometry | null
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

/** Noms de propriétés couramment utilisés pour porter le libellé d'un territoire. */
const CLES_NOM = [
  'nom',
  'name',
  'NAME',
  'NAME_1',
  'NAME_2',
  'shapeName',
  'region',
  'REGION',
  'departement',
  'admin1Name',
]

/** Caractères Windows-1252 situés dans la plage 0x80–0x9F, absents de l'ISO 8859-1. */
const OCTET_CP1252: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  ƒ: 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  ˆ: 0x88,
  '‰': 0x89,
  Š: 0x8a,
  '‹': 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  š: 0x9a,
  '›': 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
}

/**
 * Répare un libellé encodé deux fois (UTF-8 relu comme du Latin-1) : « MÃ©long »
 * redevient « Mélong ». Certains exports publics de fonds de carte présentent ce
 * défaut. Un libellé sain, ou qui ne redevient pas de l'UTF-8 valide, est rendu
 * tel quel : la réparation ne peut pas abîmer un nom correct.
 */
export function reparerEncodage(texte: string): string {
  if (!/[ÃÂ]/.test(texte)) return texte
  const octets = new Uint8Array(texte.length)
  for (let i = 0; i < texte.length; i++) {
    const code = texte.charCodeAt(i)
    const octet = code < 256 ? code : OCTET_CP1252[texte[i]]
    if (octet === undefined) return texte
    octets[i] = octet
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets)
  } catch {
    return texte
  }
}

/** Extrait le libellé d'une entité GeoJSON, `null` si aucune clé connue n'est présente. */
export function nomDeFeature(feature: GeoFeature): string | null {
  for (const cle of CLES_NOM) {
    const valeur = feature.properties[cle]
    if (typeof valeur === 'string' && valeur.trim() !== '') return reparerEncodage(valeur.trim())
  }
  return null
}

function estFeatureCollection(valeur: unknown): valeur is GeoFeatureCollection {
  if (typeof valeur !== 'object' || valeur === null) return false
  const candidat = valeur as { type?: unknown; features?: unknown }
  return candidat.type === 'FeatureCollection' && Array.isArray(candidat.features)
}

/**
 * Charge un GeoJSON embarqué. Renvoie `null` — sans erreur bloquante — quand le
 * fichier est absent ou n'est pas un GeoJSON valide : la carte affiche alors sa
 * solution de repli.
 */
export async function chargerGeoJson(chemin: string): Promise<GeoFeatureCollection | null> {
  try {
    const reponse = await fetch(chemin, { cache: 'force-cache' })
    if (!reponse.ok) return null
    const type = reponse.headers.get('content-type') ?? ''
    // Un serveur de fichiers statiques renvoie souvent index.html pour une route
    // inconnue : on écarte explicitement ce cas plutôt que de tenter un parse.
    if (type.includes('text/html')) return null
    const donnees: unknown = await reponse.json()
    return estFeatureCollection(donnees) ? donnees : null
  } catch {
    return null
  }
}

/** Forme comparable d'un libellé : sans accent, sans casse, sans ponctuation. */
export function cleTerritoire(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Rapproche un libellé de région des dix régions officielles, `null` si aucun rapprochement. */
export function normaliserRegion(libelle: string): RegionCameroun | null {
  return ALIAS_REGIONS[cleTerritoire(libelle)] ?? null
}

/** Numéro d'ordre en fin de libellé : chiffres arabes ou romains, avec ou sans « er / e ». */
const SUFFIXE_NUMERO = /\s+(\d+|[IVXivx]+)(er|e|ème|eme)?$/

/**
 * Compare deux libellés de territoire. Après normalisation et résolution des
 * alias de régions, une tolérance d'un caractère est admise pour absorber les
 * variantes de graphie des départements (« Nyong-et-So'o » / « Nyong-et-So »).
 */
export function memeTerritoire(a: string, b: string): boolean {
  const ca = cleTerritoire(a)
  const cb = cleTerritoire(b)
  if (ca === cb) return true

  const ra = normaliserRegion(a)
  const rb = normaliserRegion(b)
  if (ra && rb) return ra === rb
  if (ra || rb) return false

  // « Yaoundé I » et « Yaoundé II » sont deux communes distinctes : un numéro
  // d'ordre en fin de libellé exige l'égalité stricte, jamais la tolérance.
  if (SUFFIXE_NUMERO.test(a.trim()) || SUFFIXE_NUMERO.test(b.trim())) return false

  // Tolérance courte, proportionnée à la longueur : deux libellés de trois
  // lettres ne doivent jamais être confondus.
  const longueur = Math.min(ca.length, cb.length)
  if (longueur < 6) return false
  return levenshtein(ca, cb) <= 1
}

/** Enveloppe englobante d'une collection, pour calculer la projection d'affichage. */
export function boiteEnglobante(
  features: GeoFeature[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const visiter = (coords: unknown): void => {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const x = coords[0] as number
      const y = coords[1] as number
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      return
    }
    for (const c of coords) visiter(c)
  }

  for (const feature of features) {
    if (feature.geometry) visiter(feature.geometry.coordinates)
  }

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

/** Anneaux d'une géométrie, quel que soit son type (Polygon ou MultiPolygon). */
export function anneaux(geometry: GeoGeometry): number[][][] {
  if (geometry.type === 'Polygon') return geometry.coordinates as number[][][]
  return (geometry.coordinates as number[][][][]).flat()
}

/**
 * Apparie les entités d'un fond de carte aux territoires présents dans les
 * données. Renvoie, pour chaque entité, le nom du territoire correspondant —
 * `null` quand l'entité n'existe pas dans le jeu de données analysé.
 */
export function apparierFeatures(
  features: GeoFeature[],
  nomsDesDonnees: string[],
): { feature: GeoFeature; nomGeo: string; territoire: string | null }[] {
  return features.map(feature => {
    const nomGeo = nomDeFeature(feature) ?? ''
    // L'égalité stricte prime sur la tolérance : sans cela, une variante proche
    // listée plus tôt pourrait capter l'entité avant son véritable homonyme.
    const cle = cleTerritoire(nomGeo)
    const territoire =
      nomsDesDonnees.find(nom => cleTerritoire(nom) === cle) ??
      nomsDesDonnees.find(nom => memeTerritoire(nom, nomGeo)) ??
      null
    return { feature, nomGeo, territoire }
  })
}
