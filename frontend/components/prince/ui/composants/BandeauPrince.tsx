'use client'

/**
 * Rappel placé sur les écrans qui lisent les bases : quand des faits du Prince sont appliqués, leurs chiffres
 * (effectifs, besoins, excédents) sont ceux des bases après Prince, et la page « Fait de Prince » détaille ce qui a
 * changé. Rien n'est affiché sans fait appliqué, ni pour un délégué régional.
 */

import { useUtilisateur } from '@components/acces'
import { useSession } from '@shared/session'
import { Notice, fmt } from '@shared/ui/commun'

import { useApplicationPrince } from '../../application/hooks'

export function BandeauPrince() {
  const { jeu, setPage } = useSession()
  const estDrh = useUtilisateur()?.role === 'drh'
  const application = useApplicationPrince(estDrh ? jeu : null)
  const appliquees = application.data?.resume.appliquees ?? 0
  if (appliquees === 0) return null

  return (
    <Notice tone="info" title="Bases après les faits du Prince.">
      {fmt(appliquees)} décision(s) du Prince sont appliquées : les effectifs, besoins et excédents affichés sont ceux
      des bases recalculées.{' '}
      <button type="button" className="btn-link" onClick={() => setPage('prince')}>
        Voir ce qui a changé
      </button>
    </Notice>
  )
}
