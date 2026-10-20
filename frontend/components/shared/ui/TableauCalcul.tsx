'use client'

/**
 * Tableau de démonstration d'un calcul pondéré (barème C1..C5 ou score d'appariement
 * Z1..Z4) : chaque ligne montre valeur × poids = contribution, puis la somme des
 * contributions est écrite en toutes lettres pour que le total soit vérifiable.
 */

import type { ScoreBreakdown } from '@shared/api'

const OPTIONS_VALEUR: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 4 }
const OPTIONS_CONTRIBUTION: Intl.NumberFormatOptions = { minimumFractionDigits: 4, maximumFractionDigits: 4 }

const fmtValeur = (n: number) => n.toLocaleString('fr-FR', OPTIONS_VALEUR)
const fmtPoids = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 4 })
const fmtContribution = (n: number) => n.toLocaleString('fr-FR', OPTIONS_CONTRIBUTION)

export interface ProprietesTableauCalcul {
  breakdown: ScoreBreakdown
  /** En-tête de la première colonne. */
  enteteComposante: string
  /** Libellé de la ligne du total, par exemple « Score d'appariement (Z1 + Z2 + Z3 + Z4) ». */
  libelleTotal: string
  /** Légende accessible du tableau. */
  legende: string
}

/** Détail « valeur × poids = contribution » et total d'un calcul pondéré. */
export function TableauCalcul({ breakdown, enteteComposante, libelleTotal, legende }: ProprietesTableauCalcul) {
  const { components, total } = breakdown
  const somme = components.map(c => fmtContribution(c.contribution)).join(' + ')
  return (
    <table className="compare-table">
      <caption className="sr-only">{legende}</caption>
      <thead>
        <tr>
          <th>{enteteComposante}</th>
          <th className="num">Valeur</th>
          <th className="num">Poids</th>
          <th className="num">Contribution (valeur × poids)</th>
        </tr>
      </thead>
      <tbody>
        {components.map((c, i) => (
          <tr key={`${c.label}-${i}`}>
            <th scope="row" className="th-normal">
              {c.label}
            </th>
            <td className="num">{fmtValeur(c.valeur)}</td>
            <td className="num">{fmtPoids(c.poids)}</td>
            <td className="num">
              {fmtValeur(c.valeur)} × {fmtPoids(c.poids)} = {fmtContribution(c.contribution)}
            </td>
          </tr>
        ))}
        <tr>
          <th scope="row">{libelleTotal}</th>
          <td className="num" colSpan={3}>
            {somme} = <strong>{fmtContribution(total)}</strong>
          </td>
        </tr>
      </tbody>
    </table>
  )
}
