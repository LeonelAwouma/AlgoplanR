'use client'

/**
 * Tableau de planification sur cinq ans (mémo de synthèse, §2.1) : les
 * indicateurs en lignes, les années en colonnes, avec la fiabilité de chaque
 * indicateur selon la disponibilité des données sources.
 */

import { Download } from 'lucide-react'

import type { IndicateursAnnee, TableauPlanification } from '@shared/api'
import { exporterTableauXLSX } from '@shared/exports/export-xlsx'
import { Panel, Pill, fmt, type Tone } from '@shared/ui/commun'

import { LIBELLE_FIABILITE, LIGNES_INDICATEURS, valeurAbsente, type CleIndicateur } from '../../domain/indicateurs'

/** Ton de la pastille de fiabilité. */
const TON_FIABILITE = { bonne: 'ok', partielle: 'warn', faible: 'alert' } as const satisfies Record<string, Tone>

/** Valeur d'une cellule ; un quota non encore fixé s'affiche « à fixer ». */
function valeur(annee: IndicateursAnnee, cle: CleIndicateur): string {
  const v = annee[cle]
  return v == null ? valeurAbsente(cle) : fmt(v)
}

/** Exporte le tableau affiché en Excel. */
function exporterTableau(tableau: TableauPlanification) {
  void exporterTableauXLSX(
    `planification-5-ans-${tableau.perimetre}.xlsx`,
    ['Indicateur', ...tableau.annees.map(a => a.annee)],
    LIGNES_INDICATEURS.map(l => [l.libelle, ...tableau.annees.map(a => a[l.cle])]),
  )
}

/** Panneau « Tableau de planification ». */
export function TableauCinqAns({ tableau }: { tableau: TableauPlanification }) {
  const fiabilite = new Map(tableau.fiabilite.map(f => [f.indicateur, f]))

  return (
    <Panel
      kicker="Planification sur cinq ans"
      title={`Suivi des quotas et des nominations — ${tableau.perimetre}`}
      hint={`Version ${tableau.version}, calculée le ${new Date(tableau.calculeLe).toLocaleString('fr-FR')}. Une projection n’est pas un engagement : elle dépend des hypothèses de calcul.`}
      actions={
        <button type="button" className="btn btn-sm" onClick={() => exporterTableau(tableau)}>
          <Download size={13} aria-hidden="true" /> Exporter (Excel)
        </button>
      }
      flush
    >
      <div className="table-scroll table-scroll-libre">
        <table className="compare-table tableau-planification">
          <thead>
            <tr>
              <th scope="col">Indicateur</th>
              {tableau.annees.map(a => (
                <th key={a.annee} scope="col" className="num">
                  {a.annee}
                </th>
              ))}
              <th scope="col">Fiabilité</th>
            </tr>
          </thead>
          <tbody>
            {LIGNES_INDICATEURS.map(ligne => {
              const f = fiabilite.get(ligne.cle)
              return (
                <tr key={ligne.cle} className={ligne.forte ? 'ligne-forte' : undefined}>
                  <th scope="row" title={ligne.definition}>
                    {ligne.libelle}
                    <small className="bloc">{ligne.definition}</small>
                  </th>
                  {tableau.annees.map(a => (
                    <td key={a.annee} className="num">
                      {valeur(a, ligne.cle)}
                    </td>
                  ))}
                  <td>
                    {f ? (
                      <span title={f.detail}>
                        <Pill tone={TON_FIABILITE[f.niveau]}>{LIBELLE_FIABILITE[f.niveau]}</Pill>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
