'use client'

/**
 * Fiche d'une personne du vivier : contraintes, historique des propositions et
 * postes compatibles classés par le serveur, avec proposition directe.
 */

import { useState } from 'react'
import { X } from 'lucide-react'

import type { IdJeu, PosteCompatible } from '@shared/api'
import {
  LIBELLE_DISPONIBILITE,
  LIBELLE_PROXIMITE,
  LIBELLE_SOURCE_VIVIER,
  LIBELLE_STATUT_NOMINATION,
} from '@shared/kernel'
import { Panel, Pill, fmtDec } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { usePersonneVivier, usePostesCompatibles } from '../../application/hooks'
import { PropositionNomination } from './PropositionNomination'

/** Postes compatibles listés. */
const POSTES_AFFICHES = 15

export interface ProprietesFichePersonneVivier {
  jeu: IdJeu
  personne: string
  onFermer: () => void
}

/** Panneau « Fiche de la personne ». */
export function FichePersonneVivier({ jeu, personne, onFermer }: ProprietesFichePersonneVivier) {
  const fiche = usePersonneVivier(jeu, personne)
  const postes = usePostesCompatibles(jeu, personne)
  const [posteChoisi, setPosteChoisi] = useState<PosteCompatible | null>(null)

  const fermer = (
    <button type="button" className="btn btn-sm" onClick={onFermer}>
      <X size={13} aria-hidden="true" /> Fermer
    </button>
  )

  if (!fiche.data) {
    return (
      <Panel kicker="Vivier" title="Fiche" actions={fermer}>
        <EtatRequetes requetes={[fiche]} />
      </Panel>
    )
  }

  const p = fiche.data
  return (
    <Panel kicker={LIBELLE_SOURCE_VIVIER[p.source]} title={`${p.nom} ${p.prenom}`.trim()} actions={fermer}>
      <p className="pastilles">
        <Pill tone={p.disponibilite === 'libre' ? 'ok' : 'neutral'}>{LIBELLE_DISPONIBILITE[p.disponibilite]}</Pill>{' '}
        <span className="hint">
          {p.matricule ?? 'sans matricule'} · {p.commune}, {p.departement}
          {p.ecoleOrigine ? ` · école d’origine : ${p.ecoleOrigine.nom}` : ''}
          {p.bareme != null ? ` · barème ${fmtDec(p.bareme, 2)}` : ''}
          {p.note != null ? ` · note ${fmtDec(p.note, 2)}` : ''}
        </span>
      </p>
      {p.contraintes.length > 0 && (
        <ul className="reason-list">
          {p.contraintes.map(c => (
            <li key={c}>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      {p.historique.length > 0 && (
        <>
          <h3>Propositions antérieures</h3>
          <ul className="liste-compacte">
            {p.historique.map(n => (
              <li key={n.id}>
                {n.annee} — {n.poste.nomEtab} : {LIBELLE_STATUT_NOMINATION[n.statut]}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Postes compatibles</h3>
      {!postes.data ? (
        <EtatRequetes requetes={[postes]} />
      ) : postes.data.length === 0 ? (
        <p className="hint">Aucun poste ouvert compatible avec cette personne.</p>
      ) : (
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Poste</th>
              <th scope="col">Proximité</th>
              <th scope="col" className="num">
                Score
              </th>
              <th scope="col">Compatibilité</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {postes.data.slice(0, POSTES_AFFICHES).map(c => (
              <tr key={c.poste.id}>
                <th scope="row">
                  {c.poste.nomEtab}
                  <small className="bloc">{c.poste.commune}</small>
                </th>
                <td>{LIBELLE_PROXIMITE[c.proximite]}</td>
                <td className="num">{fmtDec(c.score.total, 1)}</td>
                <td>
                  {c.compatible ? <Pill tone="ok">Compatible</Pill> : <Pill tone="alert">Bloqué</Pill>}
                  {c.motifs.length > 0 && <small className="bloc">{c.motifs.join(' ; ')}</small>}
                </td>
                <td>
                  <button
                    type="button"
                    className="row-action"
                    disabled={!c.compatible || p.disponibilite !== 'libre'}
                    onClick={() => setPosteChoisi(c)}
                  >
                    Proposer ici
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {posteChoisi && (
        <PropositionNomination
          jeu={jeu}
          personne={{ id: p.id, nom: `${p.nom} ${p.prenom}`.trim() }}
          poste={{ id: posteChoisi.poste.id, nomEtab: posteChoisi.poste.nomEtab }}
          onPropose={() => setPosteChoisi(null)}
          onAnnuler={() => setPosteChoisi(null)}
        />
      )}
    </Panel>
  )
}
