'use client'

/**
 * Registre des mouvements (document des routes, section 4.6) : redéploiements
 * validés, faits du Prince, déploiements de recrues et nominations, consolidés
 * pour éviter les doubles comptages et garantir la traçabilité. La
 * planification lit ce registre, et lui seul.
 */

import { useDeferredValue, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'

import { ANNEES_PLAN, type AnneePlan, type Mouvement, type StatutMouvement, type TypeMouvement } from '@shared/api'
import { LIBELLE_STATUT_MOUVEMENT, LIBELLE_TYPE_MOUVEMENT } from '@shared/kernel'
import { useSession } from '@shared/session'
import { Notice, Panel, Pill, SearchField } from '@shared/ui/commun'
import { ChampAuteur, useAuteur } from '@shared/ui/ChampAuteur'
import { ChargementEnCours, EtatRequetes, ErreurAction } from '@shared/ui/etats'
import { Pagination } from '@shared/ui/Pagination'

import { useControleMouvements, useMouvements, useMouvementsPersonne, useRealiserMouvement } from '../application/hooks'
import { mouvementRealisable } from '../domain/cycleDeVie'
import { TYPES_MOUVEMENT } from '../domain/sources'

/** Mouvements par page. */
const TAILLE_PAGE = 30

/** Ligne d'un mouvement, commune au registre et à la traçabilité individuelle. */
function LigneMouvement({ m, onRealiser }: { m: Mouvement; onRealiser?: (m: Mouvement) => void }) {
  return (
    <tr>
      <th scope="row">
        {m.personne.nom}
        <small className="bloc">{m.personne.matricule ?? 'sans matricule'}</small>
      </th>
      <td>{LIBELLE_TYPE_MOUVEMENT[m.type]}</td>
      <td>
        {m.origine ? `${m.origine.nom} → ` : ''}
        <strong>{m.destination.nom}</strong>
        <small className="bloc">
          {m.destination.commune} · {m.destination.region}
        </small>
      </td>
      <td>{m.annee}</td>
      <td>
        <Pill tone={m.statut === 'realise' ? 'ok' : 'info'}>{LIBELLE_STATUT_MOUVEMENT[m.statut]}</Pill>
        {m.realiseLe && <small className="bloc">{new Date(m.realiseLe).toLocaleDateString('fr-FR')}</small>}
      </td>
      <td>
        {m.decision.type}
        {m.decision.reference ? ` — ${m.decision.reference}` : ''}
      </td>
      {onRealiser && (
        <td>
          {mouvementRealisable(m) && (
            <button type="button" className="row-action" onClick={() => onRealiser(m)}>
              Marquer réalisé
            </button>
          )}
        </td>
      )}
    </tr>
  )
}

/** En-tête des tableaux de mouvements. */
function EnTete({ avecAction }: { avecAction: boolean }) {
  return (
    <thead>
      <tr>
        <th scope="col">Personne</th>
        <th scope="col">Type</th>
        <th scope="col">Mouvement</th>
        <th scope="col">Année</th>
        <th scope="col">Statut</th>
        <th scope="col">Décision d’origine</th>
        {avecAction && <th scope="col" />}
      </tr>
    </thead>
  )
}

/** Page « Registre des mouvements ». */
export function MouvementsPage() {
  const { jeu } = useSession()
  const [type, setType] = useState<TypeMouvement | ''>('')
  const [statut, setStatut] = useState<StatutMouvement | ''>('')
  const [annee, setAnnee] = useState<AnneePlan | ''>('')
  const [page, setPage] = useState(1)
  const [aRealiser, setARealiser] = useState<Mouvement | null>(null)
  const [dateEffet, setDateEffet] = useState(() => new Date().toISOString().slice(0, 10))
  const [acte, setActe] = useState('')
  const [auteur, setAuteur] = useAuteur()
  const [matricule, setMatricule] = useState('')
  const matriculeDiffere = useDeferredValue(matricule.trim())

  const controles = useControleMouvements(jeu)
  const mouvements = useMouvements(jeu, {
    page,
    taille: TAILLE_PAGE,
    type: type ? [type] : undefined,
    statut: statut || undefined,
    annee: annee || undefined,
  })
  const trace = useMouvementsPersonne(jeu, matriculeDiffere || null)
  const realisation = useRealiserMouvement(jeu)

  if (!jeu) return <ChargementEnCours />

  /** Un changement de filtre ramène à la première page. */
  const filtrer = (action: () => void) => {
    action()
    setPage(1)
  }

  return (
    <div className="stack">
      <Panel kicker="Contrôle" title="Doubles comptages">
        {!controles.data ? (
          <EtatRequetes requetes={[controles]} />
        ) : controles.data.ok ? (
          <p className="check-ok">
            <Check size={15} aria-hidden="true" /> Aucune personne ni aucun poste n’est compté deux fois.
          </p>
        ) : (
          <ul className="check-list">
            {controles.data.anomalies.map(a => (
              <li key={`${a.code}-${a.mouvements.join('-')}`} className="check-alert">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>
                  <strong className="texte-fort">{a.libelle}</strong>
                  <span className="hint bloc">Mouvements concernés : {a.mouvements.join(', ')}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {aRealiser && (
        <Panel kicker="Mise en œuvre" title={`${aRealiser.personne.nom} → ${aRealiser.destination.nom}`}>
          <Notice tone="warn">
            Le mouvement passe de « prévu » à « réalisé » : la planification le compte désormais dans les effectifs
            réels.
          </Notice>
          <div className="param-grid">
            <div className="field">
              <label htmlFor="mv-date">Date d’effet</label>
              <input id="mv-date" type="date" value={dateEffet} onChange={e => setDateEffet(e.target.value)} />
            </div>
            <div className="field field-recherche">
              <label htmlFor="mv-acte">Référence de l’acte</label>
              <input id="mv-acte" type="text" value={acte} onChange={e => setActe(e.target.value)} />
            </div>
            <ChampAuteur auteur={auteur} onChange={setAuteur} />
          </div>
          <ErreurAction erreur={realisation.error} />
          <div className="topbar-actions actions-formulaire">
            <button
              type="button"
              className="btn btn-primary"
              disabled={realisation.isPending || acte.trim() === '' || auteur.trim() === '' || dateEffet === ''}
              onClick={() =>
                realisation.mutate(
                  { mouvement: aRealiser.id, corps: { dateEffet, referenceActe: acte.trim(), auteur: auteur.trim() } },
                  {
                    onSuccess: () => {
                      setARealiser(null)
                      setActe('')
                    },
                  },
                )
              }
            >
              Marquer réalisé
            </button>
            <button type="button" className="btn" onClick={() => setARealiser(null)}>
              Revenir
            </button>
          </div>
        </Panel>
      )}

      <Panel kicker="Registre" title="Mouvements prévus et réalisés" flush>
        <div className="onglet-contenu stack-tight">
          <div className="filter-bar filter-bar-integree">
            <div className="field">
              <label htmlFor="mv-type">Type</label>
              <select
                id="mv-type"
                value={type}
                onChange={e => filtrer(() => setType(e.target.value as TypeMouvement | ''))}
              >
                <option value="">Tous</option>
                {TYPES_MOUVEMENT.map(t => (
                  <option key={t} value={t}>
                    {LIBELLE_TYPE_MOUVEMENT[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="mv-statut">Statut</label>
              <select
                id="mv-statut"
                value={statut}
                onChange={e => filtrer(() => setStatut(e.target.value as StatutMouvement | ''))}
              >
                <option value="">Tous</option>
                <option value="prevu">{LIBELLE_STATUT_MOUVEMENT.prevu}</option>
                <option value="realise">{LIBELLE_STATUT_MOUVEMENT.realise}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="mv-annee">Année</label>
              <select
                id="mv-annee"
                value={annee}
                onChange={e => filtrer(() => setAnnee(e.target.value as AnneePlan | ''))}
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
          {!mouvements.data ? (
            <EtatRequetes requetes={[mouvements]} />
          ) : (
            <>
              <table className="compare-table">
                <EnTete avecAction />
                <tbody>
                  {mouvements.data.elements.map(m => (
                    <LigneMouvement key={m.id} m={m} onRealiser={setARealiser} />
                  ))}
                </tbody>
              </table>
              {mouvements.data.elements.length === 0 && (
                <p className="hint">Aucun mouvement ne correspond à ces filtres.</p>
              )}
              <Pagination page={mouvements.data} onPage={setPage} />
            </>
          )}
        </div>
      </Panel>

      <Panel kicker="Traçabilité" title="Tous les mouvements d’une personne">
        <div className="filter-bar filter-bar-integree">
          <SearchField
            value={matricule}
            onChange={setMatricule}
            label="Matricule"
            placeholder="Matricule de l’enseignant"
          />
        </div>
        {matriculeDiffere &&
          (!trace.data ? (
            <EtatRequetes requetes={[trace]} />
          ) : trace.data.length === 0 ? (
            <p className="hint">Aucun mouvement enregistré pour ce matricule.</p>
          ) : (
            <table className="compare-table">
              <EnTete avecAction={false} />
              <tbody>
                {trace.data.map(m => (
                  <LigneMouvement key={m.id} m={m} />
                ))}
              </tbody>
            </table>
          ))}
      </Panel>
    </div>
  )
}
