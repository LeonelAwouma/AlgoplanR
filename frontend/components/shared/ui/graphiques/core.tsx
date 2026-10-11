'use client'

/**
 * Socle commun des graphiques : échelles, grille, axes, légende et alternative
 * textuelle.
 *
 * Tout est écrit en SVG dans l'application. Aucune bibliothèque de
 * visualisation n'est utilisée : les suites hébergées (Google Charts et
 * équivalentes) chargent leur code depuis un serveur distant à l'exécution,
 * ce qui est incompatible avec une application de bureau fonctionnant sans
 * connexion.
 */

import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { graduations } from '@shared/kernel'
import { fmt } from '@shared/ui/commun'

export { graduations }

/** Géométrie d'un graphique cartésien, en unités du `viewBox`. */
export interface Geometrie {
  largeur: number
  hauteur: number
  gauche: number
  droite: number
  haut: number
  bas: number
  aireL: number
  aireH: number
}

export function geometrie(hauteur: number, margeGauche = 54, margeBas = 48, margeDroite = 16): Geometrie {
  const largeur = 760
  const droite = margeDroite
  const haut = 18
  return {
    largeur,
    hauteur,
    gauche: margeGauche,
    droite,
    haut,
    bas: margeBas,
    aireL: largeur - margeGauche - droite,
    aireH: hauteur - haut - margeBas,
  }
}

/** Palette de séries : lisible en couleur comme en niveaux de gris. */
export interface Serie {
  cle: string
  label: string
  couleur: string
  /** Motif optionnel, pour distinguer les séries sans recourir à la couleur. */
  motif?: 'plein' | 'hachures' | 'points'
}

const ID_MOTIF = { hachures: 'motif-hachures', points: 'motif-points' } as const

/** Remplissage SVG d'une série : couleur unie, ou motif référencé. */
export function remplissageSvg(serie: Pick<Serie, 'couleur' | 'motif'>, index: number): string {
  if (!serie.motif || serie.motif === 'plein') return serie.couleur
  return `url(#${ID_MOTIF[serie.motif]}-${index})`
}

/** Remplissage CSS équivalent, pour les pastilles de légende en HTML. */
export function remplissageCss(serie: Pick<Serie, 'couleur' | 'motif'>): string {
  if (!serie.motif || serie.motif === 'plein') return serie.couleur
  if (serie.motif === 'hachures') {
    return `repeating-linear-gradient(45deg, ${serie.couleur}, ${serie.couleur} 4px, rgba(255,255,255,.55) 4px, rgba(255,255,255,.55) 7px)`
  }
  return `radial-gradient(circle at 2px 2px, rgba(255,255,255,.7) 1.2px, ${serie.couleur} 1.3px) 0 0 / 6px 6px`
}

