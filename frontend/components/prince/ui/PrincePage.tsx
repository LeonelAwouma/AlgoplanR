'use client'

/**
 * Fait du Prince — redéploiements décidés par la DRH.
 *
 * Cette page est la seule de l'application où l'utilisateur décide au lieu de
 * simuler. Une décision enregistrée ici n'est pas une proposition : le serveur
 * l'applique aux données, sans aucun contrôle de l'algorithme. L'impact
 * prévisible est montré avant validation, à titre d'information ; il
 * n'empêche jamais la décision. Une fois enregistrée, la décision devient un
 * fait acquis : le serveur recalcule le diagnostic et toutes les simulations.
 */

import { useState } from 'react'

import { useSession } from '@shared/session'
import { Notice } from '@shared/ui/commun'
import { ChargementEnCours } from '@shared/ui/etats'

import { ImportFaitsPrince } from './composants/ImportFaitsPrince'
import { ListeFaitsPrince } from './composants/ListeFaitsPrince'
import { SaisieFaitPrince } from './composants/SaisieFaitPrince'

/** Page « Fait de Prince ». */
export function PrincePage() {
  const { jeu, ouvrirEcole } = useSession()
  const [confirmation, setConfirmation] = useState<string | null>(null)

  if (!jeu) return <ChargementEnCours />

  return (
    <div className="stack">
      <Notice tone="warn" title="Décision, et non simulation.">
        Un fait de Prince redéploie un enseignant à la seule volonté de la DRH : ni l’ancienneté, ni l’âge, ni le
        statut, ni l’excédent de l’école d’origine, ni le besoin de l’école de destination ne sont contrôlés. Une fois
        enregistré, il devient une donnée de départ : le diagnostic et toutes les simulations le prennent en compte, et
        l’algorithme ne remet jamais cet enseignant en mouvement.
      </Notice>

      {confirmation && (
        <Notice tone="info" title="Enregistré.">
          {confirmation}
        </Notice>
      )}

      <SaisieFaitPrince jeu={jeu} onEnregistre={setConfirmation} />
      <ImportFaitsPrince jeu={jeu} />
      <ListeFaitsPrince jeu={jeu} onOuvrirEcole={ouvrirEcole} onAnnule={setConfirmation} />
    </div>
  )
}
