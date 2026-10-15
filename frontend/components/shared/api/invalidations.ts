/**
 * Ce qu'une écriture rend obsolète.
 *
 * Le backend recalcule lui-même diagnostic, scénarios et planification après
 * chaque décision (plan de migration, « Règles de recalcul »). Le frontend doit
 * seulement oublier les réponses mises en cache qui ne sont plus vraies. Cette
 * table centralise la règle, pour qu'aucun écran n'affiche un chiffre périmé
 * après une décision prise sur un autre écran.
 *
 * Toute écriture ajoute un événement au journal d'audit : la famille `audit`
 * est donc invalidée dans tous les cas.
 */

import type { QueryClient } from '@tanstack/react-query'
import { clesGlobales, cleJeu, prefixeFamille, type FamilleDonnees } from './cles'
import type { IdJeu } from './contrat/commun'

/** Nature d'une écriture, du point de vue de ses effets. */
export type NatureEcriture =
  /** Import, actualisation, validation du jeu : tout le jeu est concerné. */
  | 'donnees'
  /** Règles du moteur. */
  | 'parametres'
  /** Hypothèses de la planification. */
  | 'hypotheses'
  /** Décision qui change les effectifs : fait du Prince, arbitrage, recrues, nomination validée ou mise en œuvre, mouvement réalisé. */
  | 'effectifs'
  /** Création, relance ou suppression d'un scénario. */
  | 'scenarios'
  /** Choix du scénario retenu pour la planification. */
  | 'scenario-retenu'
  /** Ajustement ou validation d'un quota. */
  | 'quotas'
  /** Nomination proposée, rejetée ou annulée : sans effet sur les effectifs. */
  | 'nominations'
  /** Recalcul manuel de la planification. */
  | 'recalcul'

/** Familles liées au diagnostic, qui dépendent des effectifs et des règles. */
const DIAGNOSTIC: FamilleDonnees[] = [
  'diagnostic',
  'territoires',
  'priorites',
  'synthese',
  'etablissements',
  'enseignants',
]

/** Familles liées à la planification sur cinq ans. */
const PLANIFICATION: FamilleDonnees[] = ['planification', 'quotas', 'indicateurs']

/** Familles liées au vivier et aux nominations. */
const NOMINATIONS: FamilleDonnees[] = ['vivier', 'postes-ouverts', 'nominations', 'mouvements']

/** Familles invalidées par nature d'écriture ; `tout` vide le cache du jeu entier. */
const FAMILLES_INVALIDEES: Record<NatureEcriture, readonly FamilleDonnees[] | 'tout'> = {
  donnees: 'tout',
  parametres: ['meta', 'parametres', ...DIAGNOSTIC, 'scenarios', 'comparaison', 'rapport', ...PLANIFICATION],
  hypotheses: ['hypotheses', ...PLANIFICATION, 'vivier', 'rapport'],
  effectifs: [
    'meta',
    'faits-prince',
    'arbitrages',
    'recrues',
    ...DIAGNOSTIC,
    'scenarios',
    'comparaison',
    'rapport',
    ...PLANIFICATION,
    ...NOMINATIONS,
  ],
  scenarios: ['scenarios', 'comparaison', 'rapport'],
  'scenario-retenu': ['meta', ...PLANIFICATION, ...NOMINATIONS, 'rapport'],
  quotas: PLANIFICATION,
  nominations: ['vivier', 'postes-ouverts', 'nominations', 'indicateurs'],
  recalcul: [...PLANIFICATION],
}

/** Familles que rend obsolètes une écriture de cette nature (journal d'audit compris). */
export function famillesInvalidees(nature: NatureEcriture): readonly FamilleDonnees[] | 'tout' {
  const familles = FAMILLES_INVALIDEES[nature]
  return familles === 'tout' ? 'tout' : [...new Set<FamilleDonnees>([...familles, 'audit'])]
}

/**
 * Oublie les réponses rendues obsolètes par une écriture sur un jeu. Les
 * requêtes affichées sont relancées aussitôt par TanStack Query.
 */
export async function invaliderApres(client: QueryClient, jeu: IdJeu, nature: NatureEcriture): Promise<void> {
  const familles = famillesInvalidees(nature)
  if (familles === 'tout') {
    await Promise.all([
      client.invalidateQueries({ queryKey: cleJeu(jeu) }),
      client.invalidateQueries({ queryKey: clesGlobales.jeux() }),
    ])
    return
  }
  await Promise.all(familles.map(famille => client.invalidateQueries({ queryKey: prefixeFamille(jeu, famille) })))
}
