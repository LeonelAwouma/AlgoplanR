'use client'

/** Détail d'une nomination et historique de ses changements de statut. */

import { X } from 'lucide-react'

import type { IdJeu } from '@shared/api'
import { LIBELLE_STATUT_NOMINATION } from '@shared/kernel'
import { Panel } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useNomination } from '../../application/hooks'

export interface ProprietesDetailNomination {
  jeu: IdJeu
  nomination: string
  onFermer: () => void
}

/** Panneau « Historique de la nomination ». */
export function DetailNomination({ jeu, nomination, onFermer }: ProprietesDetailNomination) {
  const detail = useNomination(jeu, nomination)
  const fermer = (
    <button type="button" className="btn btn-sm" onClick={onFermer}>
      <X size={13} aria-hidden="true" /> Fermer
    </button>
  )

  if (!detail.data) {
    return (
      <Panel kicker="Nomination" title="Historique" actions={fermer}>
        <EtatRequetes requetes={[detail]} />
      </Panel>
    )
  }

  const n = detail.data
  return (
    <Panel
      kicker={`Nomination ${n.annee}`}
      title={`${n.personne.nom} ${n.personne.prenom} → ${n.poste.nomEtab}`.trim()}
      hint={`Créée le ${new Date(n.creeeLe).toLocaleString('fr-FR')}${n.motif ? ` — motif : ${n.motif}` : ''}${n.referenceActe ? ` — acte : ${n.referenceActe}` : ''}${n.dateEffet ? `, effet au ${new Date(n.dateEffet).toLocaleDateString('fr-FR')}` : ''}.`}
      actions={fermer}
    >
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Statut</th>
            <th scope="col">Par</th>
            <th scope="col">Motif ou référence</th>
          </tr>
        </thead>
        <tbody>
          {n.historique.map((t, i) => (
            <tr key={`${t.le}-${i}`}>
              <th scope="row">{new Date(t.le).toLocaleString('fr-FR')}</th>
              <td>
                {t.de ? `${LIBELLE_STATUT_NOMINATION[t.de]} → ` : ''}
                {LIBELLE_STATUT_NOMINATION[t.vers]}
              </td>
              <td>{t.auteur ?? '—'}</td>
              <td>{t.motif ?? t.reference ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
