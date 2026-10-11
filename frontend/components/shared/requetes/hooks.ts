'use client'

/**
 * Hooks génériques de lecture et d'écriture sur un jeu de données.
 *
 * Les hooks des contextes (`components/<module>/application`) s'appuient sur
 * ces deux briques, qui fixent une fois pour toutes :
 *   - la clé de cache (`['jeu', id, famille, …détails]`) ;
 *   - l'absence de requête tant qu'aucun jeu n'est chargé ;
 *   - l'invalidation de ce qu'une écriture rend obsolète.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'

import { cle, invaliderApres, type FamilleDonnees, type IdJeu, type NatureEcriture } from '../api'

/** Options d'une lecture. */
export interface OptionsLecture {
  /** `false` pour suspendre la requête (onglet masqué, sélection incomplète…). */
  active?: boolean
}

/**
 * Lit une donnée d'un jeu. Tant que `jeu` est `null`, rien n'est demandé au
 * serveur et la requête reste en attente.
 *
 * @param details paramètres qui distinguent la requête dans sa famille ; ils
 *   entrent dans la clé de cache et doivent donc être sérialisables.
 * @param lire fonction d'infrastructure ; reçoit le signal d'annulation.
 */
export function useLectureJeu<T>(
  jeu: IdJeu | null,
  famille: FamilleDonnees,
  details: readonly unknown[],
  lire: (jeu: IdJeu, signal: AbortSignal) => Promise<T>,
  options: OptionsLecture = {},
): UseQueryResult<T> {
  return useQuery({
    queryKey: cle(jeu ?? '', famille, ...details),
    queryFn: ({ signal }) => {
      // Garde de typage : la requête est désactivée tant qu'aucun jeu n'est chargé.
      if (jeu === null) throw new Error('Aucun jeu de données chargé.')
      return lire(jeu, signal)
    },
    enabled: jeu !== null && (options.active ?? true),
  })
}

/**
 * Écrit sur un jeu, puis invalide ce que l'écriture rend obsolète.
 *
 * @param nature effet de l'écriture, qui détermine les familles invalidées
 *   (voir `shared/api/invalidations.ts`).
 * @param ecrire fonction d'infrastructure, appelée avec le jeu et les arguments de `mutate`.
 */
export function useEcritureJeu<Arguments, Resultat>(
  jeu: IdJeu | null,
  nature: NatureEcriture,
  ecrire: (jeu: IdJeu, args: Arguments) => Promise<Resultat>,
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (args: Arguments) => {
      if (jeu === null) return Promise.reject(new Error('Aucun jeu de données chargé.'))
      return ecrire(jeu, args)
    },
    onSuccess: async () => {
      if (jeu !== null) await invaliderApres(client, jeu, nature)
    },
  })
}
