'use client'

/**
 * Bibliothèque de graphiques de l'application.
 *
 * Tout est écrit en SVG et en CSS ici même, sans bibliothèque de
 * visualisation. Ce n'est pas un choix esthétique : les suites hébergées
 * (Google Charts et équivalentes) téléchargent leur code depuis un serveur
 * distant à chaque exécution, ce qui est incompatible avec une application de
 * bureau devant fonctionner sans connexion.
 *
 * Trois règles valent pour tous les graphiques :
 *   — les valeurs sont toujours lisibles en chiffres, pas seulement en forme ;
 *   — aucune information n'est portée par la seule couleur (motifs, symboles) ;
 *   — chaque graphique propose les mêmes données sous forme de tableau.
 */

export {
  AxeCategories,
  DefsMotifs,
  GraphiqueVide,
  GrilleY,
  Legende,
  TableauAlternatif,
  geometrie,
  graduations,
  remplissageCss,
  remplissageSvg,
  type Geometrie,
  type Serie,
} from './core'

export {
  Aires,
  Colonnes,
  Combo,
  Histogramme,
  Nuage,
  construireClasses,
  type CategorieNuage,
  type ClasseHistogramme,
  type PointCategorie,
  type PointNuage,
} from './cartesiens'

import type { ReactNode } from 'react'
import { fmt, fmtPct } from '@shared/ui/commun'
import { Infobulle, Legende as LegendeSeries, remplissageCss, useInfobulle, type Serie } from './core'
import { Colonnes, type PointCategorie } from './cartesiens'

/**
 * Barres horizontales empilées. Conservé pour les axes dont les libellés sont
 * longs — noms de communes, d'établissements — où des colonnes verticales
 * deviendraient illisibles.
 */
