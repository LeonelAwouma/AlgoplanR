'use client'

/**
 * Cache des requêtes de l'application (TanStack Query).
 *
 * Réglages adaptés à une application de bureau qui parle à un serveur local :
 *   - pas de rechargement au retour sur la fenêtre : les données ne changent que
 *     par les actions de l'utilisateur, qui invalident elles-mêmes le cache ;
 *   - pas de nouvelle tentative sur un refus du serveur (4xx) : la réponse ne
 *     changera pas ; deux tentatives seulement sur une panne ou un serveur injoignable.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { ApiError } from '../api'

/** Nombre maximal de nouvelles tentatives d'une lecture. */
const TENTATIVES_MAX = 2

/** Une erreur 4xx est une réponse définitive du serveur : inutile de réessayer. */
function reessayer(tentatives: number, erreur: unknown): boolean {
  if (erreur instanceof ApiError && erreur.statut >= 400 && erreur.statut < 500) return false
  return tentatives < TENTATIVES_MAX
}

/** Crée le client de cache avec les réglages de l'application. */
export function creerClientRequetes(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: reessayer,
        refetchOnWindowFocus: false,
        // Une réponse reste valable 30 s ; au-delà, elle est relue en arrière-plan à la prochaine utilisation.
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  })
}

/** Fournit le cache des requêtes à toute l'application. */
export function FournisseurRequetes({ children }: { children: ReactNode }) {
  // Un client par montage : jamais partagé entre deux rendus serveur (export statique).
  const [client] = useState(creerClientRequetes)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
