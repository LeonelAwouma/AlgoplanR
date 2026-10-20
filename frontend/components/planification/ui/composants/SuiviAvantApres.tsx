'use client'

/**
 * REM et degré d'aléa avant / après le recalcul algorithmique, pour le national puis chaque région.
 * Avant : bases importées. Après : bases après les faits du Prince et les mouvements du scénario.
 */

import { Download } from 'lucide-react'

import { exporterXLSX } from '@shared/exports/export-xlsx'
import { Panel, fmtDec } from '@shared/ui/commun'

import { ecart, type SuiviAvantApres as Suivi } from '../../application/suiviAvantApres'

export interface ProprietesSuiviAvantApres {
  suivi: Suivi
  scenarioNom: string
}

const valeur = (v: number | null, decimales: number) => (v === null ? '—' : fmtDec(v, decimales))

function Ecart({ avant, apres, decimales }: { avant: number | null; apres: number | null; decimales: number }) {
  const e = ecart(avant, apres)
  if (e === null) return <span className="delta delta-flat">—</span>
  if (e === 0) return <span className="delta delta-flat">= 0</span>
  return (
    <span className={`delta ${e < 0 ? 'delta-down' : 'delta-up'}`}>
      {e > 0 ? '▲ +' : '▼ '}
      {fmtDec(e, decimales)}
    </span>
  )
}

function exporter(suivi: Suivi, scenarioNom: string) {
  void exporterXLSX('rem-et-alea-avant-apres.xlsx', [
    {
      nom: 'REM et aléa',
      entetes: [
        'Territoire',
        'REM avant (import)',
        'REM après (recalcul)',
        'Écart REM',
        'Aléa avant (import)',
        'Aléa après (recalcul)',
        'Écart aléa',
        'Aléa avant : motif si non calculable',
        'Aléa après : motif si non calculable',
      ],
      lignes: suivi.lignes.map(l => [
        l.territoire,
        l.remAvant ?? '',
        l.remApres ?? '',
        ecart(l.remAvant, l.remApres) ?? '',
        l.aleaAvant ?? '',
        l.aleaApres ?? '',
        ecart(l.aleaAvant, l.aleaApres) ?? '',
        l.aleaAvant === null ? (l.raisonAleaAvant ?? '') : '',
        l.aleaApres === null ? (l.raisonAleaApres ?? '') : '',
      ]),
      formats: ['texte', 'decimal', 'decimal', 'decimal', 'decimal', 'decimal', 'decimal', 'texte', 'texte'],
    },
    {
      nom: 'Définitions',
      entetes: ['Indicateur', 'Définition'],
      lignes: [
        ['Scénario', scenarioNom],
        ['Avant', 'Bases enseignants et écoles telles qu’importées : avant les faits du Prince et avant l’algorithme.'],
        ['Après', 'Bases après les faits du Prince et les mouvements proposés par le scénario (recalcul).'],
        ['REM', 'Élèves par enseignant : effectif d’élèves attendu ÷ enseignants.'],
        [
          'Degré d’aléa',
          '1 − R² de la régression du nombre d’enseignants sur le nombre d’élèves, école par école : 0 = les enseignants suivent parfaitement les effectifs, 1 = aucun alignement.',
        ],
      ],
    },
  ])
}

/** Panneau « REM et degré d'aléa, avant / après ». */
export function SuiviAvantApres({ suivi, scenarioNom }: ProprietesSuiviAvantApres) {
  return (
    <Panel
      kicker="Suivi du recalcul"
      title={`REM et degré d’aléa, avant / après — ${scenarioNom}`}
      hint="Avant : les bases importées (effectifs déclarés, avant les faits du Prince et avant l’algorithme). Après : le recalcul (faits du Prince et mouvements du scénario). REM : élèves par enseignant. Degré d’aléa : 1 − R² (enseignants ~ élèves), de 0 (parfaitement aligné) à 1."
      actions={
        <button type="button" className="btn btn-sm" onClick={() => exporter(suivi, scenarioNom)}>
          <Download size={13} aria-hidden="true" /> Exporter (Excel)
        </button>
      }
    >
      <div className="table-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Territoire</th>
              <th scope="col" className="num">
                REM avant
              </th>
              <th scope="col" className="num">
                REM après
              </th>
              <th scope="col" className="num">
                Écart
              </th>
              <th scope="col" className="num">
                Aléa avant
              </th>
              <th scope="col" className="num">
                Aléa après
              </th>
              <th scope="col" className="num">
                Écart
              </th>
            </tr>
          </thead>
          <tbody>
            {suivi.lignes.map(l => (
              <tr key={l.territoire}>
                <th scope="row">{l.national ? <strong>{l.territoire}</strong> : l.territoire}</th>
                <td className="num">{valeur(l.remAvant, 1)}</td>
                <td className="num">{valeur(l.remApres, 1)}</td>
                <td className="num">
                  <Ecart avant={l.remAvant} apres={l.remApres} decimales={1} />
                </td>
                <td className="num" title={l.aleaAvant === null ? (l.raisonAleaAvant ?? undefined) : undefined}>
                  {valeur(l.aleaAvant, 2)}
                </td>
                <td className="num" title={l.aleaApres === null ? (l.raisonAleaApres ?? undefined) : undefined}>
                  {valeur(l.aleaApres, 2)}
                </td>
                <td className="num">
                  <Ecart avant={l.aleaAvant} apres={l.aleaApres} decimales={2} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!suivi.aleaDisponible && <p className="hint">Degré d’aléa « avant » indisponible pour ce jeu.</p>}
      {suivi.lignes.some(l => l.aleaAvant === null || l.aleaApres === null) && (
        <p className="hint">« — » : indicateur non calculable (moins de 3 écoles avec un effectif d’élèves connu…).</p>
      )}
    </Panel>
  )
}
