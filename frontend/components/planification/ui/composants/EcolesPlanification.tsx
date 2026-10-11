'use client'

/** Projection école par école, paginée par le serveur. */

import { useState } from 'react'

import { ANNEES_PLAN, type IdJeu } from '@shared/api'
import { fmt } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { Pagination } from '@shared/ui/Pagination'

import { usePlanificationEcoles, type RequetePlanification } from '../../application/hooks'

/** Écoles par page. */
const TAILLE_PAGE = 25

/** Onglet « Écoles ». */
export function EcolesPlanification({ jeu, requete }: { jeu: IdJeu; requete: RequetePlanification }) {
  const [page, setPage] = useState(1)
  const ecoles = usePlanificationEcoles(jeu, requete, { page, taille: TAILLE_PAGE, tri: '-besoin' })

  if (!ecoles.data) return <EtatRequetes requetes={[ecoles]} />

  return (
    <div className="stack-tight">
      <p className="hint">Effectif et besoin projetés par école, les écoles au plus fort besoin d’abord.</p>
      <div className="table-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">École</th>
              <th scope="col" className="num">
                Cible K
              </th>
              {ANNEES_PLAN.map(a => (
                <th key={a} scope="col" className="num">
                  {a} : effectif · besoin
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ecoles.data.elements.map(e => (
              <tr key={e.schoolId}>
                <th scope="row">
                  {e.nomEtab}
                  <small className="bloc">
                    {e.commune} · {e.departement}
                  </small>
                </th>
                <td className="num">{fmt(e.cible)}</td>
                {e.annees.map(a => (
                  <td key={a.annee} className="num">
                    {fmt(a.effectif)} · {fmt(a.besoin)}
                    {a.departsRetraite > 0 && <small className="bloc">{fmt(a.departsRetraite)} retraite(s)</small>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={ecoles.data} onPage={setPage} />
    </div>
  )
}
