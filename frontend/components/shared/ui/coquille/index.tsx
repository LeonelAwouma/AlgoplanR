'use client'

/**
 * Ossature de l'application : bandeau supérieur, barre latérale, titre de page,
 * fil d'Ariane territorial et barre de filtres globaux.
 */

import Image from 'next/image'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Home,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import type { GlobalFilters, OptionsFiltres, SchoolSeverity, TerritorySelection, Zone, ZoneSecurite } from '@shared/api'
import {
  LIBELLE_SEVERITE,
  LIBELLE_ZONE,
  LIBELLE_ZONE_SECURITE,
  SEVERITES,
  ZONES_SECURITE,
  breadcrumb,
} from '@shared/kernel'
import type { Theme } from '@shared/session/theme'
import { Pill } from '@shared/ui/commun'
import {
  etapeAccessible,
  etapeSuivante,
  etapesVisibles,
  parcoursVisible,
  premiereEtapeAccessible,
  rubriqueDePage,
  rubriquesVisibles,
  sousTitreDePage,
  titreDePage,
  type EtatJeu,
  type NavItem,
  type PageKey,
  type RoleAcces,
  type ViewMode,
} from './navigation'

/** Message des écrans encore inaccessibles. */
const INDISPONIBLE = 'Disponible une fois les données importées et analysées'

/**
 * Au rechargement, Firefox rend à un bouton l'état « désactivé » qu'il avait
 * avant : le rendu serveur (aucun jeu ouvert, bouton désactivé) ne correspond
 * alors plus au HTML hydraté. `autocomplete="off"` l'en empêche ; les types de
 * React ne prévoient pas cet attribut sur un bouton, d'où l'objet à part.
 * À poser sur tout bouton dont l'état « désactivé » dépend du jeu ouvert.
 */
const SANS_RESTAURATION_FIREFOX = { autoComplete: 'off' } as Record<string, string>

/**
 * Barre latérale : une entrée par menu, puis « Paramètres avancés » à part. Elle
 * ouvre la première étape disponible du menu ; les autres se parcourent par les
 * étapes affichées en tête de page. Sur écran large, elle peut être réduite à ses icônes.
 */
