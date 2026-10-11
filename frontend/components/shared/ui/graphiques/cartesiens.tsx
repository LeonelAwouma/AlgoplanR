'use client'

/**
 * Graphiques cartésiens : colonnes (groupées ou empilées), combiné
 * colonnes + courbe, histogramme de distribution, nuage de points et aires.
 *
 * Chaque graphique affiche ses valeurs numériquement, porte une description
 * lisible par un lecteur d'écran, et propose le même contenu sous forme de
 * tableau. Aucune information n'est transmise par la seule couleur.
 */

import { useMemo, useState } from 'react'
import { construireClasses, type ClasseHistogramme } from '@shared/kernel'
import { fmt, fmtPct } from '@shared/ui/commun'

export { construireClasses, type ClasseHistogramme }
import {
  AxeCategories,
  DefsMotifs,
  GraphiqueVide,
  GrilleY,
  Infobulle,
  Legende,
  TableauAlternatif,
  ZonesSurvol,
  geometrie,
  graduations,
  margeBasPourLabels,
  remplissageSvg,
  useInfobulle,
  type LigneInfobulle,
  type Serie,
} from './core'

export interface PointCategorie {
  cle: string
  label: string
  valeurs: Record<string, number>
  /** Action déclenchée au clic sur la catégorie (exploration territoriale). */
  onSelect?: () => void
}

// ---------------------------------------------------------------------------
// Colonnes
// ---------------------------------------------------------------------------

/**
 * Colonnes verticales, groupées côte à côte ou empilées. C'est la forme la plus
 * lisible pour comparer quelques territoires ou scénarios entre eux.
 */
export function Colonnes({
  titre,
  series,
  donnees,
  empile = false,
  hauteur = 300,
  unite = '',
  vide = 'Aucune donnée à représenter sur ce périmètre.',
  afficherValeurs = true,
}: {
  titre: string
  series: Serie[]
  donnees: PointCategorie[]
  empile?: boolean
  hauteur?: number
  unite?: string
  vide?: string
  afficherValeurs?: boolean
}) {
  const geo = geometrie(hauteur, 54, margeBasPourLabels(donnees.map(d => d.label)))
  const info = useInfobulle()
  const [actif, setActif] = useState<number | null>(null)

  const max = useMemo(() => {
    if (donnees.length === 0) return 0
    return Math.max(
      ...donnees.map(d =>
        empile
          ? series.reduce((a, s) => a + Math.max(0, d.valeurs[s.cle] ?? 0), 0)
          : Math.max(...series.map(s => Math.max(0, d.valeurs[s.cle] ?? 0))),
      ),
    )
  }, [donnees, series, empile])

  if (donnees.length === 0 || max <= 0) return <GraphiqueVide message={vide} />

  const ticks = graduations(max)
  const plafond = ticks[ticks.length - 1]
  const bande = geo.aireL / donnees.length
  const largeurGroupe = bande * 0.68
  const largeurBarre = empile ? largeurGroupe : largeurGroupe / series.length
  const base = geo.haut + geo.aireH

  const description = `${titre}. ${donnees
    .map(d => `${d.label} : ${series.map(s => `${s.label} ${fmt(d.valeurs[s.cle] ?? 0)}`).join(', ')}`)
    .join(' ; ')}`

  const avecUnite = (v: number) => `${fmt(v)}${unite ? ` ${unite}` : ''}`

  const survoler = (i: number, position: { clientX: number; clientY: number }) => {
    setActif(i)
    const d = donnees[i]
    const lignes: LigneInfobulle[] = series.map(s => ({
      label: s.label,
      valeur: avecUnite(d.valeurs[s.cle] ?? 0),
      serie: s,
    }))
    if (empile) {
      lignes.push({
        label: 'Total',
        valeur: avecUnite(series.reduce((a, s) => a + Math.max(0, d.valeurs[s.cle] ?? 0), 0)),
      })
    }
    info.montrer(position, { titre: d.label, lignes })
  }
  const quitter = () => {
    setActif(null)
    info.masquer()
  }

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <Legende series={series} />
      <svg viewBox={`0 0 ${geo.largeur} ${geo.hauteur}`} role="img" aria-label={description} className="chart-svg">
        <DefsMotifs series={series} />
        <GrilleY geo={geo} ticks={ticks} max={plafond} />

        {donnees.map((d, i) => {
          const debut = geo.gauche + i * bande + (bande - largeurGroupe) / 2
          let cumul = 0
          return (
            <g key={d.cle}>
              {series.map((s, j) => {
                const valeur = Math.max(0, d.valeurs[s.cle] ?? 0)
                const h = (valeur / plafond) * geo.aireH
                const x = empile ? debut : debut + j * largeurBarre
                const y = empile ? base - cumul - h : base - h
                if (empile) cumul += h
                if (valeur === 0) return null
                return (
                  <g key={s.cle}>
                    <rect
                      x={x}
                      y={y}
                      width={Math.max(2, largeurBarre - (empile ? 0 : 2))}
                      height={Math.max(1, h)}
                      fill={remplissageSvg(s, j)}
                      rx={2}
                    />
                    {afficherValeurs && !empile && largeurBarre > 22 && (
                      <text x={x + largeurBarre / 2} y={y - 5} textAnchor="middle" className="chart-valeur">
                        {fmt(valeur)}
                      </text>
                    )}
                  </g>
                )
              })}
              {afficherValeurs && empile && (
                <text x={debut + largeurGroupe / 2} y={base - cumul - 5} textAnchor="middle" className="chart-valeur">
                  {fmt(series.reduce((a, s) => a + Math.max(0, d.valeurs[s.cle] ?? 0), 0))}
                </text>
              )}
            </g>
          )
        })}

        <ZonesSurvol
          geo={geo}
          nombre={donnees.length}
          largeur={bande}
          actif={actif}
          onSurvol={survoler}
          onSortie={quitter}
          onSelect={donnees.some(d => d.onSelect) ? i => donnees[i].onSelect?.() : undefined}
        />

        <AxeCategories
          geo={geo}
          categories={donnees.map(d => d.label)}
          bande={bande}
          onSelect={donnees.some(d => d.onSelect) ? i => donnees[i].onSelect?.() : undefined}
        />
      </svg>
      <Infobulle poignee={info.poignee} />
      <figcaption className="sr-only">{titre}</figcaption>
      <TableauAlternatif
        titre={titre}
        entetes={['Catégorie', ...series.map(s => `${s.label}${unite ? ` (${unite})` : ''}`)]}
        lignes={donnees.map(d => [d.label, ...series.map(s => d.valeurs[s.cle] ?? 0)])}
      />
    </figure>
  )
}

