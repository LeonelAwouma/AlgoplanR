/**
 * Lectures territoriales d'un résultat de simulation.
 *
 * La simulation est toujours exécutée sur l'ensemble du jeu de données : le
 * vivier mobilisable est national, et le restreindre a priori fausserait les
 * volumes. Quand l'utilisateur descend dans un territoire, on ne recalcule donc
 * rien — on relit le même résultat sous plusieurs angles :
 *
 *   — vue **destination** : ce que le territoire reçoit (postes couverts chez lui) ;
 *   — vue **origine**     : ce que le territoire fournit (enseignants qui en partent) ;
 *   — vue **flux**        : entrants, sortants, mouvements internes et solde.
 *
 * Ne lire qu'une seule de ces vues est trompeur dès que les mouvements
 * franchissent les frontières : dans un scénario étendu, un enseignant du Centre
 * peut couvrir un poste dans l'Est. La vue destination le fait apparaître à
 * l'Est ; seule la vue origine montre que le Centre l'a perdu.
 */

import type { ProposedAssignment, ProximityLevel, SimulationResult } from '../../contrat'

/** Périmètres possibles d'un mouvement relativement au territoire observé. */
export type SensDuMouvement = 'entrant' | 'sortant' | 'interne'

/** Sens d'un mouvement vu depuis un territoire donné. */
export function sensDuMouvement(a: ProposedAssignment, schoolIds: Set<string>): SensDuMouvement | null {
  const dedans = schoolIds.has(a.schoolDestinationId)
  const depuis = schoolIds.has(a.schoolOrigineId)
  if (dedans && depuis) return 'interne'
  if (dedans) return 'entrant'
  if (depuis) return 'sortant'
  return null
}

/** Regroupement d'un ensemble de mouvements par territoire, du plus fin au plus large. */
export interface GroupeTerritorial {
  libelle: string
  nombre: number
}

function grouper(assignments: ProposedAssignment[], cle: (a: ProposedAssignment) => string): GroupeTerritorial[] {
  const compteur = new Map<string, number>()
  for (const a of assignments) {
    const libelle = cle(a) || 'Territoire non renseigné'
    compteur.set(libelle, (compteur.get(libelle) ?? 0) + 1)
  }
  return [...compteur.entries()]
    .map(([libelle, nombre]) => ({ libelle, nombre }))
    .sort((a, b) => b.nombre - a.nombre || a.libelle.localeCompare(b.libelle, 'fr'))
}

const libelleOrigine = (a: ProposedAssignment): string =>
  a.departementOrigine ? `${a.departementOrigine} (${a.regionOrigine || 'région non renseignée'})` : a.regionOrigine
const libelleDestination = (a: ProposedAssignment): string =>
  a.departementDestination
    ? `${a.departementDestination} (${a.regionDestination || 'région non renseignée'})`
    : a.regionDestination

/** Bilan des mouvements d'un territoire, dans les deux sens. */
export interface FluxTerritorial {
  /** Postes du territoire (vue destination). */
  besoinInitial: number
  postesCouverts: number
  besoinResiduel: number
  tauxCouverture: number

  /** Enseignants arrivant dans le territoire depuis l'extérieur. */
  enseignantsRecus: number
  /** Enseignants quittant le territoire pour l'extérieur. */
  enseignantsSortants: number
  /** Mouvements dont l'origine et la destination sont dans le territoire. */
  mouvementsInternes: number
  /** Reçus − sortants : positif si le territoire gagne des enseignants. */
  solde: number

  entrants: ProposedAssignment[]
  sortants: ProposedAssignment[]
  internes: ProposedAssignment[]

  /** D'où viennent les enseignants reçus. */
  originesExterieures: GroupeTerritorial[]
  /** Où vont les enseignants qui partent. */
  destinationsExterieures: GroupeTerritorial[]

  /** Écoles du territoire qui fournissent des enseignants, et leur nombre de départs. */
  ecolesSources: { schoolId: string; nomEtab: string; departs: number }[]
  /** `true` si aucun mouvement ne franchit la frontière du territoire. */
  autonome: boolean
}

/**
 * Calcule le bilan complet des mouvements d'un territoire, à partir du résultat
 * national et de l'ensemble des établissements qui le composent.
 */
