'use client'

/**
 * Génération automatique de propositions : le serveur apparie les personnes
 * libres du vivier et les postes ouverts. Les propositions restent à valider.
 */

import { useState } from 'react'
import { Sparkles } from 'lucide-react'

import { ANNEES_PLAN, type AnneePlan, type IdJeu } from '@shared/api'
import { Notice, Panel, fmt } from '@shared/ui/commun'
import { ChampAuteur, useAuteur } from '@shared/ui/ChampAuteur'
import { ErreurAction } from '@shared/ui/etats'

import { useGenererNominations } from '../../application/hooks'

/** Panneau « Propositions automatiques ». */
export function GenerationNominations({ jeu }: { jeu: IdJeu }) {
  const generation = useGenererNominations(jeu)
  const [auteur, setAuteur] = useAuteur()
  const [annee, setAnnee] = useState<AnneePlan>('N+1')
  const bilan = generation.data

  return (
    <Panel
      kicker="Propositions automatiques"
      title="Rapprocher le vivier et les postes ouverts"
      hint="Le serveur propose, pour chaque poste ouvert, la personne libre la mieux placée (proximité, sous-système, zone, score). Rien n’est validé automatiquement."
    >
      <div className="param-grid">
        <div className="field">
          <label htmlFor="ge-annee">Année</label>
          <select id="ge-annee" value={annee} onChange={e => setAnnee(e.target.value as AnneePlan)}>
            {ANNEES_PLAN.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <ChampAuteur auteur={auteur} onChange={setAuteur} />
      </div>
      <ErreurAction erreur={generation.error} />
      {bilan && (
        <Notice tone="info" title={`${fmt(bilan.proposees)} proposition(s) générée(s).`}>
          {fmt(bilan.sansPoste)} personne(s) sans poste compatible, {fmt(bilan.postesSansCandidat)} poste(s) sans
          candidat.
        </Notice>
      )}
      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={generation.isPending || auteur.trim() === ''}
          onClick={() => generation.mutate({ annee, auteur: auteur.trim() })}
        >
          <Sparkles size={13} aria-hidden="true" /> Générer les propositions
        </button>
      </div>
    </Panel>
  )
}
