/**
 * Édition des hypothèses de la planification : libellés des choix et
 * transformations pures du brouillon.
 */

import type { CorpsHypotheses, Hypotheses, MethodeAttrition } from '../../shared/api'

/** Hypothèses en cours de saisie : tout sauf la version et la signature, ajoutées à l'envoi. */
export type BrouillonHypotheses = Omit<Hypotheses, 'version' | 'modifieesLe' | 'modifieesPar'>

/** Copie modifiable des hypothèses en vigueur. */
export function brouillonDepuis(hypotheses: Hypotheses): BrouillonHypotheses {
  const { version: _version, modifieesLe: _le, modifieesPar: _par, ...reste } = hypotheses
  return structuredClone(reste)
}

/** Corps de la requête de modification. */
export function corpsHypotheses(brouillon: BrouillonHypotheses, motif: string, auteur: string): CorpsHypotheses {
  return { ...brouillon, motif: motif.trim(), auteur: auteur.trim() }
}

export const LIBELLE_METHODE_ATTRITION: Record<MethodeAttrition, string> = {
  taux_unique: 'Un taux unique pour tout le territoire',
  par_sous_systeme: 'Un taux par sous-système',
  par_region: 'Un taux par région',
}

/**
 * Nature du taux d'attrition appliqué, selon la méthode : jamais présenté comme un taux observé. Seule
 * l'estimation à partir des données du jeu (bouton « Estimer ») est une valeur observée, et elle n'est pas enregistrée.
 */
export const STATUT_TAUX_ATTRITION: Record<MethodeAttrition, string> = {
  taux_unique: 'Hypothèse nationale',
  par_sous_systeme: 'Hypothèse par sous-système',
  par_region: 'Hypothèse régionale dérivée (attrition totale de la région − 1,08 % de retraites)',
}
