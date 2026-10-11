'use client'

/** Liste des personnes du vivier, filtrée et paginée par le serveur. */

import { useDeferredValue, useState } from 'react'

import type { DisponibiliteVivier, IdJeu, PersonneVivier, SourceVivier } from '@shared/api'
import { LIBELLE_DISPONIBILITE, LIBELLE_SOURCE_VIVIER, SOURCES_VIVIER } from '@shared/kernel'
import { Pill, SearchField, fmtDec } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { Pagination } from '@shared/ui/Pagination'

import { useVivier } from '../../application/hooks'

/** Personnes par page. */
const TAILLE_PAGE = 30

export interface ProprietesPersonnesVivier {
  jeu: IdJeu
  selection: string | null
  onSelection: (personne: string) => void
}

/** Onglet « Personnes disponibles ». */
export function PersonnesVivier({ jeu, selection, onSelection }: ProprietesPersonnesVivier) {
  const [source, setSource] = useState<SourceVivier | ''>('')
  const [disponibilite, setDisponibilite] = useState<DisponibiliteVivier | ''>('libre')
  const [recherche, setRecherche] = useState('')
  const [page, setPage] = useState(1)
  const rechercheDifferee = useDeferredValue(recherche)

  const vivier = useVivier(jeu, {
    page,
    taille: TAILLE_PAGE,
    source: source ? [source] : undefined,
    disponibilite: disponibilite || undefined,
    recherche: rechercheDifferee,
  })

  /** Un changement de filtre ramène à la première page. */
  const filtrer = (action: () => void) => {
    action()
    setPage(1)
  }

  return (
    <div className="stack-tight">
      <div className="filter-bar filter-bar-integree">
        <SearchField
          value={recherche}
          onChange={v => filtrer(() => setRecherche(v))}
          label="Rechercher"
          placeholder="Nom, matricule, commune…"
        />
        <div className="field">
          <label htmlFor="vi-source">Source</label>
          <select
            id="vi-source"
            value={source}
            onChange={e => filtrer(() => setSource(e.target.value as SourceVivier | ''))}
          >
            <option value="">Toutes</option>
            {SOURCES_VIVIER.map(s => (
              <option key={s} value={s}>
                {LIBELLE_SOURCE_VIVIER[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="vi-dispo">Disponibilité</label>
          <select
            id="vi-dispo"
            value={disponibilite}
            onChange={e => filtrer(() => setDisponibilite(e.target.value as DisponibiliteVivier | ''))}
          >
            <option value="">Toutes</option>
            {(Object.keys(LIBELLE_DISPONIBILITE) as DisponibiliteVivier[]).map(d => (
              <option key={d} value={d}>
                {LIBELLE_DISPONIBILITE[d]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!vivier.data ? (
        <EtatRequetes requetes={[vivier]} />
      ) : (
        <>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Personne</th>
                <th scope="col">Source</th>
                <th scope="col">Territoire</th>
                <th scope="col" className="num">
                  Barème / note
                </th>
                <th scope="col">Disponibilité</th>
              </tr>
            </thead>
            <tbody>
              {vivier.data.elements.map((p: PersonneVivier) => (
                <tr key={p.id} className={selection === p.id ? 'ligne-active' : undefined}>
                  <th scope="row">
                    <button type="button" className="row-action" onClick={() => onSelection(p.id)}>
                      <strong>
                        {p.nom} {p.prenom}
                      </strong>
                      <small>{p.matricule ?? 'sans matricule'}</small>
                    </button>
                  </th>
                  <td>{LIBELLE_SOURCE_VIVIER[p.source]}</td>
                  <td>
                    {p.commune}
                    <small className="bloc">{p.region}</small>
                  </td>
                  <td className="num">
                    {p.bareme != null ? fmtDec(p.bareme, 2) : p.note != null ? fmtDec(p.note, 2) : '—'}
                  </td>
                  <td>
                    <Pill tone={p.disponibilite === 'libre' ? 'ok' : 'neutral'}>
                      {LIBELLE_DISPONIBILITE[p.disponibilite]}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {vivier.data.elements.length === 0 && <p className="hint">Aucune personne ne correspond à ces filtres.</p>}
          <Pagination page={vivier.data} onPage={setPage} />
        </>
      )}
    </div>
  )
}
