'use client'

/**
 * Proposition manuelle d'une personne du vivier sur un poste ouvert. Le
 * serveur refuse une personne déjà nommée ou un poste déjà réservé (409) et
 * toute affectation contraire aux règles (sous-système, zone rouge : 422).
 */

import { useState } from 'react'
import { UserRoundCheck } from 'lucide-react'

import { ANNEES_PLAN, type AnneePlan, type IdJeu } from '@shared/api'
import { Notice } from '@shared/ui/commun'
import { ChampAuteur, useAuteur } from '@shared/ui/ChampAuteur'
import { ErreurAction } from '@shared/ui/etats'

import { useProposerNomination } from '../../application/hooks'

export interface ProprietesPropositionNomination {
  jeu: IdJeu
  personne: { id: string; nom: string }
  poste: { id: string; nomEtab: string }
  onPropose: () => void
  onAnnuler: () => void
}

/** Formulaire « Proposer une nomination ». */
export function PropositionNomination({ jeu, personne, poste, onPropose, onAnnuler }: ProprietesPropositionNomination) {
  const proposition = useProposerNomination(jeu)
  const [auteur, setAuteur] = useAuteur()
  const [annee, setAnnee] = useState<AnneePlan>('N+1')
  const [motif, setMotif] = useState('')

  return (
    <div className="encart">
      <p>
        Proposer <strong>{personne.nom}</strong> sur un poste de <strong>{poste.nomEtab}</strong>.
      </p>
      <div className="param-grid">
        <div className="field">
          <label htmlFor="no-annee">Année de nomination</label>
          <select id="no-annee" value={annee} onChange={e => setAnnee(e.target.value as AnneePlan)}>
            {ANNEES_PLAN.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="field field-recherche">
          <label htmlFor="no-motif">Motif</label>
          <input id="no-motif" type="text" value={motif} onChange={e => setMotif(e.target.value)} />
        </div>
        <ChampAuteur auteur={auteur} onChange={setAuteur} />
      </div>
      <ErreurAction erreur={proposition.error} />
      {proposition.isSuccess && <Notice tone="info">Nomination proposée.</Notice>}
      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={proposition.isPending || auteur.trim() === '' || motif.trim() === ''}
          onClick={() =>
            proposition.mutate(
              { personne: personne.id, poste: poste.id, annee, motif: motif.trim(), auteur: auteur.trim() },
              { onSuccess: onPropose },
            )
          }
        >
          <UserRoundCheck size={13} aria-hidden="true" /> Proposer
        </button>
        <button type="button" className="btn btn-sm" onClick={onAnnuler}>
          Annuler
        </button>
      </div>
    </div>
  )
}
