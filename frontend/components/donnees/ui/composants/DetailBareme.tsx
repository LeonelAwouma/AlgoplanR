'use client'

/**
 * Détail du barème individuel d'un enseignant, composante par composante, tel
 * que le serveur l'a calculé.
 */

import type { IdJeu } from '@shared/api'
import { Panel, fmtDec } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

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

  const { teacher, detailBareme, bareme } = fiche.data
  return (
    <Panel
      kicker="Barème individuel"
      title={`Comment le barème de ${teacher.nom} ${teacher.prenom} est calculé`}
      hint="Ce barème classe les enseignants d’une même école : il détermine lesquels partiraient en premier."
      actions={fermer}
    >
      <table className="compare-table">
        <thead>
          <tr>
            <th>Critère</th>
            <th className="num">Valeur</th>
            <th className="num">Poids</th>
            <th className="num">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {detailBareme.components.map(c => (
            <tr key={c.label}>
              <th scope="row" className="th-normal">
                {c.label}
              </th>
              <td className="num">{c.valeur.toLocaleString('fr-FR')}</td>
              <td className="num">{c.poids}</td>
              <td className="num">{c.contribution.toLocaleString('fr-FR')}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Barème total</th>
            <td className="num" colSpan={3}>
              <strong>{fmtDec(bareme, 2)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="hint">Les poids de chaque critère se règlent dans « Configuration du moteur » (Vue analyste).</p>
    </Panel>
  )
}