// ---------------------------------------------------------------------------
// Combiné colonnes + courbe
// ---------------------------------------------------------------------------

/**
 * Colonnes sur l'axe de gauche et courbe sur un second axe à droite : la forme
 * adaptée pour lire un volume et un taux sur le même territoire.
 */
export function Combo({
  titre,
  series,
  courbe,
  donnees,
  hauteur = 320,
  vide = 'Aucune donnée à représenter sur ce périmètre.',
}: {
  titre: string
  series: Serie[]
  courbe: { cle: string; label: string; couleur: string; format?: (v: number) => string; max?: number }
  donnees: PointCategorie[]
  hauteur?: number
  vide?: string
}) {
  // Marge droite élargie : l'étiquette du dernier point de la courbe
  // (« 100 % ») doit rester à l'intérieur du cadre.
  const geo = geometrie(hauteur, 54, margeBasPourLabels(donnees.map(d => d.label)), 34)
  const info = useInfobulle()
  const [actif, setActif] = useState<number | null>(null)

  const maxColonnes = useMemo(
    () =>
      donnees.length === 0
        ? 0
        : Math.max(...donnees.map(d => Math.max(...series.map(s => Math.max(0, d.valeurs[s.cle] ?? 0))))),
    [donnees, series],
  )

  if (donnees.length === 0 || maxColonnes <= 0) return <GraphiqueVide message={vide} />

  const ticks = graduations(maxColonnes)
  const plafond = ticks[ticks.length - 1]
  const plafondCourbe = courbe.max ?? Math.max(1, ...donnees.map(d => d.valeurs[courbe.cle] ?? 0))
  const bande = geo.aireL / donnees.length
  const largeurGroupe = bande * 0.64
  const largeurBarre = largeurGroupe / series.length
  const base = geo.haut + geo.aireH
  const formatCourbe = courbe.format ?? fmt

  const points = donnees.map((d, i) => {
    const valeur = d.valeurs[courbe.cle] ?? 0
    return {
      x: geo.gauche + i * bande + bande / 2,
      y: base - (valeur / plafondCourbe) * geo.aireH,
      valeur,
    }
  })

  const description = `${titre}. ${donnees
    .map(
      (d, i) =>
        `${d.label} : ${series.map(s => `${s.label} ${fmt(d.valeurs[s.cle] ?? 0)}`).join(', ')}, ${courbe.label} ${formatCourbe(points[i].valeur)}`,
    )
    .join(' ; ')}`

  const survoler = (i: number, position: { clientX: number; clientY: number }) => {
    setActif(i)
    const d = donnees[i]
    info.montrer(position, {
      titre: d.label,
      lignes: [
        ...series.map(s => ({ label: s.label, valeur: fmt(d.valeurs[s.cle] ?? 0), serie: s })),
        { label: courbe.label, valeur: formatCourbe(points[i].valeur), serie: { couleur: courbe.couleur } },
      ],
    })
  }
  const quitter = () => {
    setActif(null)
    info.masquer()
  }

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <Legende
        series={series}
        suffixe={
          <li className="legend-key">
            <span className="legend-trait" style={{ background: courbe.couleur }} aria-hidden="true" />
            {courbe.label}
          </li>
        }
      />
      <svg viewBox={`0 0 ${geo.largeur} ${geo.hauteur}`} role="img" aria-label={description} className="chart-svg">
        <DefsMotifs series={series} />
        <GrilleY geo={geo} ticks={ticks} max={plafond} />

        {donnees.map((d, i) => {
          const debut = geo.gauche + i * bande + (bande - largeurGroupe) / 2
          return (
            <g key={d.cle}>
              {series.map((s, j) => {
                const valeur = Math.max(0, d.valeurs[s.cle] ?? 0)
                const h = (valeur / plafond) * geo.aireH
                if (valeur === 0) return null
                return (
                  <rect
                    key={s.cle}
                    x={debut + j * largeurBarre}
                    y={base - h}
                    width={Math.max(2, largeurBarre - 2)}
                    height={Math.max(1, h)}
                    fill={remplissageSvg(s, j)}
                    rx={2}
                  />
                )
              })}
            </g>
          )
        })}

        <polyline
          points={points.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={courbe.couleur}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <g key={donnees[i].cle}>
            <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke={courbe.couleur} strokeWidth={2.5} />
            <text x={p.x} y={p.y - 11} textAnchor="middle" className="chart-valeur">
              {formatCourbe(p.valeur)}
            </text>
          </g>
        ))}

        <ZonesSurvol
          geo={geo}
          nombre={donnees.length}
          largeur={bande}
          actif={actif}
          onSurvol={survoler}
          onSortie={quitter}
          onSelect={donnees.some(d => d.onSelect) ? i => donnees[i].onSelect?.() : undefined}
        />

        <AxeCategories
          geo={geo}
          categories={donnees.map(d => d.label)}
          bande={bande}
          onSelect={donnees.some(d => d.onSelect) ? i => donnees[i].onSelect?.() : undefined}
        />
      </svg>
      <Infobulle poignee={info.poignee} />
      <TableauAlternatif
        titre={titre}
        entetes={['Catégorie', ...series.map(s => s.label), courbe.label]}
        lignes={donnees.map((d, i) => [
          d.label,
          ...series.map(s => d.valeurs[s.cle] ?? 0),
          formatCourbe(points[i].valeur),
        ])}
      />
    </figure>
  )
}

