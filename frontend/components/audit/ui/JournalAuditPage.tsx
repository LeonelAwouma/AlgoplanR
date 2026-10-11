'use client'

/**
 * Journal d'audit (document des routes, section 4.8) : toutes les décisions et
 * tous les recalculs, horodatés et signés, du plus récent au plus ancien. Le
 * détail d'un événement montre l'état de l'objet avant et après.
 */

import { useDeferredValue, useState } from 'react'
import { X } from 'lucide-react'

import type { EvenementAudit, TypeEvenementAudit } from '@shared/api'
import { LIBELLE_TYPE_EVENEMENT } from '@shared/kernel'
import { useSession } from '@shared/session'
import { Panel, Pill, SearchField } from '@shared/ui/commun'
import { ChargementEnCours, EtatRequetes } from '@shared/ui/etats'
import { Pagination } from '@shared/ui/Pagination'

import { useEvenementAudit, useJournalAudit } from '../application/hooks'

/** Événements par page. */
const TAILLE_PAGE = 40

/** Types d'événements, dans l'ordre du filtre. */
const TYPES = Object.keys(LIBELLE_TYPE_EVENEMENT) as TypeEvenementAudit[]

/** Valeur JSON lisible, ou « — » pour une absence. */
function enClair(valeur: unknown): string {
  return valeur == null ? '—' : JSON.stringify(valeur, null, 2)
}

/** Panneau « Détail de l'événement ». */
function DetailEvenement({ jeu, evenement, onFermer }: { jeu: string; evenement: string; onFermer: () => void }) {
  const detail = useEvenementAudit(jeu, evenement)
  const fermer = (
    <button type="button" className="btn btn-sm" onClick={onFermer}>
      <X size={13} aria-hidden="true" /> Fermer
    </button>
  )
  if (!detail.data) {
    return (
      <Panel kicker="Audit" title="Détail" actions={fermer}>
        <EtatRequetes requetes={[detail]} />
      </Panel>
    )
  }
  const e = detail.data
  return (
    <Panel kicker={LIBELLE_TYPE_EVENEMENT[e.type]} title={e.resume} actions={fermer}>
      <p className="hint">
        {new Date(e.le).toLocaleString('fr-FR')} · {e.auteur ?? 'auteur non renseigné'}
        {e.objet ? ` · ${e.objet.type} ${e.objet.id}` : ''}
      </p>
      <div className="grid-2">
        <div>
          <h3>Avant</h3>
          <pre className="code">{enClair(e.avant)}</pre>
        </div>
        <div>
          <h3>Après</h3>
          <pre className="code">{enClair(e.apres)}</pre>
        </div>
      </div>
    </Panel>
  )
}

/** Page « Journal d'audit ». */
export function JournalAuditPage() {
  const { jeu } = useSession()
  const [type, setType] = useState<TypeEvenementAudit | ''>('')
  const [auteur, setAuteur] = useState('')
  const [du, setDu] = useState('')
  const [au, setAu] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<string | null>(null)
  const auteurDiffere = useDeferredValue(auteur.trim())

  const journal = useJournalAudit(jeu, {
    page,
    taille: TAILLE_PAGE,
    type: type ? [type] : undefined,
    auteur: auteurDiffere || undefined,
    du: du || undefined,
    au: au || undefined,
  })

  if (!jeu) return <ChargementEnCours />

  /** Un changement de filtre ramène à la première page. */
  const filtrer = (action: () => void) => {
    action()
    setPage(1)
  }

  return (
    <div className="stack">
      <Panel kicker="Audit" title="Journal des décisions et des recalculs" flush>
        <div className="onglet-contenu stack-tight">
          <div className="filter-bar filter-bar-integree">
            <div className="field">
              <label htmlFor="au-type">Type</label>
              <select
                id="au-type"
                value={type}
                onChange={e => filtrer(() => setType(e.target.value as TypeEvenementAudit | ''))}
              >
                <option value="">Tous</option>
                {TYPES.map(t => (
                  <option key={t} value={t}>
                    {LIBELLE_TYPE_EVENEMENT[t]}
                  </option>
                ))}
              </select>
            </div>
            <SearchField
              value={auteur}
              onChange={v => filtrer(() => setAuteur(v))}
              label="Auteur"
              placeholder="Nom de l’agent"
            />
            <div className="field">
              <label htmlFor="au-du">Du</label>
              <input id="au-du" type="date" value={du} onChange={e => filtrer(() => setDu(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="au-au">Au</label>
              <input id="au-au" type="date" value={au} onChange={e => filtrer(() => setAu(e.target.value))} />
            </div>
          </div>

          {!journal.data ? (
            <EtatRequetes requetes={[journal]} />
          ) : (
            <>
              <table className="compare-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Type</th>
                    <th scope="col">Événement</th>
                    <th scope="col">Par</th>
                  </tr>
                </thead>
                <tbody>
                  {journal.data.elements.map((e: EvenementAudit) => (
                    <tr key={e.id} className={detail === e.id ? 'ligne-active' : undefined}>
                      <th scope="row">{new Date(e.le).toLocaleString('fr-FR')}</th>
                      <td>
                        <Pill tone="neutral">{LIBELLE_TYPE_EVENEMENT[e.type]}</Pill>
                      </td>
                      <td>
                        <button type="button" className="row-action" onClick={() => setDetail(e.id)}>
                          {e.resume}
                          <small>{e.action}</small>
                        </button>
                      </td>
                      <td>{e.auteur ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {journal.data.elements.length === 0 && (
                <p className="hint">Aucun événement ne correspond à ces filtres.</p>
              )}
              <Pagination page={journal.data} onPage={setPage} />
            </>
          )}
        </div>
      </Panel>

      {detail && <DetailEvenement key={detail} jeu={jeu} evenement={detail} onFermer={() => setDetail(null)} />}
    </div>
  )
}
