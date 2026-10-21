'use client'

/**
 * Fait du Prince — redéploiements décidés par la DRH, appliqués aux bases avant l'algorithme.
 *
 * Cette page est la seule de l'application où l'utilisateur décide au lieu de
 * simuler. Une décision enregistrée ici n'est pas une proposition : le serveur
 * l'applique aux données, sans aucun contrôle de l'algorithme, puis recalcule
 * les besoins, le vivier et les postes ouverts sur les bases corrigées. La page
 * présente l'effet des décisions (avant / après), permet de prévisualiser un
 * fichier avant de le valider, et donne accès aux bases obtenues.
 */

import { useState } from 'react'

import { useSession } from '@shared/session'
import { Notice } from '@shared/ui/commun'
import { ChargementEnCours } from '@shared/ui/etats'

import { ApplicationAuxBases } from './composants/ApplicationAuxBases'
import { BasesApresPrince } from './composants/BasesApresPrince'
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
        Un fait de Prince redéploie un enseignant à la seule volonté de la DRH : le départ de l’école d’origine et
        l’arrivée dans l’école de destination sont appliqués aux bases avant le calcul des besoins, des excédents et du
        vivier. L’algorithme ne remet jamais cet enseignant en mouvement. Les alertes signalent ce qui mérite d’être
        vérifié (école d’origine sans excédent, changement de sous-système, capacité dépassée, école de destination qui
        passe en excédent) sans bloquer la décision.
      </Notice>
      <Notice tone="info" title="Quatre écoles à ne pas confondre.">
        <strong>École de référence</strong> : celle du fichier importé. <strong>Destination décidée</strong> : celle que
        fixe un fait du Prince (appliquée aux bases à titre de simulation). <strong>Destination projetée</strong> :
        celle que propose l’algorithme dans un scénario. <strong>École effective</strong> : celle où l’enseignant exerce
        réellement ; tant qu’aucun acte n’est mis en œuvre, c’est l’école de référence.
      </Notice>

      {confirmation && (
        <Notice tone="info" title="Enregistré.">
          {confirmation}
        </Notice>
      )}

      <ApplicationAuxBases jeu={jeu} />
      <SaisieFaitPrince jeu={jeu} onEnregistre={setConfirmation} />
      <ImportFaitsPrince jeu={jeu} />
      <ListeFaitsPrince jeu={jeu} onOuvrirEcole={ouvrirEcole} onAnnule={setConfirmation} />
      <BasesApresPrince jeu={jeu} onOuvrirEcole={ouvrirEcole} />
    </div>
  )
}