export function BarresHorizontales({
  titre,
  series,
  donnees,
  uniteValeur = '',
  vide = 'Aucune donnée à représenter sur ce périmètre.',
}: {
  titre: string
  series: Serie[]
  donnees: PointCategorie[]
  uniteValeur?: string
  vide?: string
}) {
  const info = useInfobulle()
  if (donnees.length === 0) return <p className="chart-vide">{vide}</p>

  const maximum = Math.max(1, ...donnees.map(d => series.reduce((a, s) => a + Math.max(0, d.valeurs[s.cle] ?? 0), 0)))

  const survoler = (d: PointCategorie, position: { clientX: number; clientY: number }) => {
    info.montrer(position, {
      titre: d.label,
      lignes: series.map(s => ({
        label: s.label,
        valeur: `${fmt(d.valeurs[s.cle] ?? 0)}${uniteValeur ? ` ${uniteValeur}` : ''}`,
        serie: s,
      })),
    })
  }

  return (
    <div className="chart" role="group" aria-label={titre}>
      <LegendeSeries series={series} />
      <div className="bar-rows" onPointerLeave={info.masquer}>
        {donnees.map(d => {
          const total = series.reduce((a, s) => a + Math.max(0, d.valeurs[s.cle] ?? 0), 0)
          const description = series.map(s => `${s.label} : ${fmt(d.valeurs[s.cle] ?? 0)}`).join(', ')
          return (
            <div
              className="bar-row"
              key={d.cle}
              onPointerEnter={e => survoler(d, e)}
              onPointerMove={e => survoler(d, e)}
            >
              <div className="bar-label">
                {d.onSelect ? (
                  <button type="button" onClick={d.onSelect} title={`Explorer ${d.label}`}>
                    {d.label}
                  </button>
                ) : (
                  d.label
                )}
              </div>
              <div
                className="bar-track"
                role="img"
                aria-label={`${d.label} — ${description}`}
                style={{ width: `${Math.max(2, (total / maximum) * 100)}%` }}
              >
                {series.map(s => {
                  const valeur = Math.max(0, d.valeurs[s.cle] ?? 0)
                  if (valeur === 0) return null
                  return (
                    <span
                      key={s.cle}
                      className="bar-seg"
                      style={{ width: `${(valeur / Math.max(total, 1)) * 100}%`, background: remplissageCss(s) }}
                    />
                  )
                })}
              </div>
              <div className="bar-values">
                {series.map(s => (
                  <span key={s.cle}>
                    <b>{fmt(d.valeurs[s.cle] ?? 0)}</b>
                    {uniteValeur && ` ${uniteValeur}`}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <Infobulle poignee={info.poignee} />
    </div>
  )
}

export interface SegmentDistribution {
  cle: string
  label: string
  valeur: number
  couleur: string
  motif?: Serie['motif']
  /** Définition de la catégorie, affichée sous le libellé. */
  definition?: string
  onSelect?: () => void
}

/**
 * Répartition d'un ensemble en catégories. La barre donne la proportion,
 * la liste donne le libellé, l'effectif et la part exacte de chaque catégorie.
 */
export function Repartition({ titre, segments }: { titre: string; segments: SegmentDistribution[] }) {
  const info = useInfobulle()
  const total = segments.reduce((a, s) => a + s.valeur, 0)
  if (total === 0) return <p className="chart-vide">Aucun établissement à répartir sur ce périmètre.</p>

  const survoler = (s: SegmentDistribution, position: { clientX: number; clientY: number }) => {
    info.montrer(position, {
      titre: s.label,
      sousTitre: s.definition,
      lignes: [
        { label: 'Établissements', valeur: fmt(s.valeur), serie: s },
        { label: 'Part du total', valeur: fmtPct(s.valeur / total) },
      ],
    })
  }

  return (
    <div className="distribution">
      <div
        className="distribution-bar"
        role="img"
        aria-label={`${titre} — ${segments.map(s => `${s.label} : ${fmt(s.valeur)}`).join(', ')}`}
      >
        {segments.map(s =>
          s.valeur === 0 ? null : (
            <span
              key={s.cle}
              className="distribution-seg"
              style={{ width: `${(s.valeur / total) * 100}%`, background: remplissageCss(s) }}
              onPointerEnter={e => survoler(s, e)}
              onPointerMove={e => survoler(s, e)}
              onPointerLeave={info.masquer}
            >
              {s.valeur / total > 0.09 ? fmtPct(s.valeur / total) : ''}
            </span>
          ),
        )}
      </div>
      <ul className="distribution-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {segments.map(s => {
          const contenu = (
            <>
              <span className="legend-swatch" style={{ background: remplissageCss(s) }} aria-hidden="true" />
              <span>
                <b>{fmt(s.valeur)}</b>
                <span style={{ display: 'block', color: 'var(--ink)', fontSize: 12.5, fontWeight: 650 }}>
                  {s.label}
                </span>
                <span>
                  {fmtPct(s.valeur / total)} des établissements
                  {s.definition ? ` · ${s.definition}` : ''}
                </span>
              </span>
            </>
          )
          return (
            <li key={s.cle}>
              {s.onSelect ? (
                <button
                  type="button"
                  className="distribution-item"
                  onClick={s.onSelect}
                  style={{ width: '100%', textAlign: 'left' }}
                >
                  {contenu}
                </button>
              ) : (
                <div className="distribution-item">{contenu}</div>
              )}
            </li>
          )
        })}
      </ul>
      <Infobulle poignee={info.poignee} />
    </div>
  )
}

/** Deux colonnes côte à côte, pour lire une situation avant et après simulation. */
export function AvantApres({
  lignes,
}: {
  lignes: { label: string; avant: number; apres: number; suffixe?: string; rendu?: ReactNode }[]
}) {
  if (lignes.length === 0) return <p className="chart-vide">Aucune comparaison à afficher.</p>
  return (
    <div className="chart">
      <Colonnes
        titre="Situation avant et après simulation"
        series={[
          { cle: 'avant', label: 'Avant simulation', couleur: 'var(--serie-5)', motif: 'hachures' },
          { cle: 'apres', label: 'Après simulation', couleur: 'var(--serie-1)' },
        ]}
        donnees={lignes.map(l => ({ cle: l.label, label: l.label, valeurs: { avant: l.avant, apres: l.apres } }))}
        hauteur={260}
      />
      <ul className="avant-apres-notes" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {lignes
          .filter(l => l.rendu)
          .map(l => (
            <li key={l.label}>
              <span>{l.label}</span>
              {l.rendu}
            </li>
          ))}
      </ul>
    </div>
  )
}

/** Comparaison de scénarios : couverture obtenue et reste à pourvoir. */
export function CouvertureParScenario({
  scenarios,
}: {
  scenarios: { cle: string; label: string; couverts: number; residuel: number; taux: number }[]
}) {
  if (scenarios.length === 0) return <p className="chart-vide">Aucun scénario n’a encore été calculé.</p>
  return (
    <Colonnes
      titre="Couverture des besoins par scénario"
      series={[
        { cle: 'couverts', label: 'Postes couverts par redéploiement', couleur: 'var(--serie-1)' },
        { cle: 'residuel', label: 'Postes restant non pourvus', couleur: 'var(--serie-4)', motif: 'hachures' },
      ]}
      donnees={scenarios.map(s => ({
        cle: s.cle,
        label: `${s.label} (${fmtPct(s.taux)})`,
        valeurs: { couverts: s.couverts, residuel: s.residuel },
      }))}
      empile
      hauteur={280}
    />
  )
}
