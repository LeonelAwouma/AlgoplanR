'use client'

/**
 * Composants d'interface réutilisables : panneaux, indicateurs, pastilles,
 * notices, états vides et tableau de données.
 *
 * Règle appliquée partout : aucune information n'est portée par la seule
 * couleur. Chaque état a un libellé textuel, une icône ou une forme, et la
 * valeur chiffrée reste toujours lisible.
 */

import { useId, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Database,
  Info,
  ShieldAlert,
  Upload,
} from 'lucide-react'
import type { ZoneSecurite } from '@shared/api'
import { libelleZoneSecurite } from '@shared/kernel'

const LIBELLE_COURT_ZONE_SECURITE: Record<ZoneSecurite, string> = { verte: 'Verte', jaune: 'Jaune', rouge: 'Rouge' }

const nf = new Intl.NumberFormat('fr-FR')

/** Formate un entier ; « — » quand la valeur n'est pas disponible. */
export function fmt(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '—' : nf.format(Math.round(v))
}

/** Formate un nombre décimal ; « — » quand la valeur n'est pas disponible. */
export function fmtDec(v: number | null | undefined, decimales = 1): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

/** Formate un taux de 0 à 1 en pourcentage entier. */
export function fmtPct(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '—' : `${Math.round(v * 100)} %`
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'alert' | 'info'

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

/**
 * Zone de sécurité d'une école : pastille verte, jaune ou rouge, toujours
 * accompagnée de son libellé. L'infobulle rappelle les points de sécurité que le
 * calcul ajoute au poids de vulnérabilité, et la règle propre à la zone rouge.
 */
export function ZoneSecuritePill({
  zone,
  points,
  court = false,
}: {
  zone: ZoneSecurite | null
  /** Points de sécurité retenus par le référentiel pour cette zone. */
  points?: number
  /** Affiche « Verte », « Jaune », « Rouge » au lieu de « Zone verte »… */
  court?: boolean
}) {
  const effective = zone ?? 'verte'
  const libelle = court ? LIBELLE_COURT_ZONE_SECURITE[effective] : libelleZoneSecurite(zone)
  const details = [
    points != null ? `${points} point(s) de sécurité dans le poids w` : null,
    effective === 'rouge' ? 'aucun poste imposé ni proposé hors vœux' : null,
    zone === null ? 'zone non renseignée, comptée en zone verte' : null,
  ].filter(Boolean)
  return (
    <span
      className={`zone-securite zone-securite-${effective}${zone === null ? ' zone-securite-defaut' : ''}`}
      title={details.length > 0 ? `${libelleZoneSecurite(zone)} : ${details.join(' ; ')}` : undefined}
    >
      <span className="zone-securite-point" aria-hidden="true" />
      {libelle}
    </span>
  )
}

export function Panel({
  title,
  kicker,
  hint,
  actions,
  children,
  flush,
  id,
}: {
  title?: string
  kicker?: string
  hint?: string
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
  id?: string
}) {
  return (
    <section
      className={flush ? 'panel panel-flush' : 'panel'}
      id={id}
      aria-labelledby={title && id ? `${id}-title` : undefined}
    >
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {kicker && <p className="eyebrow">{kicker}</p>}
            {title && <h2 id={id ? `${id}-title` : undefined}>{title}</h2>}
            {hint && <p className="hint">{hint}</p>}
          </div>
          {actions && <div className="topbar-actions no-print">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'alert' | 'neutral'
  title?: string
  children: ReactNode
}) {
  const Icone = tone === 'alert' ? ShieldAlert : tone === 'warn' ? AlertTriangle : Info
  return (
    <div className={`notice notice-${tone}`} role={tone === 'alert' ? 'alert' : undefined}>
      <Icone size={17} aria-hidden="true" />
      <p>
        {title && <strong>{title} </strong>}
        {children}
      </p>
    </div>
  )
}

/** Indicateur clé : libellé simple, valeur, courte explication et lien de détail. */
export function KpiCard({
  label,
  value,
  hint,
  lien,
  onClick,
  tone,
}: {
  label: string
  value: string
  hint: string
  lien?: string
  onClick?: () => void
  tone?: 'ok' | 'warn' | 'alert' | 'info'
}) {
  const classe = `kpi${tone ? ` kpi-tone-${tone}` : ''}`
  const contenu = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value metric-value">{value}</span>
      <span className="kpi-hint">{hint}</span>
      {lien && (
        <span className="kpi-link">
          {lien} <ArrowRight size={13} aria-hidden="true" />
        </span>
      )}
    </>
  )
  if (!onClick) return <div className={classe}>{contenu}</div>
  return (
    <button type="button" className={classe} onClick={onClick}>
      {contenu}
    </button>
  )
}

export function EmptyState({
  titre,
  children,
  action,
}: {
  titre: string
  children: ReactNode
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        <Database size={22} />
      </div>
      <h3>{titre}</h3>
      <p>{children}</p>
      {action && (
        <button type="button" className="btn btn-primary" onClick={action.onClick}>
          <Upload size={15} aria-hidden="true" /> {action.label}
        </button>
      )}
    </div>
  )
}

/** Champ de recherche accessible, avec libellé explicite. */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  placeholder?: string
}) {
  const id = useId()
  return (
    <div className="field field-recherche">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="search" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

// --- Tableau de données ----------------------------------------------------

export interface Colonne<T> {
  cle: string
  entete: string
  /** Rendu de la cellule. */
  rendu: (ligne: T) => ReactNode
  /** Valeur utilisée pour le tri ; la colonne n'est triable que si elle est fournie. */
  tri?: (ligne: T) => number | string
  numerique?: boolean
  /** Largeur indicative en pixels. */
  largeur?: number
}

/**
 * Tableau paginé et triable. La pagination évite de monter des dizaines de
 * milliers de lignes dans le DOM ; l'en-tête reste visible au défilement et
 * annonce l'ordre de tri aux lecteurs d'écran.
 */
export function DataTable<T>({
  lignes,
  colonnes,
  cle,
  taillePage = 50,
  messageVide = 'Aucune ligne ne correspond à cette recherche.',
  legende,
}: {
  lignes: T[]
  colonnes: Colonne<T>[]
  cle: (ligne: T) => string
  taillePage?: number
  messageVide?: string
  legende?: string
}) {
  const [triCle, setTriCle] = useState<string | null>(null)
  const [triSens, setTriSens] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)

  const triees = useMemo(() => {
    if (!triCle) return lignes
    const colonne = colonnes.find(c => c.cle === triCle)
    if (!colonne?.tri) return lignes
    const extraire = colonne.tri
    return [...lignes].sort((a, b) => {
      const va = extraire(a)
      const vb = extraire(b)
      const ordre =
        typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr')
      return triSens === 'asc' ? ordre : -ordre
    })
  }, [lignes, colonnes, triCle, triSens])

  const nbPages = Math.max(1, Math.ceil(triees.length / taillePage))
  const pageSure = Math.min(page, nbPages - 1)
  const visibles = triees.slice(pageSure * taillePage, pageSure * taillePage + taillePage)

  function basculerTri(colonne: Colonne<T>) {
    if (!colonne.tri) return
    if (triCle === colonne.cle) setTriSens(s => (s === 'asc' ? 'desc' : 'asc'))
    else {
      setTriCle(colonne.cle)
      setTriSens('desc')
    }
    setPage(0)
  }

  return (
    <>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={legende ?? 'Tableau de données'}>
        <table className="data">
          {legende && <caption className="sr-only">{legende}</caption>}
          <thead>
            <tr>
              {colonnes.map(c => {
                const actif = triCle === c.cle
                const aria = !c.tri ? undefined : actif ? (triSens === 'asc' ? 'ascending' : 'descending') : 'none'
                return (
                  <th
                    key={c.cle}
                    className={c.numerique ? 'num' : undefined}
                    aria-sort={aria}
                    style={c.largeur ? { width: c.largeur } : undefined}
                  >
                    {c.tri ? (
                      <button type="button" onClick={() => basculerTri(c)}>
                        {c.entete}
                        {actif ? (
                          triSens === 'asc' ? (
                            <ChevronUp size={12} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={12} aria-hidden="true" />
                          )
                        ) : null}
                      </button>
                    ) : (
                      c.entete
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td className="table-empty" colSpan={colonnes.length}>
                  {messageVide}
                </td>
              </tr>
            ) : (
              visibles.map(ligne => (
                <tr key={cle(ligne)}>
                  {colonnes.map(c => (
                    <td key={c.cle} className={c.numerique ? 'num' : undefined}>
                      {c.rendu(ligne)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span>
          {triees.length === 0
            ? 'Aucune ligne'
            : `Lignes ${fmt(pageSure * taillePage + 1)} à ${fmt(Math.min(triees.length, (pageSure + 1) * taillePage))} sur ${fmt(triees.length)}`}
        </span>
        {nbPages > 1 && (
          <div className="pager">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={pageSure === 0}
            >
              <ChevronLeft size={13} aria-hidden="true" /> Précédent
            </button>
            <span>
              Page {pageSure + 1} / {nbPages}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setPage(p => Math.min(nbPages - 1, p + 1))}
              disabled={pageSure >= nbPages - 1}
            >
              Suivant <ChevronRight size={13} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </>
  )
}

/** Variation chiffrée entre deux valeurs, avec sens explicite et pas seulement une couleur. */
export function Delta({
  avant,
  apres,
  sensFavorable = 'baisse',
}: {
  avant: number
  apres: number
  sensFavorable?: 'baisse' | 'hausse'
}) {
  const delta = apres - avant
  if (delta === 0) return <span className="delta delta-flat">= 0 (inchangé)</span>
  const favorable = sensFavorable === 'baisse' ? delta < 0 : delta > 0
  const relatif = avant > 0 ? ` (${delta > 0 ? '+' : ''}${Math.round((delta / avant) * 100)} %)` : ''
  return (
    <span className={`delta ${favorable ? 'delta-down' : 'delta-up'}`}>
      {delta > 0 ? '▲' : '▼'} {delta > 0 ? '+' : ''}
      {fmt(delta)}
      {relatif}
    </span>
  )
}
