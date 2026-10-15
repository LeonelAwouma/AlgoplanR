'use client'

/** État vide des pages qui lisent le résultat d'un scénario, tant qu'aucun n'est affiché. */

import { useSession } from '@shared/session'
import { EmptyState } from '@shared/ui/commun'

/** Invite à calculer ou à afficher un scénario. */
export function SansScenario({ texte }: { texte: string }) {
  const { setPage } = useSession()
  return (
    <EmptyState
      titre="Aucun plan calculé"
      action={{ label: 'Ouvrir les scénarios', onClick: () => setPage('simulations') }}
    >
      {texte}
    </EmptyState>
  )
}
