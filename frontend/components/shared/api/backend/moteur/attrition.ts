/**
 * Attrition hors retraite : la règle du serveur (`backend/domaine/planification/projection.py`, `taux_attrition` et
 * `arrondi`), appliquée aux hypothèses de planification du jeu. Ces hypothèses sont l'unique source du taux : aucun
 * réglage du moteur n'en porte un second.
 *
 *   taux d'un périmètre = moyenne des taux (unique, de la région ou du sous-système) pondérée par l'effectif ;
 *   départs             = taux × effectif ÷ 100, arrondi à l'entier le plus proche (demi vers le haut).
 */

import type { Hypotheses } from '../../contrat'

/** Les hypothèses d'attrition qui commandent le calcul. */
export type HypotheseAttrition = Pick<
  Hypotheses['attrition'],
  'methode' | 'tauxUnique' | 'parSousSysteme' | 'parRegion'
>

/** Bloc `attrition` des hypothèses, tel que le sert le serveur. */
export interface AttritionDjango {
  methode: HypotheseAttrition['methode']
  taux_unique: number
  par_sous_systeme: HypotheseAttrition['parSousSysteme']
  par_region: HypotheseAttrition['parRegion']
}

export function versAttrition(a: AttritionDjango): HypotheseAttrition {
  return { methode: a.methode, tauxUnique: a.taux_unique, parSousSysteme: a.par_sous_systeme, parRegion: a.par_region }
}

/** Une école du périmètre, avec l'effectif auquel s'applique le taux. */
export interface EffectifEcole {
  region: string
  sousSysteme: string | null
  effectif: number
}

/** Arrondi à l'entier le plus proche, demi vers le haut (celui du serveur, et du rapport DRH). */
export function arrondiDemiHaut(x: number): number {
  return Math.floor(x + 0.5 + 1e-9)
}

/** Comme le serveur : texte sans blancs de bord, en minuscules. */
const normaliser = (t: string): string => t.trim().toLowerCase()

/** Taux annuel d'autres départs d'un ensemble d'écoles, en %. */
export function tauxAttrition(h: HypotheseAttrition, ecoles: readonly EffectifEcole[]): number {
  if (h.methode === 'taux_unique') return h.tauxUnique
  const total = ecoles.reduce((s, e) => s + e.effectif, 0)
  if (total === 0) return h.tauxUnique
  const parRegion = new Map(Object.entries(h.parRegion).map(([k, v]) => [normaliser(k), v]))
  const taux = (e: EffectifEcole): number =>
    (h.methode === 'par_region'
      ? parRegion.get(normaliser(e.region))
      : (h.parSousSysteme as Record<string, number | undefined>)[e.sousSysteme ?? 'non_renseigne']) ?? h.tauxUnique
  return ecoles.reduce((s, e) => s + e.effectif * taux(e), 0) / total
}

/** Départs par attrition d'un ensemble d'écoles sur une année d'effectif `effectif` (somme des écoles par défaut). */
export function departsAttrition(
  h: HypotheseAttrition,
  ecoles: readonly EffectifEcole[],
  effectif = ecoles.reduce((s, e) => s + e.effectif, 0),
): number {
  return arrondiDemiHaut((tauxAttrition(h, ecoles) * effectif) / 100)
}
