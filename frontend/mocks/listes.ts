/**
 * Listes paginées des données factices : filtres simples, recherche libre et
 * pagination, appliqués à une liste complète enregistrée par le générateur.
 *
 * Ce ne sont pas des calculs métier : seulement la sélection et le découpage
 * que le serveur réel fera en base de données.
 */

import type {
  Candidature,
  EnseignantResume,
  LignePlanificationEcole,
  Mouvement,
  Nomination,
  Page,
  PersonneVivier,
  PosteOuvert,
  ProposedAssignment,
  SchoolDiagnostic,
  TeachingPost,
} from '../components/shared/api'

/** Filtre d'un paramètre : vrai si l'élément convient à l'une des valeurs demandées. */
type Filtre<T> = (element: T, valeurs: string[]) => boolean
type Filtres<T> = Record<string, Filtre<T>>

/** Paramètres de pagination, toujours pris en compte. */
const PAGINATION = ['page', 'taille']

const egal =
  <T>(champ: (e: T) => string | null | undefined): Filtre<T> =>
  (e, v) =>
    v.includes(champ(e) ?? '')
const booleen =
  <T>(champ: (e: T) => boolean): Filtre<T> =>
  (e, v) =>
    champ(e) === (v[0] === 'true')

const ETABLISSEMENTS: Filtres<SchoolDiagnostic> = {
  region: egal(d => d.school.region),
  departement: egal(d => d.school.departement),
  commune: egal(d => d.school.commune),
  zone: egal(d => d.school.zone),
  zoneSecurite: egal(d => d.school.zoneSecurite ?? 'verte'),
  typeEtab: egal(d => d.school.typeEtab),
  severite: egal(d => d.severite),
  multigrades: booleen(d => d.school.classesMultigrades > 0),
}

const ENSEIGNANTS: Filtres<EnseignantResume> = {
  region: egal(l => l.teacher.regionAttache),
  departement: egal(l => l.teacher.departementAttache),
  commune: egal(l => l.teacher.communeAttache),
  ecole: egal(l => l.teacher.idEtabAttache),
  mobilisable: booleen(l => l.mobilisable),
}

const AFFECTATIONS: Filtres<ProposedAssignment> = {
  region: (a, v) => v.includes(a.regionOrigine) || v.includes(a.regionDestination),
  departement: (a, v) => v.includes(a.departementOrigine) || v.includes(a.departementDestination),
  commune: (a, v) => v.includes(a.communeOrigine) || v.includes(a.communeDestination),
  nature: egal(a => a.nature),
  ecole: (a, v) => v.includes(a.schoolOrigineId) || v.includes(a.schoolDestinationId),
}

const POSTES: Filtres<TeachingPost> = { pourvu: booleen(p => p.pourvu), ecole: egal(p => p.schoolId) }
const CANDIDATURES: Filtres<Candidature> = { issue: egal(c => c.issue) }

const ECOLES_PLANIFICATION: Filtres<LignePlanificationEcole> = {
  region: egal(l => l.region),
  departement: egal(l => l.departement),
  commune: egal(l => l.commune),
  sousSysteme: egal(l => l.sousSysteme),
}

export const VIVIER: Filtres<PersonneVivier> = {
  source: egal(p => p.source),
  disponibilite: egal(p => p.disponibilite),
  sousSysteme: egal(p => p.sousSysteme),
  region: egal(p => p.region),
  departement: egal(p => p.departement),
}

export const POSTES_OUVERTS: Filtres<PosteOuvert> = {
  statut: egal(p => p.statut),
  region: egal(p => p.region),
  departement: egal(p => p.departement),
}

export const NOMINATIONS: Filtres<Nomination> = {
  statut: egal(n => n.statut),
  annee: egal(n => n.annee),
  source: egal(n => n.personne.source),
  region: egal(n => n.poste.region),
  departement: egal(n => n.poste.departement),
}

export const MOUVEMENTS: Filtres<Mouvement> = {
  type: egal(m => m.type),
  statut: egal(m => m.statut),
  annee: egal(m => m.annee),
  region: egal(m => m.destination.region),
}

/** Filtres des listes du catalogue, reconnus d'après la fin de leur chemin. */
const REGLES: [RegExp, Filtres<never>][] = [
  [/\/etablissements\/$/, ETABLISSEMENTS],
  [/\/enseignants\/$/, ENSEIGNANTS],
  [/\/affectations\/$/, AFFECTATIONS],
  [/\/postes\/$/, POSTES],
  [/\/candidatures\/$/, CANDIDATURES],
  [/\/planification\/ecoles\/$/, ECOLES_PLANIFICATION],
]

/** Filtres applicables à une liste du catalogue. */
export function filtresDe(chemin: string): Filtres<unknown> {
  return (REGLES.find(([motif]) => motif.test(chemin))?.[1] ?? {}) as Filtres<unknown>
}

/** Texte d'un élément pour la recherche libre : toutes ses valeurs textuelles, sans accents ni casse. */
function texteDe(valeur: unknown, morceaux: string[] = []): string[] {
  if (typeof valeur === 'string' || typeof valeur === 'number') morceaux.push(String(valeur))
  else if (Array.isArray(valeur)) valeur.forEach(v => texteDe(v, morceaux))
  else if (valeur && typeof valeur === 'object') Object.values(valeur).forEach(v => texteDe(v, morceaux))
  return morceaux
}

export function sansAccents(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Vrai si l'élément contient la saisie, dans l'une de ses valeurs. */
export function correspond(element: unknown, saisie: string): boolean {
  const cherche = sansAccents(saisie.trim())
  return cherche === '' || sansAccents(texteDe(element).join(' ')).includes(cherche)
}

/** Résultat d'une liste traitée, avec les paramètres de la requête utilisés. */
export interface ListeTraitee<T> {
  page: Page<T>
  utilises: Set<string>
}

/**
 * Applique filtres, recherche libre (`q`) et pagination à une liste complète.
 *
 * @param dejaUtilises  paramètres déjà pris en compte par le choix de la liste
 */
export function traiterListe<T>(
  elements: T[],
  parametres: URLSearchParams,
  filtres: Filtres<T>,
  dejaUtilises: Set<string> = new Set(),
): ListeTraitee<T> {
  const utilises = new Set([...dejaUtilises, ...PAGINATION])
  let retenus = elements
  for (const [cle, filtre] of Object.entries(filtres)) {
    if (dejaUtilises.has(cle)) continue
    const demandees = parametres.getAll(cle)
    if (demandees.length === 0) continue
    retenus = retenus.filter(e => filtre(e, demandees))
    utilises.add(cle)
  }
  const saisie = parametres.get('q')
  if (saisie !== null) {
    retenus = retenus.filter(e => correspond(e, saisie))
    utilises.add('q')
  }

  const page = Math.max(1, Number(parametres.get('page') ?? 1))
  const taille = Math.max(0, Number(parametres.get('taille') ?? 50))
  const debut = taille === 0 ? 0 : (page - 1) * taille
  return {
    utilises,
    page: {
      elements: taille === 0 ? retenus : retenus.slice(debut, debut + taille),
      total: retenus.length,
      page,
      taille: taille === 0 ? retenus.length : taille,
    },
  }
}

/** Vrai si un paramètre de la requête n'a pas été pris en compte. */
export function estApproximation(parametres: URLSearchParams, utilises: Set<string>): boolean {
  return [...parametres.keys()].some(cle => !utilises.has(cle))
}