export function calculerFlux(resultat: SimulationResult, schoolIds: Set<string>): FluxTerritorial {
  const entrants: ProposedAssignment[] = []
  const sortants: ProposedAssignment[] = []
  const internes: ProposedAssignment[] = []

  for (const a of resultat.assignments) {
    const sens = sensDuMouvement(a, schoolIds)
    if (sens === 'entrant') entrants.push(a)
    else if (sens === 'sortant') sortants.push(a)
    else if (sens === 'interne') internes.push(a)
  }

  const postesCouverts = entrants.length + internes.length
  const besoinResiduel = resultat.uncoveredPosts.filter(p => schoolIds.has(p.schoolId)).length
  const besoinInitial = postesCouverts + besoinResiduel

  const departsParEcole = new Map<string, { nomEtab: string; departs: number }>()
  for (const a of [...sortants, ...internes]) {
    const courant = departsParEcole.get(a.schoolOrigineId)
    if (courant) courant.departs++
    else departsParEcole.set(a.schoolOrigineId, { nomEtab: a.nomEtabOrigine, departs: 1 })
  }

  return {
    besoinInitial,
    postesCouverts,
    besoinResiduel,
    tauxCouverture: besoinInitial > 0 ? postesCouverts / besoinInitial : 0,

    enseignantsRecus: entrants.length,
    enseignantsSortants: sortants.length,
    mouvementsInternes: internes.length,
    solde: entrants.length - sortants.length,

    entrants,
    sortants,
    internes,

    originesExterieures: grouper(entrants, libelleOrigine),
    destinationsExterieures: grouper(sortants, libelleDestination),

    ecolesSources: [...departsParEcole.entries()]
      .map(([schoolId, v]) => ({ schoolId, nomEtab: v.nomEtab, departs: v.departs }))
      .sort((a, b) => b.departs - a.departs),
    autonome: entrants.length === 0 && sortants.length === 0,
  }
}

/**
 * Vue **destination** : le résultat tel qu'il se lit pour les établissements du
 * périmètre qui reçoivent des enseignants. Les totaux restent cohérents entre
 * eux — besoinInitial = postesCouverts + besoinResiduel sur le périmètre — mais
 * cette vue ne dit rien des enseignants qui en sont partis : c'est le rôle de
 * `calculerFlux`.
 */
export function restreindreResultat(resultat: SimulationResult, schoolIds: Set<string>): SimulationResult {
  const assignments = resultat.assignments.filter(a => schoolIds.has(a.schoolDestinationId))
  const uncoveredPosts = resultat.uncoveredPosts.filter(p => schoolIds.has(p.schoolId))
  const besoinInitial = assignments.length + uncoveredPosts.length

  const regionsDuPerimetre = new Set([
    ...assignments.map(a => a.regionDestination),
    ...uncoveredPosts.map(p => p.region),
  ])

  const compteur = new Map<ProximityLevel, number>()
  for (const a of assignments) compteur.set(a.niveauProximite, (compteur.get(a.niveauProximite) ?? 0) + 1)

  const deficitApresParRegion = new Map<string, number>()
  for (const p of uncoveredPosts) {
    const region = p.region || 'Région non renseignée'
    deficitApresParRegion.set(region, (deficitApresParRegion.get(region) ?? 0) + 1)
  }

  const ecolesAvecPostesRestants = new Set(uncoveredPosts.map(p => p.schoolId))
  const ecolesConcernees = new Set([...assignments.map(a => a.schoolDestinationId), ...ecolesAvecPostesRestants])

  return {
    ...resultat,
    besoinInitial,
    postesCouverts: assignments.length,
    besoinResiduel: uncoveredPosts.length,
    enseignantsDeplaces: assignments.length,
    ecolesBeneficiaires: new Set(assignments.map(a => a.schoolDestinationId)).size,
    ecolesSources: new Set(assignments.map(a => a.schoolOrigineId)).size,
    tauxCouverture: besoinInitial > 0 ? assignments.length / besoinInitial : 0,
    mouvementsParPerimetre: (
      ['meme_commune', 'meme_iaeb', 'meme_departement', 'meme_region', 'hors_region'] as ProximityLevel[]
    )
      .map(niveau => ({ niveau, nombre: compteur.get(niveau) ?? 0 }))
      .filter(m => m.nombre > 0),
    assignments,
    uncoveredPosts,
    unmatchedTeachers: resultat.unmatchedTeachers,
    before: {
      ecolesEnDeficit: ecolesConcernees.size,
      postesVacants: besoinInitial,
      deficitTotal: besoinInitial,
      parRegion: resultat.before.parRegion.filter(r => regionsDuPerimetre.has(r.region)),
      pressionMoyenne: resultat.before.pressionMoyenne,
    },
    after: {
      ecolesEnDeficit: ecolesAvecPostesRestants.size,
      postesVacants: uncoveredPosts.length,
      deficitTotal: uncoveredPosts.length,
      parRegion: [...deficitApresParRegion.entries()]
        .map(([region, deficit]) => ({ region, deficit }))
        .sort((a, b) => b.deficit - a.deficit),
      pressionMoyenne: resultat.after.pressionMoyenne,
    },
  }
}

/**
 * Vue **origine** : le même résultat lu depuis les établissements qui fournissent
 * les enseignants. Utile pour répondre à « qu'est-ce que ce territoire cède ? ».
 */
export function resultatParOrigine(resultat: SimulationResult, schoolIds: Set<string>): ProposedAssignment[] {
  return resultat.assignments.filter(a => schoolIds.has(a.schoolOrigineId))
}
