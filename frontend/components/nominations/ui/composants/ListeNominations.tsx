'use client'

/**
 * Liste des nominations, filtrée par statut et par année, paginée par le
 * serveur. Les nominations proposées peuvent être cochées pour être validées
 * ou rejetées en lot ; chaque ligne propose les actions de son statut.
 */

import { useState } from 'react'

import { ANNEES_PLAN, type AnneePlan, type IdJeu, type Nomination, type StatutNomination } from '@shared/api'
import { LIBELLE_SOURCE_VIVIER, LIBELLE_STATUT_NOMINATION } from '@shared/kernel'
import { Pill, type Tone } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { Pagination } from '@shared/ui/Pagination'

import { useNominations } from '../../application/hooks'
import { LIBELLE_ACTION, actionsPossibles, type ActionNomination } from '../../domain/cycleDeVie'
import { STATUTS_NOMINATION } from '../../domain/sources'

/** Nominations par page. */
const TAILLE_PAGE = 30

/** Ton de la pastille de statut. */
const TON_STATUT: Record<StatutNomination, Tone> = {
  proposee: 'neutral',
  validee: 'info',
  mise_en_oeuvre: 'ok',
  rejetee: 'warn',
  annulee: 'warn',
}

export interface ProprietesListeNominations {
  jeu: IdJeu
  /** Nominations cochées pour un traitement en lot. */
  cochees: Set<string>
  onCocher: (nomination: string, cochee: boolean) => void
  onAction: (nomination: Nomination, action: ActionNomination) => void
  onDetail: (nomination: Nomination) => void
}

/** Tableau des nominations. */
export function ListeNominations({ jeu, cochees, onCocher, onAction, onDetail }: ProprietesListeNominations) {
  const [statut, setStatut] = useState<StatutNomination | ''>('proposee')
  const [annee, setAnnee] = useState<AnneePlan | ''>('')
  const [page, setPage] = useState(1)
  const nominations = useNominations(jeu, {
    page,
    taille: TAILLE_PAGE,
    statut: statut ? [statut] : undefined,
    annee: annee || undefined,
  })

  return (
    <div className="stack-tight">
      <div className="filter-bar filter-bar-integree">
        <div className="field">
          <label htmlFor="ln-statut">Statut</label>
          <select
            id="ln-statut"
            value={statut}
            onChange={e => {
              setStatut(e.target.value as StatutNomination | '')
              setPage(1)
            }}
          >
            <option value="">Tous</option>
            {STATUTS_NOMINATION.map(s => (
              <option key={s} value={s}>
                {LIBELLE_STATUT_NOMINATION[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ln-annee">Année</label>
          <select
            id="ln-annee"
            value={annee}
            onChange={e => {
              setAnnee(e.target.value as AnneePlan | '')
              setPage(1)
            }}
          >
            <option value="">Toutes</option>
            {ANNEES_PLAN.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!nominations.data ? (
        <EtatRequetes requetes={[nominations]} />
      ) : (
        <>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Sélection</span>
                </th>
                <th scope="col">Personne</th>
                <th scope="col">Poste</th>
                <th scope="col">Année</th>
                <th scope="col">Statut</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {nominations.data.elements.map(n => (
                <tr key={n.id}>
                  <td>
                    {n.statut === 'proposee' && (
                      <input
                        type="checkbox"
                        checked={cochees.has(n.id)}
                        onChange={e => onCocher(n.id, e.target.checked)}
                        aria-label={`Sélectionner la nomination de ${n.personne.nom} ${n.personne.prenom}`}
                      />
                    )}
                  </td>
                  <th scope="row">
                    <button type="button" className="row-action" onClick={() => onDetail(n)}>
                      <strong>
                        {n.personne.nom} {n.personne.prenom}
                      </strong>
                      <small>{LIBELLE_SOURCE_VIVIER[n.personne.source]}</small>
                    </button>
                  </th>
                  <td>
                    {n.poste.nomEtab}
                    <small className="bloc">{n.poste.commune}</small>
                  </td>
                  <td>{n.annee}</td>
                  <td>
                    <Pill tone={TON_STATUT[n.statut]}>{LIBELLE_STATUT_NOMINATION[n.statut]}</Pill>
                  </td>
                  <td>
                    <span className="acces-actions">
                      {actionsPossibles(n.statut).map(action => (
                        <button
                          key={action}
                          type="button"
                          className={
                            action === 'rejeter' || action === 'annuler' ? 'row-action row-action-danger' : 'row-action'
                          }
                          onClick={() => onAction(n, action)}
                        >
                          {LIBELLE_ACTION[action]}
                        </button>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nominations.data.elements.length === 0 && (
            <p className="hint">Aucune nomination ne correspond à ces filtres.</p>
          )}
          <Pagination page={nominations.data} onPage={setPage} />
        </>
      )}
    </div>
  )
}