export function Sidebar({
  page,
  onNavigate,
  mode,
  role,
  ouverte,
  onFermer,
  reduite,
  onBasculer,
  donneesChargees,
  simulationPrete,
  version,
}: {
  page: PageKey
  onNavigate: (page: PageKey) => void
  mode: ViewMode
  role: RoleAcces
  ouverte: boolean
  onFermer: () => void
  /** Barre réduite à ses icônes (sans effet sur le tiroir des petits écrans). */
  reduite: boolean
  onBasculer: () => void
  donneesChargees: boolean
  simulationPrete: boolean
  /** Version installée, affichée dans l'application de bureau pour faciliter l'assistance. */
  version?: string
}) {
  const etat: EtatJeu = { donneesChargees, simulationPrete }
  const rubriqueCourante = rubriqueDePage(page)

  const classes = ['sidebar', ouverte && 'open', reduite && 'reduite'].filter(Boolean).join(' ')

  return (
    <aside className={classes} aria-label="Navigation principale">
      <button
        type="button"
        className="sidebar-bascule"
        onClick={onBasculer}
        aria-expanded={!reduite}
        aria-label={reduite ? 'Déployer le menu' : 'Réduire le menu'}
        title={reduite ? 'Déployer le menu' : 'Réduire le menu'}
      >
        {reduite ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
      </button>
      <nav>
        {[false, true].map(avance => {
          const rubriques = rubriquesVisibles(mode, role).filter(r => !!r.avance === avance)
          if (rubriques.length === 0) return null
          return (
            <ul className={avance ? 'nav-list nav-list-avancee' : 'nav-list'} key={avance ? 'avancee' : 'principale'}>
              {rubriques.map(rubrique => {
                const cible = premiereEtapeAccessible(rubrique, mode, role, etat)
                const Icone = rubrique.icon
                const aide = cible ? rubrique.sousTitre : INDISPONIBLE
                return (
                  <li key={rubrique.id}>
                    <button
                      type="button"
                      className="nav-item"
                      aria-current={rubrique === rubriqueCourante ? 'page' : undefined}
                      disabled={!cible}
                      {...SANS_RESTAURATION_FIREFOX}
                      // Réduite, la barre n'affiche plus que l'icône : le libellé passe dans l'infobulle.
                      title={reduite ? `${rubrique.label} — ${aide}` : aide}
                      aria-label={reduite ? rubrique.label : undefined}
                      onClick={() => {
                        if (!cible) return
                        onNavigate(cible.id)
                        onFermer()
                      }}
                    >
                      {/* Surbrillance de l'entrée active : elle glisse d'une entrée à l'autre. */}
                      {rubrique === rubriqueCourante && (
                        <motion.span
                          className="nav-actif"
                          layoutId="nav-actif"
                          transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                          aria-hidden="true"
                        />
                      )}
                      <Icone size={17} aria-hidden="true" />
                      <span className="nav-item-texte">
                        <span>{rubrique.label}</span>
                        {/* La vue Décideur reste sobre : le détail de chaque menu est dans l'infobulle. */}
                        {mode === 'analyste' && <small>{rubrique.sousTitre}</small>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        })}
      </nav>

      <p className="privacy-note" title={reduite ? 'Traitement local' : undefined}>
        <ShieldCheck size={15} aria-hidden="true" />
        <span className="privacy-note-texte">
          Traitement local : les données sont traitées et conservées sur ce poste, par le serveur AlgoPlanR.
          {version && <span className="sidebar-version">AlgoPlanR version {version}</span>}
        </span>
      </p>
    </aside>
  )
}

/**
 * Bandeau supérieur, sur toute la largeur : identité de l'application, contexte
 * de travail (territoire, année, scénario) et réglages de la session. Le titre
 * de la page, lui, est porté par `PageHeader`.
 */
export function Topbar({
  mode,
  onModeChange,
  analysteDisponible = true,
  theme,
  onThemeChange,
  onOuvrirMenu,
  onAccueil,
  etat,
  territoire,
  anneeScolaire,
  scenario,
  onEffacer,
  peutEffacer,
  utilisateur,
  onDeconnexion,
}: {
  mode: ViewMode
  onModeChange: (m: ViewMode) => void
  /** La Vue analyste est réservée au DRH : le bouton n'est pas proposé aux délégués. */
  analysteDisponible?: boolean
  theme: Theme
  onThemeChange: (t: Theme) => void
  onOuvrirMenu: () => void
  /** Rouvre l'écran de bienvenue, sans rien perdre du travail en cours. */
  onAccueil: () => void
  etat: ReactNode
  territoire: string
  anneeScolaire: string
  scenario: string
  onEffacer: () => void
  /** Un jeu modifiable par la personne connectée est ouvert : il peut être supprimé. */
  peutEffacer: boolean
  /** Personne connectée : « DRH · … » ou « Délégué · Centre ». */
  utilisateur: string
  onDeconnexion: () => void
}) {
  return (
    <header className="topbar">
      <button type="button" className="mobile-menu" onClick={onOuvrirMenu} aria-label="Ouvrir le menu de navigation">
        <Menu size={19} />
      </button>

      <div className="brand">
        {/* Emblème du logo, décoratif : le nom de la plateforme est écrit à côté. */}
        <Image className="brand-logo" src="/logo-mark.png" alt="" width={64} height={38} priority />
        <span>
          <span className="brand-name">ALGOPLANR</span>
          <span className="brand-sub">Affectation des enseignants</span>
        </span>
      </div>

      <dl className="context">
        <div>
          <dt>Territoire</dt>
          <dd>{territoire}</dd>
        </div>
        <div>
          <dt>Année scolaire</dt>
          <dd>{anneeScolaire}</dd>
        </div>
        <div>
          <dt>Scénario</dt>
          <dd title={scenario}>{scenario}</dd>
        </div>
      </dl>

      <div className="topbar-actions">
        {etat}
        <button
          type="button"
          className="btn btn-sm btn-accueil"
          onClick={onAccueil}
          title="Revenir à l’écran d’accueil"
        >
          <Home size={15} aria-hidden="true" />
          <span className="btn-accueil-libelle">Accueil</span>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-pressed={theme === 'sombre'}
          onClick={() => onThemeChange(theme === 'sombre' ? 'clair' : 'sombre')}
          title={theme === 'sombre' ? 'Passer en mode clair' : 'Passer en mode sombre'}
        >
          {theme === 'sombre' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          <span className="sr-only">Mode sombre</span>
        </button>
        <div className="mode-switch" role="group" aria-label="Mode d’affichage">
          <button type="button" aria-pressed={mode === 'simple'} onClick={() => onModeChange('simple')}>
            Décideur
          </button>
          {analysteDisponible && (
            <button type="button" aria-pressed={mode === 'analyste'} onClick={() => onModeChange('analyste')}>
              Analyste
            </button>
          )}
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onEffacer}
          disabled={!peutEffacer}
          {...SANS_RESTAURATION_FIREFOX}
          title="Supprimer le jeu de données ouvert"
        >
          <Trash2 size={16} aria-hidden="true" />
          <span className="sr-only">Supprimer le jeu de données ouvert</span>
        </button>
        <span className="user-chip" title="Personne connectée">
          <UserRound size={14} aria-hidden="true" />
          <span className="user-chip-libelle">{utilisateur}</span>
        </span>
        <button type="button" className="icon-button" onClick={onDeconnexion} title="Se déconnecter">
          <LogOut size={16} aria-hidden="true" />
          <span className="sr-only">Se déconnecter</span>
        </button>
      </div>
    </header>
  )
}

/** Titre de la page, précédé d'un fil d'Ariane « Accueil › Rubrique › Écran ». */
export function PageHeader({ page, onAccueil }: { page: PageKey; onAccueil: () => void }) {
  const rubrique = rubriqueDePage(page)
  const sousTitre = sousTitreDePage(page)
  return (
    <div className="page-header no-print">
      <nav aria-label="Fil d’Ariane">
        <ol className="breadcrumb">
          <li>
            <button type="button" onClick={onAccueil}>
              <Home size={13} aria-hidden="true" /> Accueil
            </button>
          </li>
          {rubrique && rubrique.etapes.length > 1 && (
            <li>
              <span className="breadcrumb-sep" aria-hidden="true">
                <ChevronRight size={13} />
              </span>
              <span>{rubrique.label}</span>
            </li>
          )}
          <li>
            <span className="breadcrumb-sep" aria-hidden="true">
              <ChevronRight size={13} />
            </span>
            <span aria-current="page">{titreDePage(page)}</span>
          </li>
        </ol>
      </nav>
      <h1>{titreDePage(page)}</h1>
      {sousTitre && <p className="hint">{sousTitre}</p>}
    </div>
  )
}

/**
 * Parcours du menu ouvert : les étapes qui s'enchaînent, puis le choix final, et
 * une barre d'onglets pour les écrans de détail. Rien n'est affiché quand le
 * menu n'a qu'un écran.
 */
export function EtapesRubrique({
  page,
  onNavigate,
  mode,
  role,
  donneesChargees,
  simulationPrete,
}: {
  page: PageKey
  onNavigate: (page: PageKey) => void
  mode: ViewMode
  role: RoleAcces
  donneesChargees: boolean
  simulationPrete: boolean
}) {
  const rubrique = rubriqueDePage(page)
  if (!rubrique) return null
  const parcours = parcoursVisible(rubrique, mode, role)
  const onglets = etapesVisibles(rubrique, mode, role).filter(e => e.onglet)
  // Le menu qui n'a qu'une étape (le tableau de bord) la garde comme premier onglet, pour y revenir.
  const detail = parcours.length === 1 ? [...parcours, ...onglets] : onglets
  const avecParcours = parcours.length >= 2
  // Un seul onglet de détail suffit quand le menu a un parcours : sinon « Qualité des données » serait inaccessible.
  const avecDetail = onglets.length > 0 && (avecParcours || detail.length >= 2)
  if (!avecParcours && !avecDetail) return null

  const etat: EtatJeu = { donneesChargees, simulationPrete }
  const composantes = parcours.filter(e => !e.finale)
  const finales = parcours.filter(e => e.finale)

  const bouton = (etape: NavItem, numero?: number) => {
    const accessible = etapeAccessible(etape, etat)
    return (
      <li key={etape.id} className={etape.finale ? 'etape etape-finale' : 'etape'}>
        <button
          type="button"
          aria-current={etape.id === page ? 'step' : undefined}
          disabled={!accessible}
          {...SANS_RESTAURATION_FIREFOX}
          title={accessible ? etape.sousTitre : INDISPONIBLE}
          onClick={() => onNavigate(etape.id)}
        >
          {etape.finale ? (
            <CheckCircle2 size={15} aria-hidden="true" />
          ) : (
            <span className="etape-numero" aria-hidden="true">
              {numero}
            </span>
          )}
          <span>
            {etape.finale && <small>Choix final</small>}
            {etape.label}
          </span>
        </button>
      </li>
    )
  }

  return (
    <>
      {avecParcours && (
        <nav className="etapes no-print" aria-label={`Étapes : ${rubrique.label}`}>
          <p className="etapes-titre">Étapes à suivre, puis le choix final</p>
          <ol>
            {composantes.map((etape, i) => bouton(etape, i + 1))}
            {finales.map(etape => bouton(etape))}
          </ol>
        </nav>
      )}
      {avecDetail && (
        <nav className="onglets-detail no-print" aria-label={`Détails : ${rubrique.label}`}>
          {avecParcours && <p className="etapes-titre">Détails</p>}
          <ul>
            {detail.map(etape => {
              const accessible = etapeAccessible(etape, etat)
              const Icone = etape.icon
              return (
                <li key={etape.id}>
                  <button
                    type="button"
                    aria-current={etape.id === page ? 'page' : undefined}
                    disabled={!accessible}
                    {...SANS_RESTAURATION_FIREFOX}
                    title={accessible ? etape.sousTitre : INDISPONIBLE}
                    onClick={() => onNavigate(etape.id)}
                  >
                    <Icone size={14} aria-hidden="true" />
                    {etape.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </>
  )
}

/**
 * Bouton principal du parcours : mène à l'étape suivante sans chercher le bon
 * menu. Absent sur un onglet de détail, sur les paramètres avancés et sur la
 * dernière étape.
 */
export function BoutonContinuer({
  page,
  onNavigate,
  mode,
  role,
  donneesChargees,
  simulationPrete,
  ignorer = [],
}: {
  page: PageKey
  onNavigate: (page: PageKey) => void
  mode: ViewMode
  role: RoleAcces
  donneesChargees: boolean
  simulationPrete: boolean
  /** Étapes facultatives sautées par le bouton, par exemple le Fait de Prince quand il n'y en a aucun. */
  ignorer?: readonly PageKey[]
}) {
  const suivante = etapeSuivante(page, mode, role, { donneesChargees, simulationPrete }, ignorer)
  if (!suivante) return null
  return (
    <div className="continuer no-print">
      <button
        type="button"
        className="btn btn-primary"
        disabled={!suivante.accessible}
        {...SANS_RESTAURATION_FIREFOX}
        title={suivante.accessible ? suivante.etape.sousTitre : INDISPONIBLE}
        onClick={() => onNavigate(suivante.etape.id)}
      >
        Continuer : {suivante.etape.label} <ArrowRight size={15} aria-hidden="true" />
      </button>
    </div>
  )
}

export function TerritoryBreadcrumb({
  selection,
  onSelect,
}: {
  selection: TerritorySelection
  onSelect: (s: TerritorySelection) => void
}) {
  const items = breadcrumb(selection)
  return (
    <nav aria-label="Fil d’Ariane territorial">
      <ol className="breadcrumb">
        {items.map((item, i) => {
          const dernier = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`}>
              {i > 0 && (
                <span className="breadcrumb-sep" aria-hidden="true">
                  <ChevronRight size={13} />
                </span>
              )}
              {dernier ? (
                <span aria-current="page">{item.label}</span>
              ) : (
                <button type="button" onClick={() => onSelect(item.selection)}>
                  {item.label}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function FilterBar({
  filtres,
  options,
  onChange,
  onReset,
  scenarioActif,
  scenarios,
  scenariosEnChargement = false,
  onScenarioChange,
}: {
  filtres: GlobalFilters
  options: OptionsFiltres
  onChange: (f: GlobalFilters) => void
  onReset: () => void
  /** Scénario affiché ; chaîne vide pour la situation actuelle, sans simulation. */
  scenarioActif: string
  scenarios: { id: string; nom: string }[]
  /** La liste des scénarios est en cours de lecture : le choix « Situation actuelle » n'est pas encore une réalité. */
  scenariosEnChargement?: boolean
  onScenarioChange: (id: string) => void
}) {
  const majTerritoire = (patch: Partial<TerritorySelection>) =>
    onChange({ ...filtres, territoire: { ...filtres.territoire, ...patch } })

  const [plusOuvert, setPlusOuvert] = useState(false)
  const nbSecondaires =
    filtres.zones.length +
    filtres.zonesSecurite.length +
    filtres.typesEtab.length +
    filtres.severites.length +
    (filtres.multigradesUniquement !== null ? 1 : 0)

  const chips: { cle: string; label: string; retirer: () => void }[] = []
  if (filtres.territoire.region) {
    chips.push({
      cle: 'region',
      label: `Région : ${filtres.territoire.region}`,
      retirer: () => majTerritoire({ region: null, departement: null, commune: null }),
    })
  }
  if (filtres.territoire.departement) {
    chips.push({
      cle: 'departement',
      label: `Département : ${filtres.territoire.departement}`,
      retirer: () => majTerritoire({ departement: null, commune: null }),
    })
  }
  if (filtres.territoire.commune) {
    chips.push({
      cle: 'commune',
      label: `Commune : ${filtres.territoire.commune}`,
      retirer: () => majTerritoire({ commune: null }),
    })
  }
  for (const zone of filtres.zones) {
    chips.push({
      cle: `zone-${zone}`,
      label: `Zone : ${LIBELLE_ZONE[zone]}`,
      retirer: () => onChange({ ...filtres, zones: filtres.zones.filter(z => z !== zone) }),
    })
  }
  for (const zone of filtres.zonesSecurite) {
    chips.push({
      cle: `securite-${zone}`,
      label: `Sécurité : ${LIBELLE_ZONE_SECURITE[zone]}`,
      retirer: () => onChange({ ...filtres, zonesSecurite: filtres.zonesSecurite.filter(z => z !== zone) }),
    })
  }
  for (const type of filtres.typesEtab) {
    chips.push({
      cle: `type-${type}`,
      label: `Type : ${type}`,
      retirer: () => onChange({ ...filtres, typesEtab: filtres.typesEtab.filter(t => t !== type) }),
    })
  }
  for (const severite of filtres.severites) {
    chips.push({
      cle: `sev-${severite}`,
      label: LIBELLE_SEVERITE[severite],
      retirer: () => onChange({ ...filtres, severites: filtres.severites.filter(s => s !== severite) }),
    })
  }
  if (filtres.multigradesUniquement !== null) {
    chips.push({
      cle: 'multigrade',
      label: filtres.multigradesUniquement ? 'Avec classes multigrades' : 'Sans classes multigrades',
      retirer: () => onChange({ ...filtres, multigradesUniquement: null }),
    })
  }

  return (
    <div className="stack-tight no-print">
      <div className="filter-bar">
        <div className="field">
          <label htmlFor="f-region">Région</label>
          <select
            id="f-region"
            value={filtres.territoire.region ?? ''}
            onChange={e => majTerritoire({ region: e.target.value || null, departement: null, commune: null })}
          >
            <option value="">Toutes les régions</option>
            {options.regions.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-departement">Département</label>
          <select
            id="f-departement"
            value={filtres.territoire.departement ?? ''}
            disabled={!filtres.territoire.region}
            onChange={e => majTerritoire({ departement: e.target.value || null, commune: null })}
          >
            <option value="">Tous les départements</option>
            {options.departements.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-commune">Commune</label>
          <select
            id="f-commune"
            value={filtres.territoire.commune ?? ''}
            disabled={!filtres.territoire.departement}
            onChange={e => majTerritoire({ commune: e.target.value || null })}
          >
            <option value="">Toutes les communes</option>
            {options.communes.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-scenario">Scénario affiché</label>
          <select
            id="f-scenario"
            value={scenarioActif}
            disabled={scenariosEnChargement}
            aria-busy={scenariosEnChargement}
            onChange={e => onScenarioChange(e.target.value)}
          >
            <option value="">
              {scenariosEnChargement ? 'Chargement des scénarios…' : 'Situation actuelle (sans simulation)'}
            </option>
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-bar-actions">
          <button
            type="button"
            className="btn btn-sm"
            aria-expanded={plusOuvert}
            aria-controls="filtres-secondaires"
            onClick={() => setPlusOuvert(o => !o)}
          >
            <ChevronDown size={13} aria-hidden="true" className={plusOuvert ? 'chevron-open' : undefined} /> Plus de
            filtres
            {nbSecondaires > 0 && <span className="btn-count">{nbSecondaires}</span>}
          </button>
          <button type="button" className="btn btn-sm" onClick={onReset} disabled={chips.length === 0}>
            <RotateCcw size={13} aria-hidden="true" /> Réinitialiser
          </button>
        </div>

        {plusOuvert && (
          <div className="filter-more" id="filtres-secondaires">
            <div className="field">
              <label htmlFor="f-zone">Zone</label>
              <select
                id="f-zone"
                value={filtres.zones[0] ?? ''}
                onChange={e => onChange({ ...filtres, zones: e.target.value ? [e.target.value as Zone] : [] })}
              >
                <option value="">Toutes les zones</option>
                {options.zones.map(z => (
                  <option key={z} value={z}>
                    {LIBELLE_ZONE[z]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-securite">Zone de sécurité</label>
              <select
                id="f-securite"
                value={filtres.zonesSecurite[0] ?? ''}
                onChange={e =>
                  onChange({ ...filtres, zonesSecurite: e.target.value ? [e.target.value as ZoneSecurite] : [] })
                }
              >
                <option value="">Toutes (verte, jaune, rouge)</option>
                {ZONES_SECURITE.map(z => (
                  <option key={z} value={z}>
                    {LIBELLE_ZONE_SECURITE[z]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-type">Type d’établissement</label>
              <select
                id="f-type"
                value={filtres.typesEtab[0] ?? ''}
                onChange={e => onChange({ ...filtres, typesEtab: e.target.value ? [e.target.value] : [] })}
              >
                <option value="">Tous les types</option>
                {options.typesEtab.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-severite">Niveau de déficit</label>
              <select
                id="f-severite"
                value={filtres.severites[0] ?? ''}
                onChange={e =>
                  onChange({ ...filtres, severites: e.target.value ? [e.target.value as SchoolSeverity] : [] })
                }
              >
                <option value="">Tous les niveaux</option>
                {SEVERITES.map(s => (
                  <option key={s} value={s}>
                    {LIBELLE_SEVERITE[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-multigrade">Classes multigrades</label>
              <select
                id="f-multigrade"
                value={filtres.multigradesUniquement === null ? '' : filtres.multigradesUniquement ? 'oui' : 'non'}
                onChange={e =>
                  onChange({
                    ...filtres,
                    multigradesUniquement: e.target.value === '' ? null : e.target.value === 'oui',
                  })
                }
              >
                <option value="">Indifférent</option>
                <option value="oui">Avec classes multigrades</option>
                <option value="non">Sans classes multigrades</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="active-filters">
          <Pill tone="info">{chips.length} filtre(s) actif(s)</Pill>
          {chips.map(c => (
            <span className="chip" key={c.cle}>
              {c.label}
              <button type="button" onClick={c.retirer} aria-label={`Retirer le filtre ${c.label}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
