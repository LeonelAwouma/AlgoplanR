'use client'

/**
 * Visualisation cartographique des territoires.
 *
 * Le fond de carte provient d'un fichier GeoJSON déposé localement dans
 * `public/geo/` : aucune tuile distante, aucun service en ligne. Si le fichier
 * du niveau demandé n'est pas présent, la carte laisse la place à une grille de
 * territoires qui porte exactement les mêmes valeurs, et l'explique clairement
 * plutôt que d'afficher des contours inventés.
 *
 * Trois niveaux sont gérés : les régions au niveau national, les départements
 * une fois une région sélectionnée, puis les communes (arrondissements) une fois
 * un département sélectionné. Les fichiers des départements et des
 * arrondissements ne portant pas de rattachement au niveau supérieur, ce sont
 * les données importées qui déterminent quelles entités appartiennent au
 * territoire affiché.
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, MapPinned } from 'lucide-react'
import type { TerritorialSummary } from '@shared/api'
import {
  CHEMIN_GEOJSON_ARRONDISSEMENTS,
  CHEMIN_GEOJSON_DEPARTEMENTS,
  CHEMIN_GEOJSON_REGIONS,
  anneaux,
  apparierFeatures,
  boiteEnglobante,
  chargerGeoJson,
  type GeoFeatureCollection,
} from './cameroun'
import { fmt, fmtDec, Pill } from '@shared/ui/commun'
import { Infobulle, useInfobulle } from '@shared/ui/graphiques/core'

export type IndicateurCarte =
  'ecolesEnDeficit' | 'postesNecessaires' | 'tauxCouverture' | 'besoinResiduel' | 'soldeMouvements' | 'pressionEleves'

export const INDICATEURS_CARTE: { cle: IndicateurCarte; label: string; unite: string; sensFort: 'haut' | 'bas' }[] = [
  { cle: 'postesNecessaires', label: 'Nombre de postes nécessaires', unite: 'postes', sensFort: 'haut' },
  { cle: 'ecolesEnDeficit', label: 'Nombre d’écoles en déficit', unite: 'écoles', sensFort: 'haut' },
  { cle: 'tauxCouverture', label: 'Taux de couverture par redéploiement', unite: '%', sensFort: 'bas' },
  { cle: 'besoinResiduel', label: 'Besoin résiduel après simulation', unite: 'postes', sensFort: 'haut' },
  { cle: 'soldeMouvements', label: 'Solde des mouvements (reçus − cédés)', unite: 'enseignants', sensFort: 'bas' },
  { cle: 'pressionEleves', label: 'Élèves par enseignant État', unite: 'élèves', sensFort: 'haut' },
]

/** Valeurs de simulation d'un territoire, dans les deux sens de circulation. */
export interface StatsTerritoire {
  besoin: number
  couverts: number
  residuel: number
  recus: number
  sortants: number
  solde: number
}

export type NiveauCarte = 'region' | 'departement' | 'commune'

const CHEMINS_GEO: Record<NiveauCarte, string> = {
  region: CHEMIN_GEOJSON_REGIONS,
  departement: CHEMIN_GEOJSON_DEPARTEMENTS,
  commune: CHEMIN_GEOJSON_ARRONDISSEMENTS,
}
const FICHIERS_GEO: Record<NiveauCarte, string> = {
  region: 'cameroun-regions.geojson',
  departement: 'cameroun-departements.geojson',
  commune: 'cameroun-arrondissements.geojson',
}
const PLURIEL: Record<NiveauCarte, string> = { region: 'régions', departement: 'départements', commune: 'communes' }
const DEFINI: Record<NiveauCarte, string> = {
  region: 'la région',
  departement: 'le département',
  commune: 'la commune',
}

/** Situation d'un territoire : 0 tout va bien, 1 nécessite l'attention, 2 critique. */
type Classe = 0 | 1 | 2

/** Les trois classes, aux couleurs du drapeau camerounais. */
const CLASSES: { couleur: string; libelle: string }[] = [
  { couleur: 'var(--carte-bien)', libelle: 'Tout va bien' },
  { couleur: 'var(--carte-attention)', libelle: 'Nécessite l’attention' },
  { couleur: 'var(--carte-critique)', libelle: 'Situation critique' },
]

