/** Les dix régions du Cameroun, sous leur dénomination française officielle. */
export const REGIONS_CAMEROUN = [
  'Adamaoua',
  'Centre',
  'Est',
  'Extrême-Nord',
  'Littoral',
  'Nord',
  'Nord-Ouest',
  'Ouest',
  'Sud',
  'Sud-Ouest',
] as const

export type RegionCameroun = (typeof REGIONS_CAMEROUN)[number]
