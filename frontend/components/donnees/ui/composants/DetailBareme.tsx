'use client'

/**
 * Détail du barème individuel d'un enseignant, composante par composante, tel
 * que le serveur l'a calculé.
 */

import type { IdJeu } from '@shared/api'
import { Panel } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { TableauCalcul } from '@shared/ui/TableauCalcul'

import { useEnseignant } from '../../application/hooks'

export interface ProprietesDetailBareme {
  jeu: IdJeu
  matricule: string
  onFermer: () => void
}

/** Panneau « Comment le barème est calculé ». */
export function DetailBareme({ jeu, matricule, onFermer }: ProprietesDetailBareme) {
  const fiche = useEnseignant(jeu, matricule)

  const fermer = (
    <button type="button" className="btn btn-sm" onClick={onFermer}>
      Fermer
    </button>
  )

  if (!fiche.data) {
    return (
      <Panel kicker="Barème individuel" title="Détail du barème" actions={fermer}>
        <EtatRequetes requetes={[fiche]} />
      </Panel>
    )
  }

  const { teacher, detailBareme } = fiche.data
  return (
    <Panel
      kicker="Barème individuel"
      title={`Comment le barème de ${teacher.nom} ${teacher.prenom} est calculé`}
      hint="Ce barème classe les enseignants d’une même école : il détermine lesquels partiraient en premier."
      actions={fermer}
    >
      <TableauCalcul
        breakdown={detailBareme}
        enteteComposante="Critère"
        libelleTotal="Barème total (C1 + C2 + C3 + C4 + C5)"
        legende="Calcul du barème individuel"
      />
      <p className="hint">Les poids de chaque critère se règlent dans « Configuration du moteur » (Vue analyste).</p>
    </Panel>
  )
}
