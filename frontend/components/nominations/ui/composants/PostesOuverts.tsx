'use client'

/**
 * Postes vacants après redéploiement, avec leur statut (libre, réservé par une
 * nomination validée, pourvu), et rapprochement inverse : les personnes du
 * vivier classées pour un poste.
 */

import { useState } from 'react'

import type { CandidatPoste, IdJeu, PosteOuvert, StatutPoste } from '@shared/api'
import { LIBELLE_PROXIMITE, LIBELLE_STATUT_POSTE } from '@shared/kernel'
import { Pill, ZoneSecuritePill, fmt, fmtDec, type Tone } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { Pagination } from '@shared/ui/Pagination'

import { useCandidatsPoste, usePostesOuverts } from '../../application/hooks'
import { STATUTS_POSTE } from '../../domain/sources'
import { PropositionNomination } from './PropositionNomination'

/** Postes par page. */
const TAILLE_PAGE = 30

/** Ton de la pastille de statut d'un poste. */
const TON_POSTE: Record<StatutPoste, Tone> = { libre: 'warn', reserve: 'info', pourvu: 'ok' }

/** Candidats d'un poste, avec proposition directe. */
function CandidatsPoste({ jeu, poste }: { jeu: IdJeu; poste: PosteOuvert }) {
  const candidats = useCandidatsPoste(jeu, poste.id)
  const [choisi, setChoisi] = useState<CandidatPoste | null>(null)

  if (!candidats.data) return <EtatRequetes requetes={[candidats]} />
  if (candidats.data.length === 0)
    return <p className="hint">Aucune personne du vivier n’est compatible avec ce poste.</p>

  return (
    <div className="encart">
      <h3>Candidats pour {poste.nomEtab}</h3>
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">Personne</th>
            <th scope="col">Proximité</th>
            <th scope="col" className="num">
              Score
            </th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {candidats.data.map(c => (
            <tr key={c.personne.id}>
              <th scope="row">
                {c.personne.nom} {c.personne.prenom}
                {!c.compatible && <small className="bloc">{c.motifs.join(' ; ')}</small>}
              </th>
              <td>{LIBELLE_PROXIMITE[c.proximite]}</td>
              <td className="num">{fmtDec(c.score.total, 1)}</td>
              <td>
                <button
                  type="button"
                  className="row-action"
                  disabled={!c.compatible || c.personne.disponibilite !== 'libre'}
                  onClick={() => setChoisi(c)}
                >
                  Proposer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {choisi && (
        <PropositionNomination
          jeu={jeu}
          personne={{ id: choisi.personne.id, nom: `${choisi.personne.nom} ${choisi.personne.prenom}`.trim() }}
          poste={{ id: poste.id, nomEtab: poste.nomEtab }}
          onPropose={() => setChoisi(null)}
          onAnnuler={() => setChoisi(null)}
        />
      )}
    </div>
  )
}

/** Onglet « Postes ouverts ». */
export function PostesOuverts({ jeu }: { jeu: IdJeu }) {
  const [statut, setStatut] = useState<StatutPoste | ''>('libre')
  const [page, setPage] = useState(1)
  const [selection, setSelection] = useState<PosteOuvert | null>(null)
  const postes = usePostesOuverts(jeu, { page, taille: TAILLE_PAGE, statut: statut || undefined })

  return (
    <div className="stack-tight">
      <div className="param-grid">
        <div className="field">
          <label htmlFor="po-statut">Statut</label>
          <select
            id="po-statut"
            value={statut}
            onChange={e => {
              setStatut(e.target.value as StatutPoste | '')
              setPage(1)
            }}
          >
            <option value="">Tous</option>
            {STATUTS_POSTE.map(s => (
              <option key={s} value={s}>
                {LIBELLE_STATUT_POSTE[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!postes.data ? (
        <EtatRequetes requetes={[postes]} />
      ) : (
        <>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col" className="num">
                  Rang
                </th>
                <th scope="col">École</th>
                <th scope="col">Sécurité</th>
                <th scope="col" className="num">
                  Indice u
                </th>
                <th scope="col">Statut</th>
              </tr>
            </thead>
            <tbody>
              {postes.data.elements.map(p => (
                <tr key={p.id} className={selection?.id === p.id ? 'ligne-active' : undefined}>
                  <td className="num">{fmt(p.rang)}</td>
                  <th scope="row">
                    <button type="button" className="row-action" onClick={() => setSelection(p)}>
                      <strong>{p.nomEtab}</strong>
                      <small>
                        {p.commune} · {p.departement}
                      </small>
                    </button>
                  </th>
                  <td>
                    <ZoneSecuritePill zone={p.zoneSecurite} court />
                  </td>
                  <td className="num">{fmt(p.indicePriorite)}</td>
                  <td>
                    <Pill tone={TON_POSTE[p.statut]}>{LIBELLE_STATUT_POSTE[p.statut]}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {postes.data.elements.length === 0 && <p className="hint">Aucun poste ne correspond à ce statut.</p>}
          <Pagination page={postes.data} onPage={setPage} />
        </>
      )}

      {selection && selection.statut === 'libre' && <CandidatsPoste key={selection.id} jeu={jeu} poste={selection} />}
    </div>
  )
}