/** Définitions des motifs, montées une fois par graphique. */
export function DefsMotifs({ series }: { series: Serie[] }) {
  return (
    <defs>
      {series.map((s, i) =>
        s.motif === 'hachures' ? (
          <pattern
            key={s.cle}
            id={`motif-hachures-${i}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill={s.couleur} />
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,.6)" strokeWidth="3" />
          </pattern>
        ) : s.motif === 'points' ? (
          <pattern key={s.cle} id={`motif-points-${i}`} width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill={s.couleur} />
            <circle cx="3" cy="3" r="1.4" fill="rgba(255,255,255,.7)" />
          </pattern>
        ) : null,
      )}
    </defs>
  )
}

export function Legende({ series, suffixe }: { series: Serie[]; suffixe?: ReactNode }) {
  return (
    <ul className="chart-legend" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {series.map(s => (
        <li key={s.cle} className="legend-key">
          <span className="legend-swatch" style={{ background: remplissageCss(s) }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
      {suffixe}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Infobulle au survol
// ---------------------------------------------------------------------------

export interface LigneInfobulle {
  label: string
  valeur: string
  /** Couleur et motif de la série, pour relier la ligne à la légende. */
  serie?: Pick<Serie, 'couleur' | 'motif'>
}

export interface ContenuInfobulle {
  titre: string
  sousTitre?: string
  lignes: LigneInfobulle[]
}

/** Position du pointeur, seule information nécessaire pour placer l'infobulle. */
export interface PositionPointeur {
  clientX: number
  clientY: number
}

export interface PoigneeInfobulle {
  montrer: (position: PositionPointeur, contenu: ContenuInfobulle) => void
  masquer: () => void
}

interface EtatInfobulle {
  x: number
  y: number
  aGauche: boolean
  dessous: boolean
  contenu: ContenuInfobulle
}

/**
 * Infobulle des graphiques. L'état vit ici et non dans le graphique : suivre le
 * pointeur ne redessine donc pas les centaines de repères d'un nuage de points.
 * Elle se place dans le conteneur du graphique, qui doit être en `position:
 * relative`, et se positionne à côté du pointeur en restant dans le cadre.
 * Elle est masquée aux lecteurs d'écran : l'alternative textuelle du graphique
 * et son tableau portent déjà les mêmes valeurs.
 */
export function Infobulle({ poignee }: { poignee: Ref<PoigneeInfobulle> }) {
  const racine = useRef<HTMLDivElement>(null)
  const [etat, setEtat] = useState<EtatInfobulle | null>(null)

  useImperativeHandle(
    poignee,
    () => ({
      montrer(position, contenu) {
        const cadre = racine.current?.parentElement?.getBoundingClientRect()
        if (!cadre) return
        const x = position.clientX - cadre.left
        const y = position.clientY - cadre.top
        setEtat({ x, y, aGauche: x > cadre.width * 0.55, dessous: y < 110, contenu })
      },
      masquer() {
        setEtat(null)
      },
    }),
    [],
  )

  return (
    <div
      ref={racine}
      className="chart-tooltip"
      aria-hidden="true"
      hidden={!etat}
      style={
        etat
          ? {
              left: etat.x,
              top: etat.y,
              transform: `translate(${etat.aGauche ? 'calc(-100% - 14px)' : '14px'}, ${etat.dessous ? '16px' : 'calc(-100% - 12px)'})`,
            }
          : undefined
      }
    >
      {etat && (
        <>
          <p className="chart-tooltip-titre">{etat.contenu.titre}</p>
          {etat.contenu.sousTitre && <p className="chart-tooltip-sous">{etat.contenu.sousTitre}</p>}
          <ul>
            {etat.contenu.lignes.map(l => (
              <li key={l.label}>
                {l.serie && <span className="legend-swatch" style={{ background: remplissageCss(l.serie) }} />}
                <span className="chart-tooltip-label">{l.label}</span>
                <b>{l.valeur}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Raccourci : la poignée à donner à `<Infobulle poignee={…} />` et ses deux commandes. */
export function useInfobulle() {
  const poignee = useRef<PoigneeInfobulle>(null)
  return {
    poignee,
    montrer: (position: PositionPointeur, contenu: ContenuInfobulle) => poignee.current?.montrer(position, contenu),
    masquer: () => poignee.current?.masquer(),
  }
}

/**
 * Une zone de survol par catégorie, sur toute la hauteur de l'aire de tracé :
 * survoler une colonne, l'espace au-dessus d'elle ou le point d'une courbe
 * suffit, sans avoir à viser une barre de quelques pixels. La zone active est
 * légèrement teintée pour montrer de quelle catégorie parle l'infobulle.
 */
export function ZonesSurvol({
  geo,
  nombre,
  largeur,
  decalage = 0,
  actif,
  onSurvol,
  onSortie,
  onSelect,
}: {
  geo: Geometrie
  nombre: number
  /** Largeur d'une zone, en unités du `viewBox`. */
  largeur: number
  /** Décalage vers la gauche, pour centrer les zones sur des points plutôt que sur des bandes. */
  decalage?: number
  actif: number | null
  onSurvol: (index: number, position: PositionPointeur) => void
  onSortie: () => void
  onSelect?: (index: number) => void
}) {
  const xMin = geo.gauche
  const xMax = geo.gauche + geo.aireL
  return (
    <g>
      {Array.from({ length: nombre }, (_, i) => {
        const debut = Math.max(xMin, geo.gauche + i * largeur - decalage)
        const fin = Math.min(xMax, geo.gauche + (i + 1) * largeur - decalage)
        return (
          <rect
            key={i}
            x={debut}
            y={geo.haut}
            width={Math.max(0, fin - debut)}
            height={geo.aireH}
            fill="var(--primary)"
            fillOpacity={actif === i ? 0.08 : 0}
            className={onSelect ? 'chart-zone chart-zone-cliquable' : 'chart-zone'}
            onPointerEnter={e => onSurvol(i, e)}
            onPointerMove={e => onSurvol(i, e)}
            onPointerLeave={onSortie}
            onClick={onSelect ? () => onSelect(i) : undefined}
          />
        )
      })}
    </g>
  )
}

/** Grille horizontale et axe des ordonnées. */
export function GrilleY({
  geo,
  ticks,
  max,
  format = fmt,
}: {
  geo: Geometrie
  ticks: number[]
  max: number
  format?: (v: number) => string
}) {
  return (
    <g>
      {ticks.map(t => {
        const y = geo.haut + geo.aireH - (t / max) * geo.aireH
        return (
          <g key={t}>
            <line
              x1={geo.gauche}
              x2={geo.gauche + geo.aireL}
              y1={y}
              y2={y}
              className={t === 0 ? 'chart-axe' : 'chart-grille'}
            />
            <text x={geo.gauche - 8} y={y + 4} textAnchor="end" className="chart-tick">
              {format(t)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/**
 * Les libellés courts tiennent sur une ligne, les libellés longs sont coupés en
 * deux quand les catégories sont peu nombreuses, et inclinés au-delà.
 */
export function libellesSurDeuxLignes(categories: string[]): boolean {
  return categories.length <= 6 && categories.some(c => c.length > 12)
}

/** Marge basse nécessaire pour que les libellés ne soient jamais coupés. */
export function margeBasPourLabels(categories: string[]): number {
  if (categories.length === 0) return 36
  if (libellesSurDeuxLignes(categories)) return 54
  const incliner = categories.length > 6 || categories.some(c => c.length > 10)
  if (!incliner) return 40
  const plusLong = Math.min(22, Math.max(...categories.map(c => c.length)))
  // 32° d'inclinaison : la hauteur occupée croît avec la longueur du texte.
  return Math.round(30 + plusLong * 3.2)
}

/** Coupe un libellé en deux lignes équilibrées, sur un séparateur de mots. */
function couperEnDeux(texte: string): [string, string] {
  const milieu = Math.floor(texte.length / 2)
  let coupure = -1
  for (let i = 0; i < texte.length; i++) {
    if (texte[i] === ' ' && (coupure === -1 || Math.abs(i - milieu) < Math.abs(coupure - milieu))) coupure = i
  }
  if (coupure === -1) return [texte, '']
  return [texte.slice(0, coupure), texte.slice(coupure + 1)]
}

/** Libellés de catégories sous l'axe. */
export function AxeCategories({
  geo,
  categories,
  bande,
  onSelect,
  ancrage = 'bande',
}: {
  geo: Geometrie
  categories: string[]
  bande: number
  onSelect?: (index: number) => void
  /** « bande » centre sous la colonne, « point » aligne sur le point de la courbe. */
  ancrage?: 'bande' | 'point'
}) {
  const deuxLignes = libellesSurDeuxLignes(categories)
  const incliner = !deuxLignes && (categories.length > 6 || categories.some(c => c.length > 10))
  return (
    <g>
      {categories.map((c, i) => {
        const x = geo.gauche + i * bande + (ancrage === 'bande' ? bande / 2 : 0)
        const y = geo.haut + geo.aireH + (incliner ? 14 : 18)
        const abrege = c.length > 26 ? `${c.slice(0, 25)}…` : c
        const [ligne1, ligne2] = deuxLignes ? couperEnDeux(abrege) : [abrege, '']
        const contenu = (
          <text
            x={x}
            y={y}
            textAnchor={incliner ? 'end' : 'middle'}
            transform={incliner ? `rotate(-32 ${x} ${y})` : undefined}
            className={onSelect ? 'chart-categorie chart-cliquable' : 'chart-categorie'}
          >
            {ligne2 ? (
              <>
                <tspan x={x} dy={0}>
                  {ligne1}
                </tspan>
                <tspan x={x} dy={14}>
                  {ligne2}
                </tspan>
              </>
            ) : (
              ligne1
            )}
          </text>
        )
        if (!onSelect) return <g key={`${c}-${i}`}>{contenu}</g>
        return (
          <g
            key={`${c}-${i}`}
            role="button"
            tabIndex={0}
            aria-label={`Explorer ${c}`}
            onClick={() => onSelect(i)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(i)
              }
            }}
          >
            {contenu}
          </g>
        )
      })}
    </g>
  )
}

/**
 * Alternative textuelle obligatoire : les mêmes valeurs sous forme de tableau,
 * dépliable sous chaque graphique.
 */
export function TableauAlternatif({
  titre,
  entetes,
  lignes,
}: {
  titre: string
  entetes: string[]
  lignes: (string | number)[][]
}) {
  return (
    <details className="advanced">
      <summary>Afficher les données du graphique sous forme de tableau</summary>
      <div className="table-scroll" style={{ maxHeight: 320 }}>
        <table className="data">
          <caption className="sr-only">{titre}</caption>
          <thead>
            <tr>
              {entetes.map((e, i) => (
                <th key={e} scope="col" className={i === 0 ? undefined : 'num'}>
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i}>
                {l.map((c, j) =>
                  j === 0 ? (
                    <th
                      key={j}
                      scope="row"
                      style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12.5, fontWeight: 600 }}
                    >
                      {c}
                    </th>
                  ) : (
                    <td key={j} className="num">
                      {typeof c === 'number' ? fmt(c) : c}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

/** Message affiché à la place d'un graphique sans donnée à représenter. */
export function GraphiqueVide({ message }: { message: string }) {
  return <p className="chart-vide">{message}</p>
}
