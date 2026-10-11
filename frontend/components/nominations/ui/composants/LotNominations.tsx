'use client'

/** Validation ou rejet en lot des nominations cochées, avec le bilan des refus. */

import { useState } from 'react'

import type { IdJeu } from '@shared/api'
import { Notice, Panel, fmt } from '@shared/ui/commun'
import { ChampAuteur, useAuteur } from '@shared/ui/ChampAuteur'
import { ErreurAction } from '@shared/ui/etats'

import { useTraiterNominationsEnLot } from '../../application/hooks'

export interface ProprietesLotNominations {
  jeu: IdJeu
  cochees: Set<string>
  onTraite: () => void
}

/** Barre de traitement en lot ; absente tant qu'aucune nomination n'est cochée. */
export function LotNominations({ jeu, cochees, onTraite }: ProprietesLotNominations) {
  const lot = useTraiterNominationsEnLot(jeu)
  const [auteur, setAuteur] = useAuteur()
  const [texte, setTexte] = useState('')
  const bilan = lot.data

  if (cochees.size === 0 && !bilan) return null

  const traiter = (action: 'valider' | 'rejeter') =>
    lot.mutate(
      {
        action,
        nominations: [...cochees],
        reference: action === 'valider' ? texte.trim() : undefined,
        motif: action === 'rejeter' ? texte.trim() : undefined,
        auteur: auteur.trim(),
      },
      { onSuccess: onTraite },
    )

  const pret = cochees.size > 0 && auteur.trim() !== '' && texte.trim() !== '' && !lot.isPending

  return (
    <Panel kicker="Traitement en lot" title={`${fmt(cochees.size)} nomination(s) sélectionnée(s)`}>
      <div className="param-grid">
        <div className="field field-recherche">
          <label htmlFor="lot-texte">Référence de la décision (validation) ou motif (rejet)</label>
          <input id="lot-texte" type="text" value={texte} onChange={e => setTexte(e.target.value)} />
        </div>
        <ChampAuteur auteur={auteur} onChange={setAuteur} />
      </div>
      <ErreurAction erreur={lot.error} />
      {bilan && (
        <Notice
          tone={bilan.refus.length > 0 ? 'warn' : 'info'}
          title={`${fmt(bilan.traitees)} nomination(s) traitée(s).`}
        >
          {bilan.refus.map(r => `${r.nomination} : ${r.motif}`).join(' ; ')}
        </Notice>
      )}
      <div className="topbar-actions actions-formulaire">
        <button type="button" className="btn btn-primary" disabled={!pret} onClick={() => traiter('valider')}>
          Valider la sélection
        </button>
        <button type="button" className="btn btn-danger" disabled={!pret} onClick={() => traiter('rejeter')}>
          Rejeter la sélection
        </button>
      </div>
    </Panel>
  )
}