function valeurDe(
  noeud: TerritorialSummary,
  indicateur: IndicateurCarte,
  stats: Map<string, StatsTerritoire>,
): number | null {
  const s = stats.get(noeud.territory.nom)
  switch (indicateur) {
    case 'ecolesEnDeficit':
      return noeud.totals.ecolesEnDeficit
    case 'postesNecessaires':
      return noeud.totals.postesNecessaires
    case 'pressionEleves':
      return noeud.totals.elevesParEnseignantEtat
    case 'tauxCouverture':
      return s && s.besoin > 0 ? (s.couverts / s.besoin) * 100 : null
    case 'besoinResiduel':
      return s ? s.residuel : null
    case 'soldeMouvements':
      return s ? s.solde : null
    default:
      return null
  }
}

/** Seuils par terciles : trois tranches d'effectif comparable, documentées en légende. */
function seuils(valeurs: number[]): number[] {
  const tri = [...valeurs].sort((a, b) => a - b)
  if (tri.length === 0) return [0, 0]
  const q = (p: number) => tri[Math.min(tri.length - 1, Math.floor(p * tri.length))]
  return [q(1 / 3), q(2 / 3)]
}

/** Tranche de valeurs (0 la plus basse) qui correspond à une classe, selon le sens de l'indicateur. */
function trancheDe(classe: Classe, sensFort: 'haut' | 'bas'): Classe {
  return sensFort === 'haut' ? classe : ((2 - classe) as Classe)
}

/**
 * Classe d'un territoire. Quand une valeur forte est défavorable (postes
 * nécessaires, écoles en déficit…), un territoire sans aucun besoin est
 * toujours « tout va bien », même s'il tombe dans la tranche du milieu.
 */
function classeDe(valeur: number, bornes: number[], sensFort: 'haut' | 'bas'): Classe {
  if (sensFort === 'haut' && valeur <= 0) return 0
  const tranche: Classe = valeur <= bornes[0] ? 0 : valeur <= bornes[1] ? 1 : 2
  return trancheDe(tranche, sensFort)
}

