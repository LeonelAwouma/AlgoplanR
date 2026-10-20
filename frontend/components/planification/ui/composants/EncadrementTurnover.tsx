'use client'

/**
 * Taux d'encadrement (élèves par enseignant) et turnover, avant l'algorithme (fichier d'origine) et après le
 * scénario, au niveau national puis région par région.
 */

import { Download } from 'lucide-react'

import { exporterXLSX } from '@shared/exports/export-xlsx'
import type { ComparaisonEncadrement, IndicateursEncadrement } from '@shared/api'
import { KpiCard, Panel, fmt, fmtDec } from '@shared/ui/commun'

const fmtTaux = (v: number) =>
  `${(v * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`

export interface ProprietesEncadrementTurnover {
  comparaison: ComparaisonEncadrement
  scenarioNom: string
}

/** Écart de taux d'encadrement : moins d'élèves par enseignant est favorable. */
function EcartEncadrement({ avant, apres }: { avant: number; apres: number }) {
  const ecart = Math.round((apres - avant) * 10) / 10
  if (ecart === 0) return <span className="delta delta-flat">= 0 (inchangé)</span>
  return (
    <span className={`delta ${ecart < 0 ? 'delta-down' : 'delta-up'}`}>
      {ecart > 0 ? '▲ +' : '▼ '}
      {fmtDec(ecart, 1)} élève(s) par enseignant
    </span>
  )
}

/** Écart de turnover en points de pourcentage. */
function EcartPoints({ avant, apres }: { avant: number; apres: number }) {
  const points = Math.round((apres - avant) * 1000) / 10
  if (points === 0) return <span className="delta delta-flat">= 0 (inchangé)</span>
  return (
    <span className="delta delta-flat">
      {points > 0 ? '▲ +' : '▼ '}
      {fmtDec(points, 1)} pt
    </span>
  )
}

function exporter(c: ComparaisonEncadrement, scenarioNom: string) {
  const lignes = [c.national, ...c.parRegion].map(i => [
    i.territoire,
    i.eleves,
    i.enseignantsAvant,
    i.enseignantsApres,
    i.remAvant,
    i.remApres,
    i.effectif,
    i.recents,
    i.deplaces,
    i.turnoverAvant,
    i.turnoverApres,
  ])
  void exporterXLSX('encadrement-et-turnover.xlsx', [
    {
      nom: 'Encadrement et turnover',
      entetes: [
        'Territoire',
        'Élèves',
        'Enseignants avant',
        'Enseignants après',
        'Élèves par enseignant avant',
        'Élèves par enseignant après',
        'Effectif du fichier',
        `Enseignants à moins de ${c.seuilAncienneteAns} ans au poste`,
        'Enseignants déplacés',
        'Turnover avant',
        'Turnover après',
      ],
      lignes,
      formats: [
        'texte',
        'entier',
        'entier',
        'entier',
        'decimal',
        'decimal',
        'entier',
        'entier',
        'entier',
        'pourcentage',
        'pourcentage',
      ],
    },
    {
      nom: 'Définitions',
      entetes: ['Indicateur', 'Définition'],
      lignes: [
        ['Scénario', scenarioNom],
        ['Taux d’encadrement', 'Élèves par enseignant : effectif d’élèves attendu ÷ enseignants en poste.'],
        [
          'Turnover avant',
          `Part des enseignants du fichier d’origine à moins de ${c.seuilAncienneteAns} ans d’ancienneté au poste.`,
        ],
        [
          'Turnover après',
          'Turnover avant + enseignants déplacés par le scénario (ils repartent à zéro dans leur nouveau poste), ramené à l’effectif.',
        ],
      ],
    },
  ])
}

function LigneTerritoire({ i }: { i: IndicateursEncadrement }) {
  return (
    <tr>
      <th scope="row">{i.territoire}</th>
      <td className="num">{fmtDec(i.remAvant, 1)}</td>
      <td className="num">{fmtDec(i.remApres, 1)}</td>
      <td className="num">{fmtTaux(i.turnoverAvant)}</td>
      <td className="num">{fmtTaux(i.turnoverApres)}</td>
      <td className="num">{fmt(i.deplaces)}</td>
    </tr>
  )
}

/** Panneau « Encadrement et rotation ». */
export function EncadrementTurnover({ comparaison, scenarioNom }: ProprietesEncadrementTurnover) {
  const n = comparaison.national
  return (
    <Panel
      kicker="Encadrement et rotation"
      title={`Avant / après l’algorithme — ${scenarioNom}`}
      hint={`Taux d’encadrement : élèves par enseignant. Turnover : part des enseignants à moins de ${comparaison.seuilAncienneteAns} ans d’ancienneté au poste ; le fichier d’origine n’a pas d’historique de départs, l’« ancien » turnover est donc mesuré sur l’ancienneté, et le « nouveau » y ajoute les enseignants déplacés par le scénario.`}
      actions={
        <button type="button" className="btn btn-sm" onClick={() => exporter(comparaison, scenarioNom)}>
          <Download size={13} aria-hidden="true" /> Exporter (Excel)
        </button>
      }
    >
      <div className="kpi-row">
        <KpiCard
          label="Ancien taux d’encadrement"
          value={`${fmtDec(n.remAvant, 1)} élèves/ens.`}
          hint={`Fichier d’origine : ${fmt(n.eleves)} élèves pour ${fmt(n.enseignantsAvant)} enseignants.`}
        />
        <KpiCard
          label="Nouveau taux d’encadrement"
          value={`${fmtDec(n.remApres, 1)} élèves/ens.`}
          hint={`Recalculé après les ${fmt(n.deplaces)} mouvements de l’algorithme.`}
        />
        <KpiCard
          label="Ancien turnover"
          value={fmtTaux(n.turnoverAvant)}
          hint={`${fmt(n.recents)} enseignants à moins de ${comparaison.seuilAncienneteAns} ans au poste sur ${fmt(n.effectif)}.`}
        />
        <KpiCard
          label="Nouveau turnover"
          value={fmtTaux(n.turnoverApres)}
          hint={`${fmt(n.recents + n.deplaces)} enseignants récents ou déplacés sur ${fmt(n.effectif)}.`}
        />
      </div>
      <p className="hint">
        Encadrement : <EcartEncadrement avant={n.remAvant} apres={n.remApres} /> · Turnover :{' '}
        <EcartPoints avant={n.turnoverAvant} apres={n.turnoverApres} />
      </p>
      <div className="table-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Région</th>
              <th scope="col" className="num">
                Encadrement avant
              </th>
              <th scope="col" className="num">
                Encadrement après
              </th>
              <th scope="col" className="num">
                Turnover avant
              </th>
              <th scope="col" className="num">
                Turnover après
              </th>
              <th scope="col" className="num">
                Déplacés
              </th>
            </tr>
          </thead>
          <tbody>
            {comparaison.parRegion.map(i => (
              <LigneTerritoire key={i.territoire} i={i} />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
