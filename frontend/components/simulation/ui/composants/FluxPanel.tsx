'use client'

/**
 * Bilan des mouvements d'un territoire.
 *
 * Une vue territoriale ne peut pas se limiter aux postes couverts sur place :
 * dans un scénario sans contrainte géographique, un territoire peut recevoir des
 * enseignants tout en en cédant à d'autres. Ce panneau expose donc les trois
 * lectures — reçus, sortants, mouvements internes — et le solde qui en découle.
 */

import { ArrowDownLeft, ArrowUpRight, Repeat } from 'lucide-react'
import type { FluxTerritorial } from '@shared/api'
import { Notice, Panel, Pill, fmt, fmtPct } from '@shared/ui/commun'

function LigneGroupe({ libelle, nombre, total }: { libelle: string; nombre: number; total: number }) {
  return (
    <div className="bar-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) 96px auto' }}>
      <span className="bar-label" title={libelle}>
        {libelle}
      </span>
      <span className="bar-track">
        <span
          className="bar-seg"
          style={{ width: `${total > 0 ? (nombre / total) * 100 : 0}%`, background: 'var(--serie-2)' }}
        />
      </span>
      <span className="bar-values">
        <b>{fmt(nombre)}</b>
      </span>
    </div>
  )
}

export function FluxPanel({
  flux,
  perimetre,
  scenarioNom,
  onOuvrirEcole,
}: {
  flux: FluxTerritorial
  perimetre: string
  scenarioNom: string
  onOuvrirEcole?: (schoolId: string) => void
}) {
  const soldeLibelle =
    flux.solde > 0
      ? `Gain net de ${fmt(flux.solde)} enseignant(s)`
      : flux.solde < 0
        ? `Perte nette de ${fmt(Math.abs(flux.solde))} enseignant(s)`
        : 'Autant d’arrivées que de départs'

  return (
    <Panel
      kicker="Mouvements"
      title={`Bilan des mouvements — ${perimetre}`}
      hint={`Scénario « ${scenarioNom} ». Les enseignants reçus et les enseignants cédés sont comptés séparément : le solde ne se lit pas dans le seul nombre de postes couverts.`}
    >
      {flux.autonome && flux.mouvementsInternes > 0 && (
        <Notice tone="neutral" title="Territoire autonome dans ce scénario.">
          Tous les mouvements restent à l’intérieur du périmètre : aucun enseignant n’y entre ni n’en sort.
        </Notice>
      )}

      <dl className="def-grid" style={{ marginTop: 12 }}>
        <div>
          <dt>Postes couverts sur le territoire</dt>
          <dd>{fmt(flux.postesCouverts)}</dd>
        </div>
        <div>
          <dt>Postes restant à pourvoir</dt>
          <dd>{fmt(flux.besoinResiduel)}</dd>
        </div>
        <div>
          <dt>Taux de couverture</dt>
          <dd>{fmtPct(flux.tauxCouverture)}</dd>
        </div>
        <div>
          <dt>Enseignants reçus de l’extérieur</dt>
          <dd>{fmt(flux.enseignantsRecus)}</dd>
        </div>
        <div>
          <dt>Enseignants cédés à l’extérieur</dt>
          <dd>{fmt(flux.enseignantsSortants)}</dd>
        </div>
        <div>
          <dt>Mouvements internes au territoire</dt>
          <dd>{fmt(flux.mouvementsInternes)}</dd>
        </div>
      </dl>

      <p style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Pill tone={flux.solde > 0 ? 'ok' : flux.solde < 0 ? 'warn' : 'neutral'}>
          <span aria-hidden="true">{flux.solde > 0 ? '▲' : flux.solde < 0 ? '▼' : '='}</span> Solde des mouvements :{' '}
          {flux.solde > 0 ? '+' : ''}
          {fmt(flux.solde)}
        </Pill>
        <span className="hint" style={{ margin: 0 }}>
          {soldeLibelle} — {fmt(flux.enseignantsRecus)} reçus, {fmt(flux.enseignantsSortants)} cédés.
        </span>
      </p>

      {(flux.originesExterieures.length > 0 || flux.destinationsExterieures.length > 0) && (
        <div className="grid-2" style={{ marginTop: 18 }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <ArrowDownLeft size={15} aria-hidden="true" /> D’où viennent les enseignants reçus
            </h3>
            {flux.originesExterieures.length === 0 ? (
              <p className="hint">Aucun enseignant ne vient de l’extérieur du périmètre.</p>
            ) : (
              <div className="bar-rows" style={{ marginTop: 8 }}>
                {flux.originesExterieures.slice(0, 8).map(g => (
                  <LigneGroupe key={g.libelle} libelle={g.libelle} nombre={g.nombre} total={flux.enseignantsRecus} />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <ArrowUpRight size={15} aria-hidden="true" /> Où vont les enseignants cédés
            </h3>
            {flux.destinationsExterieures.length === 0 ? (
              <p className="hint">Aucun enseignant ne quitte le périmètre.</p>
            ) : (
              <div className="bar-rows" style={{ marginTop: 8 }}>
                {flux.destinationsExterieures.slice(0, 8).map(g => (
                  <LigneGroupe key={g.libelle} libelle={g.libelle} nombre={g.nombre} total={flux.enseignantsSortants} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {flux.ecolesSources.length > 0 && (
        <details className="advanced" style={{ marginTop: 16 }}>
          <summary>
            <Repeat size={13} aria-hidden="true" /> Écoles du territoire qui cèdent des enseignants (
            {fmt(flux.ecolesSources.length)})
          </summary>
          <div className="table-scroll" style={{ maxHeight: 280, marginTop: 8 }}>
            <table className="data">
              <caption className="sr-only">Établissements du territoire fournissant des enseignants</caption>
              <thead>
                <tr>
                  <th scope="col">Établissement</th>
                  <th scope="col" className="num">
                    Départs proposés
                  </th>
                </tr>
              </thead>
              <tbody>
                {flux.ecolesSources.map(e => (
                  <tr key={e.schoolId}>
                    <td>
                      {onOuvrirEcole ? (
                        <button type="button" className="row-action" onClick={() => onOuvrirEcole(e.schoolId)}>
                          <strong>{e.nomEtab || e.schoolId}</strong>
                          <small>{e.schoolId}</small>
                        </button>
                      ) : (
                        <span>
                          <strong>{e.nomEtab || e.schoolId}</strong>
                          <small>{e.schoolId}</small>
                        </span>
                      )}
                    </td>
                    <td className="num">{fmt(e.departs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Panel>
  )
}
