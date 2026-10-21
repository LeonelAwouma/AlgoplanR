/**
 * Projection N+1 à N+5 : lecture, sans recalcul, des chiffres du serveur.
 *
 * Le serveur fournit pour chaque année l'effectif de début, les départs (retraites, attrition, directeurs déchargés),
 * les recrutements et l'effectif de fin. L'interface ne refait aucun de ces calculs : elle les met en forme, comble
 * l'effectif de fin par l'effectif de début de l'année suivante quand un serveur ou un jeu factice plus ancien ne le
 * donne pas (c'est la même quantité), et signale tout enchaînement rompu.
 */

import type { AnneePlan, IndicateursAnnee } from '../../shared/api'

/** Une année de la projection, telle qu'elle s'affiche. */
export interface LigneProjection {
  annee: AnneePlan
  effectifDebut: number
  departsRetraite: number
  departsAttrition: number
  /** `null` quand le serveur ne le fournit pas. */
  directeursDecharges: number | null
  recrutement: number | null
  /** Effectif en fin d'année ; `null` en dernière année si le serveur ne le fournit pas. */
  effectifFin: number | null
  /** Évolution sur l'année : effectif de fin − effectif de début. */
  variation: number | null
  besoin: number
  quotaCalcule: number
  /** Quota retenu (décision administrative) ; `null` tant qu'il n'est pas fixé. */
  quotaRetenu: number | null
  /** Élèves par enseignant projeté. */
  rem: number | null
  /** Pourquoi `rem` est « non disponible », `null` sinon. */
  remRaison: string | null
  /** Taux d'attrition appliqué (%). */
  tauxAttrition: number | null
}

/** Totaux sur l'horizon de la projection. */
export interface TotauxProjection {
  departsRetraite: number
  departsAttrition: number
  recrutements: number | null
  effectifInitial: number
  effectifFinal: number | null
  variation: number | null
}

/** Années du tableau mises en forme pour l'onglet « Projection N+1 à N+5 ». */
export function construireProjection(annees: readonly IndicateursAnnee[]): LigneProjection[] {
  return annees.map((a, i) => {
    const effectifFin = a.effectifFin ?? annees[i + 1]?.effectifDebut ?? null
    return {
      annee: a.annee,
      effectifDebut: a.effectifDebut,
      departsRetraite: a.departsRetraite,
      departsAttrition: a.departsAttrition,
      directeursDecharges: a.directeursDecharges ?? null,
      recrutement: a.recrutement ?? null,
      effectifFin,
      variation: effectifFin === null ? null : effectifFin - a.effectifDebut,
      besoin: a.besoin,
      quotaCalcule: a.quotaCalcule,
      quotaRetenu: a.quotaRetenu,
      rem: a.rem ?? null,
      remRaison: a.remRaison ?? null,
      tauxAttrition: a.tauxAttrition ?? null,
    }
  })
}

/** Totaux de l'horizon ; les recrutements ne sont totalisés que si le serveur les donne pour toutes les années. */
export function totauxProjection(lignes: readonly LigneProjection[]): TotauxProjection | null {
  if (lignes.length === 0) return null
  const somme = (cle: 'departsRetraite' | 'departsAttrition') => lignes.reduce((s, l) => s + l[cle], 0)
  const recrutements = lignes.every(l => l.recrutement !== null)
    ? lignes.reduce((s, l) => s + (l.recrutement ?? 0), 0)
    : null
  const effectifFinal = lignes[lignes.length - 1].effectifFin
  return {
    departsRetraite: somme('departsRetraite'),
    departsAttrition: somme('departsAttrition'),
    recrutements,
    effectifInitial: lignes[0].effectifDebut,
    effectifFinal,
    variation: effectifFinal === null ? null : effectifFinal - lignes[0].effectifDebut,
  }
}

/** Années dont l'effectif de fin n'est pas celui de début de l'année suivante : l'enchaînement est rompu. */
export function rupturesDeChainage(lignes: readonly LigneProjection[]): AnneePlan[] {
  return lignes
    .slice(0, -1)
    .filter((l, i) => l.effectifFin !== null && l.effectifFin !== lignes[i + 1].effectifDebut)
    .map(l => l.annee)
}

/** Taux d'attrition unique appliqué sur tout l'horizon, `null` s'il varie ou n'est pas fourni. */
export function tauxAttritionApplique(lignes: readonly LigneProjection[]): number | null {
  const taux = new Set(lignes.map(l => l.tauxAttrition))
  const [seul] = [...taux]
  return taux.size === 1 && seul !== null && seul !== undefined ? seul : null
}