export function CameroonMap({
  niveau,
  territoires,
  indicateur,
  onIndicateurChange,
  stats,
  onExplorer,
  selection,
}: {
  niveau: NiveauCarte
  territoires: TerritorialSummary[]
  indicateur: IndicateurCarte
  onIndicateurChange: (i: IndicateurCarte) => void
  stats: Map<string, StatsTerritoire>
  onExplorer: (nom: string) => void
  selection: string | null
}) {
  const chemin = CHEMINS_GEO[niveau]

  // Fond de carte et territoire survolé sont rattachés au fichier dont ils
  // proviennent : changer de niveau les invalide sans effet supplémentaire.
  const [charge, setCharge] = useState<{ chemin: string; geo: GeoFeatureCollection | null } | null>(null)
  const [survole, setSurvole] = useState<{ chemin: string; nom: string | null } | null>(null)
  const chargement = charge?.chemin !== chemin
  const geo = chargement ? null : charge.geo
  const survol = survole?.chemin === chemin ? survole.nom : null
  const setSurvol = (nom: string | null) => setSurvole({ chemin, nom })

  useEffect(() => {
    let actif = true
    chargerGeoJson(chemin).then(donnees => {
      if (actif) setCharge({ chemin, geo: donnees })
    })
    return () => {
      actif = false
    }
  }, [chemin])

  const definition = INDICATEURS_CARTE.find(i => i.cle === indicateur) ?? INDICATEURS_CARTE[0]

  const { valeurs, bornes } = useMemo(() => {
    const paires = new Map<string, number>()
    for (const t of territoires) {
      const v = valeurDe(t, indicateur, stats)
      if (v != null) paires.set(t.territory.nom, v)
    }
    return { valeurs: paires, bornes: seuils([...paires.values()]) }
  }, [territoires, indicateur, stats])

  /** Entités du fond de carte appariées aux territoires réellement présents dans les données. */
  const appariees = useMemo(() => {
    if (!geo) return []
    const noms = territoires.map(t => t.territory.nom)
    const toutes = apparierFeatures(geo.features, noms)
    // Sous le niveau régional, on ne dessine que les entités du territoire
    // affiché : sinon la carte couvrirait tout le pays pour une seule région.
    return niveau !== 'region' ? toutes.filter(a => a.territoire !== null) : toutes
  }, [geo, territoires, niveau])

  const nonApparies = useMemo(() => {
    const dessines = new Set(appariees.map(a => a.territoire).filter((n): n is string => n !== null))
    return territoires.filter(t => !dessines.has(t.territory.nom)).map(t => t.territory.nom)
  }, [appariees, territoires])

  const couleurDe = (nom: string): string => {
    const v = valeurs.get(nom)
    if (v == null) return 'var(--carte-vide)'
    return CLASSES[classeDe(v, bornes, definition.sensFort)].couleur
  }

  const formate = (nom: string): string => {
    const v = valeurs.get(nom)
    if (v == null) return 'Non calculable'
    if (definition.unite === '%') return `${Math.round(v)} %`
    const prefixe = definition.cle === 'soldeMouvements' && v > 0 ? '+' : ''
    return `${prefixe}${fmtDec(v, definition.cle === 'pressionEleves' ? 1 : 0)} ${definition.unite}`
  }

  const detail = territoires.find(t => t.territory.nom === (survol ?? selection))
  const carteDisponible = geo !== null && appariees.some(a => a.territoire !== null)

  return (
    <div className="stack">
      <div className="field" style={{ maxWidth: 400 }}>
        <label htmlFor="carte-indicateur">Indicateur représenté sur la carte</label>
        <select
          id="carte-indicateur"
          value={indicateur}
          onChange={e => onIndicateurChange(e.target.value as IndicateurCarte)}
        >
          {INDICATEURS_CARTE.map(i => (
            <option key={i.cle} value={i.cle}>
              {i.label}
            </option>
          ))}
        </select>
      </div>

      <div className="map-wrap">
        <div className="stack-tight">
          {chargement ? (
            <p className="hint">Chargement du fond de carte…</p>
          ) : carteDisponible ? (
            <>
              <FondCarte
                appariees={appariees}
                couleurDe={couleurDe}
                formate={formate}
                libelleIndicateur={definition.label}
                onSurvol={setSurvol}
                onExplorer={onExplorer}
                selection={selection}
                niveau={niveau}
              />
              {nonApparies.length > 0 && (
                <p className="hint">
                  {nonApparies.length} territoire(s) des données ne correspondent à aucune entité du fond de carte et ne
                  sont donc pas dessinés : {nonApparies.slice(0, 6).join(', ')}
                  {nonApparies.length > 6 ? '…' : ''}. Leurs valeurs restent comptées dans tous les indicateurs.
                </p>
              )}
            </>
          ) : (
            <GrilleTerritoires
              territoires={territoires}
              couleurDe={couleurDe}
              formate={formate}
              onExplorer={onExplorer}
              selection={selection}
              niveau={niveau}
              fichierAbsent={geo === null}
            />
          )}
        </div>

        <div className="stack-tight">
          <div className="panel" style={{ padding: 14 }}>
            <h3>Légende</h3>
            <p className="hint" style={{ marginBottom: 8 }}>
              Couleurs du drapeau : trois classes d’effectif comparable (terciles des valeurs observées sur ce
              périmètre).
            </p>
            <div className="map-scale">
              {CLASSES.map((classe, i) => {
                const tranche = trancheDe(i as Classe, definition.sensFort)
                const plage =
                  tranche === 0
                    ? `≤ ${fmtDec(bornes[0], 0)}`
                    : tranche === 1
                      ? `${fmtDec(bornes[0], 0)} – ${fmtDec(bornes[1], 0)}`
                      : `> ${fmtDec(bornes[1], 0)}`
                return (
                  <div className="map-scale-item" key={classe.libelle}>
                    <span className="legend-swatch" style={{ background: classe.couleur }} aria-hidden="true" />
                    <span>
                      <b>{classe.libelle}</b> — {plage} {definition.unite}
                    </span>
                  </div>
                )
              })}
              <div className="map-scale-item">
                <span className="legend-swatch" style={{ background: 'var(--carte-vide)' }} aria-hidden="true" />
                <span>Non calculable sur ce périmètre</span>
              </div>
            </div>
          </div>

          {detail && (
            <DetailTerritoire
              noeud={detail}
              stats={stats.get(detail.territory.nom)}
              onExplorer={onExplorer}
              niveau={niveau}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function DetailTerritoire({
  noeud,
  stats,
  onExplorer,
  niveau,
}: {
  noeud: TerritorialSummary
  stats: StatsTerritoire | undefined
  onExplorer: (nom: string) => void
  niveau: NiveauCarte
}) {
  return (
    <div className="panel" style={{ padding: 14 }}>
      <h3>{noeud.territory.nom}</h3>
      <dl className="def-grid" style={{ marginTop: 10 }}>
        <div>
          <dt>Écoles analysées</dt>
          <dd>{fmt(noeud.totals.ecolesAnalysees)}</dd>
        </div>
        <div>
          <dt>Écoles en déficit</dt>
          <dd>{fmt(noeud.totals.ecolesEnDeficit)}</dd>
        </div>
        <div>
          <dt>Postes nécessaires</dt>
          <dd>{fmt(noeud.totals.postesNecessaires)}</dd>
        </div>
        <div>
          <dt>Enseignants en excédent</dt>
          <dd>{fmt(noeud.totals.excedentMobilisable)}</dd>
        </div>
        <div>
          <dt>Postes couvrables</dt>
          <dd>{fmt(stats?.couverts ?? null)}</dd>
        </div>
        <div>
          <dt>Besoin résiduel</dt>
          <dd>{fmt(stats?.residuel ?? null)}</dd>
        </div>
        <div>
          <dt>Enseignants reçus</dt>
          <dd>{fmt(stats?.recus ?? null)}</dd>
        </div>
        <div>
          <dt>Enseignants cédés</dt>
          <dd>{fmt(stats?.sortants ?? null)}</dd>
        </div>
      </dl>
      {stats && (
        <p style={{ marginTop: 10 }}>
          <Pill tone={stats.solde > 0 ? 'ok' : stats.solde < 0 ? 'warn' : 'neutral'}>
            <span aria-hidden="true">{stats.solde > 0 ? '▲' : stats.solde < 0 ? '▼' : '='}</span> Solde :{' '}
            {stats.solde > 0 ? '+' : ''}
            {fmt(stats.solde)} enseignant(s)
          </Pill>
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary"
        style={{ marginTop: 12 }}
        onClick={() => onExplorer(noeud.territory.nom)}
      >
        Explorer {DEFINI[niveau]} <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

function FondCarte({
  appariees,
  couleurDe,
  formate,
  libelleIndicateur,
  onSurvol,
  onExplorer,
  selection,
  niveau,
}: {
  appariees: ReturnType<typeof apparierFeatures>
  couleurDe: (nom: string) => string
  formate: (nom: string) => string
  libelleIndicateur: string
  onSurvol: (nom: string | null) => void
  onExplorer: (nom: string) => void
  selection: string | null
  niveau: NiveauCarte
}) {
  const info = useInfobulle()
  const boite = boiteEnglobante(appariees.map(a => a.feature))
  if (!boite) return <p className="hint">Le fichier de carte ne contient aucune géométrie exploitable.</p>

  const largeur = 640
  const etendueX = Math.max(0.0001, boite.maxX - boite.minX)
  const etendueY = Math.max(0.0001, boite.maxY - boite.minY)
  // Correction sommaire de la déformation en latitude, pour que les contours ne
  // paraissent pas étirés horizontalement près de l'équateur.
  const facteurLatitude = Math.cos((((boite.minY + boite.maxY) / 2) * Math.PI) / 180)
  const hauteur = Math.max(280, Math.round((largeur * etendueY) / (etendueX * facteurLatitude)))

  const projeter = (x: number, y: number): string =>
    `${(((x - boite.minX) / etendueX) * largeur).toFixed(1)} ${(hauteur - ((y - boite.minY) / etendueY) * hauteur).toFixed(1)}`

  return (
    <figure className="map-figure" style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${largeur} ${hauteur}`}
        role="img"
        aria-label={`Carte des ${PLURIEL[niveau]}, colorée selon l’indicateur sélectionné`}
      >
        {appariees.map((a, index) => {
          if (!a.feature.geometry) return null
          const nom = a.territoire
          const chemin = anneaux(a.feature.geometry)
            .map(anneau => anneau.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${projeter(x, y)}`).join(' ') + ' Z')
            .join(' ')

          if (!nom) {
            return (
              <path
                key={`hors-${index}`}
                d={chemin}
                className="map-shape"
                fill="var(--carte-vide)"
                aria-hidden="true"
                style={{ cursor: 'default' }}
              />
            )
          }

          return (
            <path
              key={`${nom}-${index}`}
              d={chemin}
              className="map-shape"
              fill={couleurDe(nom)}
              tabIndex={0}
              role="button"
              aria-pressed={selection === nom}
              aria-label={`${nom} — ${formate(nom)}`}
              onPointerEnter={e => {
                onSurvol(nom)
                info.montrer(e, { titre: nom, lignes: [{ label: libelleIndicateur, valeur: formate(nom) }] })
              }}
              onPointerMove={e =>
                info.montrer(e, { titre: nom, lignes: [{ label: libelleIndicateur, valeur: formate(nom) }] })
              }
              onPointerLeave={() => {
                onSurvol(null)
                info.masquer()
              }}
              onFocus={() => onSurvol(nom)}
              onClick={() => onExplorer(nom)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onExplorer(nom)
                }
              }}
            />
          )
        })}
      </svg>
      <Infobulle poignee={info.poignee} />
      <figcaption className="hint" style={{ padding: '8px 4px 2px' }}>
        Fond de carte chargé depuis le fichier local <span className="mono">public/geo/{FICHIERS_GEO[niveau]}</span>.
        Survolez ou tabulez sur un territoire pour en voir le détail, cliquez pour l’explorer.
      </figcaption>
    </figure>
  )
}

/**
 * Solution de repli sans fichier géographique exploitable : les territoires sont
 * présentés en grille, avec la même échelle de couleurs et les mêmes valeurs.
 */
function GrilleTerritoires({
  territoires,
  couleurDe,
  formate,
  onExplorer,
  selection,
  niveau,
  fichierAbsent,
}: {
  territoires: TerritorialSummary[]
  couleurDe: (nom: string) => string
  formate: (nom: string) => string
  onExplorer: (nom: string) => void
  selection: string | null
  niveau: NiveauCarte
  fichierAbsent: boolean
}) {
  const fichier = FICHIERS_GEO[niveau]
  return (
    <div className="stack-tight">
      <div className="notice notice-neutral">
        <MapPinned size={17} aria-hidden="true" />
        <p>
          {fichierAbsent ? (
            <>
              <strong>Fond de carte non installé.</strong> Aucun contour géographique n’a été trouvé pour ce niveau ;
              les territoires sont présentés en grille, avec les mêmes valeurs et la même échelle. Pour afficher une
              carte, déposez un fichier GeoJSON dans <span className="mono">public/geo/{fichier}</span>.
            </>
          ) : (
            <>
              <strong>Aucun territoire apparié.</strong> Le fond de carte a été chargé, mais aucun de ses libellés ne
              correspond aux territoires présents dans les données importées. Les valeurs sont affichées en grille.
            </>
          )}
        </p>
      </div>
      <div className="territory-grid">
        {territoires.length === 0 && <p className="hint">Aucun territoire à afficher.</p>}
        {territoires.map(t => (
          <button
            type="button"
            key={t.territory.code}
            className="territory-tile"
            style={{ borderLeftColor: couleurDe(t.territory.nom) }}
            onClick={() => onExplorer(t.territory.nom)}
            aria-pressed={selection === t.territory.nom}
          >
            <b>{t.territory.nom}</b>
            <span className="tile-value">{formate(t.territory.nom)}</span>
            <span>
              {fmt(t.totals.ecolesAnalysees)} écoles · {fmt(t.totals.ecolesEnDeficit)} en déficit
            </span>
            {selection === t.territory.nom && <Pill tone="info">Sélectionné</Pill>}
          </button>
        ))}
      </div>
    </div>
  )
}
