'use client'

/**
 * Validation et actualisation des données de référence — étape 1 de la chaîne
 * de traitement (mémo de synthèse, §3) : le jeu est validé comme référence des
 * projections, puis actualisé au fil de l'exercice.
 */

import { useSession } from '@shared/session'
import { ChargementEnCours } from '@shared/ui/etats'

import { ActualisationDonnees } from './composants/ActualisationDonnees'
import { HistoriqueActualisations } from './composants/HistoriqueActualisations'
import { StatutValidation } from './composants/StatutValidation'

/** Page « Validation et actualisation ». */
export function ValidationPage() {
  const { jeu } = useSession()
  if (!jeu) return <ChargementEnCours />

  return (
    <div className="stack">
      <StatutValidation jeu={jeu} />
      <ActualisationDonnees jeu={jeu} />
      <HistoriqueActualisations jeu={jeu} />
    </div>
  )
}