// ---------------------------------------------------------------------------
// Histogramme
// ---------------------------------------------------------------------------

/** Distribution d'une population en intervalles, avec repère de médiane. */
export function Histogramme({
  titre,
  classes,
  couleur = 'var(--serie-2)',
  hauteur = 280,
  libelleEffectif = 'établissements',
  repere,
  vide = 'Donnée indisponible pour construire cette distribution.',
}: {
  titre: string
  classes: ClasseHistogramme[]
  couleur?: string
  hauteur?: number
  libelleEffectif?: string
  /** Repère vertical annoté, par exemple la médiane ou une cible configurée. */
  repere?: { valeur: number; label: string }
  vide?: string
}) {
  const geo = geometrie(hauteur, 54, margeBasPourLabels(classes.map(c => c.label)))
  const info = useInfobulle()
  const [actif, setActif] = useState<number | null>(null)
  if (classes.length === 0) return <GraphiqueVide message={vide} />

  const max = Math.max(...classes.map(c => c.effectif))
  if (max <= 0) return <GraphiqueVide message={vide} />

  const ticks = graduations(max)
  const plafond = ticks[ticks.length - 1]
  const bande = geo.aireL / classes.length
  const base = geo.haut + geo.aireH
  const total = classes.reduce((a, c) => a + c.effectif, 0)

  // Position du repère : interpolée sur l'échelle des bornes basses.
  let xRepere: number | null = null
  if (repere) {
    const amplitude = classes.length > 1 ? classes[1].borneBasse - classes[0].borneBasse : 1
    const position = (repere.valeur - classes[0].borneBasse) / amplitude
    if (position >= 0 && position <= classes.length) xRepere = geo.gauche + position * bande
  }

  const description = `${titre}. ${classes.map(c => `${c.label} : ${fmt(c.effectif)} ${libelleEffectif}`).join(' ; ')}`

  const survoler = (i: number, position: { clientX: number; clientY: number }) => {
    setActif(i)
    const c = classes[i]
    info.montrer(position, {
      titre: c.label,
      lignes: [
        {
          label: libelleEffectif.charAt(0).toUpperCase() + libelleEffectif.slice(1),
          valeur: fmt(c.effectif),
          serie: { couleur },
        },
        { label: 'Part du total', valeur: fmtPct(total > 0 ? c.effectif / total : 0) },
      ],
    })
  }
  const quitter = () => {
    setActif(null)
    info.masquer()
  }

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${geo.largeur} ${geo.hauteur}`} role="img" aria-label={description} className="chart-svg">
        <GrilleY geo={geo} ticks={ticks} max={plafond} />
        {classes.map((c, i) => {
          const h = (c.effectif / plafond) * geo.aireH
          return (
            <g key={c.label}>
              <rect
                x={geo.gauche + i * bande + 1}
                y={base - h}
                width={Math.max(2, bande - 2)}
                height={Math.max(1, h)}
                fill={couleur}
                rx={2}
              />
              {c.effectif > 0 && bande > 26 && (
                <text
                  x={geo.gauche + i * bande + bande / 2}
                  y={base - h - 5}
                  textAnchor="middle"
                  className="chart-valeur"
                >
                  {fmt(c.effectif)}
                </text>
              )}
            </g>
          )
        })}

        {xRepere != null && repere && (
          <g>
            <line x1={xRepere} x2={xRepere} y1={geo.haut} y2={base} className="chart-repere" />
            <text x={xRepere + 5} y={geo.haut + 11} className="chart-repere-label">
              {repere.label}
            </text>
          </g>
        )}

        <ZonesSurvol
          geo={geo}
          nombre={classes.length}
          largeur={bande}
          actif={actif}
          onSurvol={survoler}
          onSortie={quitter}
        />

        <AxeCategories geo={geo} categories={classes.map(c => c.label)} bande={bande} />
      </svg>
      <Infobulle poignee={info.poignee} />
      <TableauAlternatif
        titre={titre}
        entetes={['Intervalle', `Nombre d’${libelleEffectif}`, 'Part']}
        lignes={classes.map(c => [c.label, c.effectif, fmtPct(total > 0 ? c.effectif / total : 0)])}
      />
    </figure>
  )
}

// ---------------------------------------------------------------------------
// Nuage de points
// ---------------------------------------------------------------------------

export interface PointNuage {
  cle: string
  label: string
  x: number
  y: number
  /** Catégorie déterminant la couleur et le symbole du point. */
  categorie: string
  onSelect?: () => void
}

export interface CategorieNuage {
  cle: string
  label: string
  couleur: string
  /** Forme du marqueur, pour rester distinguable sans la couleur. */
  forme: 'cercle' | 'carre' | 'triangle'
}

function marqueur(forme: CategorieNuage['forme'], x: number, y: number, r: number): string {
  if (forme === 'carre') return `M${x - r},${y - r} h${r * 2} v${r * 2} h${-r * 2} Z`
  if (forme === 'triangle')
    return `M${x},${y - r * 1.15} L${x + r * 1.1},${y + r * 0.85} L${x - r * 1.1},${y + r * 0.85} Z`
  return `M${x},${y - r} a${r},${r} 0 1,0 0.01,0 Z`
}

/**
 * Nuage de points : une école par point. Une droite de référence permet de lire
 * d'un coup d'œil de quel côté de la norme se situe chaque établissement.
 */
export function Nuage({
  titre,
  points,
  categories,
  axeX,
  axeY,
  reference,
  hauteur = 340,
  vide = 'Aucun établissement à représenter sur ce périmètre.',
}: {
  titre: string
  points: PointNuage[]
  categories: CategorieNuage[]
  axeX: { label: string; format?: (v: number) => string }
  axeY: { label: string; format?: (v: number) => string }
  /** Droite y = pente × x, annotée (par exemple la norme d'encadrement). */
  reference?: { pente: number; label: string }
  hauteur?: number
  vide?: string
}) {
  const geo = geometrie(hauteur, 58, 52)
  const info = useInfobulle()
  if (points.length === 0) return <GraphiqueVide message={vide} />

  const maxX = Math.max(...points.map(p => p.x), 1)
  const maxY = Math.max(...points.map(p => p.y), 1)
  const ticksX = graduations(maxX)
  const ticksY = graduations(maxY)
  const plafondX = ticksX[ticksX.length - 1]
  const plafondY = ticksY[ticksY.length - 1]

  const px = (v: number) => geo.gauche + (v / plafondX) * geo.aireL
  const py = (v: number) => geo.haut + geo.aireH - (v / plafondY) * geo.aireH
  const parCategorie = new Map(categories.map(c => [c.cle, c]))

  const survoler = (p: PointNuage, position: { clientX: number; clientY: number }) => {
    const c = parCategorie.get(p.categorie) ?? categories[0]
    info.montrer(position, {
      titre: p.label,
      lignes: [
        { label: axeX.label, valeur: (axeX.format ?? fmt)(p.x) },
        { label: axeY.label, valeur: (axeY.format ?? fmt)(p.y) },
        { label: 'Situation', valeur: c.label, serie: { couleur: c.couleur } },
      ],
    })
  }

  const description = `${titre}. ${points.length} établissements représentés. ${categories
    .map(c => `${c.label} : ${points.filter(p => p.categorie === c.cle).length}`)
    .join(' ; ')}`

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <ul className="chart-legend" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {categories.map(c => (
          <li key={c.cle} className="legend-key">
            <svg width="14" height="14" aria-hidden="true" style={{ flex: 'none' }}>
              <path d={marqueur(c.forme, 7, 7, 5)} fill={c.couleur} />
            </svg>
            {c.label}
          </li>
        ))}
        {reference && (
          <li className="legend-key">
            <span className="legend-trait legend-trait-pointille" aria-hidden="true" />
            {reference.label}
          </li>
        )}
      </ul>

      <svg viewBox={`0 0 ${geo.largeur} ${geo.hauteur}`} role="img" aria-label={description} className="chart-svg">
        <GrilleY geo={geo} ticks={ticksY} max={plafondY} format={axeY.format ?? fmt} />

        {ticksX.map(t => (
          <text key={t} x={px(t)} y={geo.haut + geo.aireH + 18} textAnchor="middle" className="chart-tick">
            {(axeX.format ?? fmt)(t)}
          </text>
        ))}

        {reference && (
          <line
            x1={px(0)}
            y1={py(0)}
            x2={px(Math.min(plafondX, plafondY / reference.pente))}
            y2={py(Math.min(plafondY, plafondX * reference.pente))}
            className="chart-reference"
          />
        )}

        {points.map(p => {
          const c = parCategorie.get(p.categorie) ?? categories[0]
          const forme = marqueur(c.forme, px(p.x), py(p.y), 4.5)
          const survol = {
            onPointerEnter: (e: { clientX: number; clientY: number }) => survoler(p, e),
            onPointerMove: (e: { clientX: number; clientY: number }) => survoler(p, e),
            onPointerLeave: info.masquer,
          }
          if (!p.onSelect)
            return (
              <path key={p.cle} d={forme} fill={c.couleur} fillOpacity={0.75} className="chart-point" {...survol} />
            )
          return (
            <path
              key={p.cle}
              d={forme}
              fill={c.couleur}
              fillOpacity={0.75}
              className="chart-point-cliquable"
              tabIndex={0}
              role="button"
              aria-label={`${p.label} — ${axeX.label} ${fmt(p.x)}, ${axeY.label} ${fmt(p.y)}`}
              {...survol}
              onFocus={e => {
                const cadre = e.currentTarget.getBoundingClientRect()
                survoler(p, { clientX: cadre.left + cadre.width / 2, clientY: cadre.top })
              }}
              onBlur={info.masquer}
              onClick={p.onSelect}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  p.onSelect?.()
                }
              }}
            />
          )
        })}

        <text x={geo.gauche + geo.aireL / 2} y={geo.hauteur - 8} textAnchor="middle" className="chart-axe-titre">
          {axeX.label}
        </text>
        <text
          x={-(geo.haut + geo.aireH / 2)}
          y={14}
          transform="rotate(-90)"
          textAnchor="middle"
          className="chart-axe-titre"
        >
          {axeY.label}
        </text>
      </svg>
      <Infobulle poignee={info.poignee} />

      <TableauAlternatif
        titre={titre}
        entetes={['Établissement', axeX.label, axeY.label, 'Situation']}
        lignes={points
          .slice()
          .sort((a, b) => b.y - a.y)
          .slice(0, 100)
          .map(p => [p.label, p.x, p.y, parCategorie.get(p.categorie)?.label ?? ''])}
      />
    </figure>
  )
}

// ---------------------------------------------------------------------------
// Aires et courbes
// ---------------------------------------------------------------------------

/**
 * Aires empilées, en escalier ou lissées, et courbes simples. Utile pour lire
 * une progression cumulée, par exemple la couverture obtenue au fil des
 * établissements traités.
 */
export function Aires({
  titre,
  series,
  donnees,
  escalier = false,
  remplir = true,
  hauteur = 300,
  formatValeur = fmt,
  vide = 'Aucune donnée à représenter sur ce périmètre.',
}: {
  titre: string
  series: Serie[]
  donnees: PointCategorie[]
  escalier?: boolean
  remplir?: boolean
  hauteur?: number
  formatValeur?: (v: number) => string
  vide?: string
}) {
  const geo = geometrie(hauteur, 54, margeBasPourLabels(donnees.map(d => d.label)))
  const info = useInfobulle()
  const [actif, setActif] = useState<number | null>(null)
  if (donnees.length < 2) return <GraphiqueVide message={vide} />

  const max = Math.max(...donnees.map(d => Math.max(...series.map(s => d.valeurs[s.cle] ?? 0))), 1)
  const ticks = graduations(max)
  const plafond = ticks[ticks.length - 1]
  const pas = geo.aireL / Math.max(1, donnees.length - 1)
  const base = geo.haut + geo.aireH

  const px = (i: number) => geo.gauche + i * pas
  const py = (v: number) => base - (v / plafond) * geo.aireH

  const chemin = (cle: string): string => {
    const pts = donnees.map((d, i) => ({ x: px(i), y: py(d.valeurs[cle] ?? 0) }))
    if (!escalier) return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    let d = `M${pts[0].x},${pts[0].y}`
    for (let i = 1; i < pts.length; i++) d += ` H${pts[i].x} V${pts[i].y}`
    return d
  }

  const description = `${titre}. ${donnees
    .map(d => `${d.label} : ${series.map(s => `${s.label} ${formatValeur(d.valeurs[s.cle] ?? 0)}`).join(', ')}`)
    .join(' ; ')}`

  const survoler = (i: number, position: { clientX: number; clientY: number }) => {
    setActif(i)
    const d = donnees[i]
    info.montrer(position, {
      titre: d.label,
      lignes: series.map(s => ({ label: s.label, valeur: formatValeur(d.valeurs[s.cle] ?? 0), serie: s })),
    })
  }
  const quitter = () => {
    setActif(null)
    info.masquer()
  }

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <Legende series={series} />
      <svg viewBox={`0 0 ${geo.largeur} ${geo.hauteur}`} role="img" aria-label={description} className="chart-svg">
        <GrilleY geo={geo} ticks={ticks} max={plafond} format={formatValeur} />
        {series.map(s => (
          <g key={s.cle}>
            {remplir && (
              <path
                d={`${chemin(s.cle)} L${px(donnees.length - 1)},${base} L${px(0)},${base} Z`}
                fill={s.couleur}
                fillOpacity={0.18}
              />
            )}
            <path d={chemin(s.cle)} fill="none" stroke={s.couleur} strokeWidth={2.5} strokeLinejoin="round" />
            {donnees.map((d, i) => (
              <circle
                key={d.cle}
                cx={px(i)}
                cy={py(d.valeurs[s.cle] ?? 0)}
                r={3}
                fill="#fff"
                stroke={s.couleur}
                strokeWidth={2}
              />
            ))}
          </g>
        ))}
        <ZonesSurvol
          geo={geo}
          nombre={donnees.length}
          largeur={pas}
          decalage={pas / 2}
          actif={actif}
          onSurvol={survoler}
          onSortie={quitter}
        />

        <AxeCategories geo={geo} categories={donnees.map(d => d.label)} bande={pas} ancrage="point" />
      </svg>
      <Infobulle poignee={info.poignee} />
      <TableauAlternatif
        titre={titre}
        entetes={['Étape', ...series.map(s => s.label)]}
        lignes={donnees.map(d => [d.label, ...series.map(s => formatValeur(d.valeurs[s.cle] ?? 0))])}
      />
    </figure>
  )
}
