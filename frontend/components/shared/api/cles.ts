/**
 * Clés de cache des requêtes (TanStack Query).
 *
 * Toutes les données d'un jeu sont rangées sous `['jeu', idJeu, famille, …détails]`.
 * Ce découpage par famille permet d'invalider d'un coup tout ce qu'une décision
 * rend obsolète (voir `invalidations.ts`), sans connaître le détail des
 * requêtes affichées.
 */

import type { IdJeu } from './contrat/commun'

/** Familles de données d'un jeu, une par ressource de l'API. */
export const FAMILLES_DONNEES = [
  'meta',
  'qualite',
  'validation',
  'actualisations',
  'etablissements',
  'enseignants',
  'recherche',
  'parametres',
  'situations',
  'diagnostic',
  'territoires',
  'priorites',
  'synthese',
  'faits-prince',
  'scenarios',
  'comparaison',
  'arbitrages',
  'recrues',
  'rapport',
  'hypotheses',
  'planification',
  'quotas',
  'indicateurs',
  'vivier',
  'postes-ouverts',
  'nominations',
  'mouvements',
  'audit',
] as const

export type FamilleDonnees = (typeof FAMILLES_DONNEES)[number]

/** Clés des données qui ne dépendent d'aucun jeu. */
export const clesGlobales = {
  sante: () => ['sante'] as const,
  jeux: () => ['jeux'] as const,
  parametresDefaut: () => ['parametres-defaut'] as const,
  hypothesesDefaut: () => ['hypotheses-defaut'] as const,
  presets: (jeu: IdJeu | null) => ['presets', jeu] as const,
}

/** Préfixe de toutes les données d'un jeu. */
export function cleJeu(jeu: IdJeu): readonly ['jeu', IdJeu] {
  return ['jeu', jeu]
}

/**
 * Clé d'une requête d'un jeu.
 *
 * @param details paramètres qui distinguent la requête dans sa famille
 *   (filtres, identifiant, page…). Ils doivent être sérialisables.
 */
export function cle(jeu: IdJeu, famille: FamilleDonnees, ...details: unknown[]): readonly unknown[] {
  return ['jeu', jeu, famille, ...details]
}

/** Préfixe d'une famille, pour l'invalider entièrement. */
export function prefixeFamille(jeu: IdJeu, famille: FamilleDonnees): readonly unknown[] {
  return ['jeu', jeu, famille]
}
