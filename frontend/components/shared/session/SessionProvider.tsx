'use client'

/**
 * Session d'interface : ce que l'utilisateur regarde, pas les données.
 *
 * Remplace la partie « état d'interface » de l'ancien hook central
 * (usePlanningState). On y trouve :
 *   - le jeu de données ouvert (son identifiant seulement) ;
 *   - l'écran de bienvenue, la page affichée, le mode d'affichage, le thème,
 *     l'ouverture du menu ;
 *   - les filtres, le scénario choisi pour l'affichage, l'école sélectionnée.
 *
 * Les données elles-mêmes sont lues par les hooks des contextes, à partir de
 * cet état. Les calculs ont lieu sur le serveur.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { FILTRES_VIDES, type GlobalFilters, type IdJeu } from '../api'
import type { PageKey, ViewMode } from '../ui/coquille/navigation'
import { ecrirePreference, effacerPreferences, lirePreference } from './preferences'
import { appliquerTheme, themeApplique, themeSysteme, type Theme } from './theme'

/** État et actions de la session d'interface. */
export interface Session {
  /** Jeu de données ouvert, `null` tant qu'aucun n'est chargé. */
  jeu: IdJeu | null
  page: PageKey
  mode: ViewMode
  /** Thème clair ou sombre. */
  theme: Theme
  menuOuvert: boolean
  /** Barre latérale réduite à ses icônes (écran large seulement). */
  barreReduite: boolean
  /**
   * Écran de bienvenue affiché par-dessus l'application. Il s'ouvre à chaque
   * lancement ; l'ouvrir ou le fermer ne change ni le jeu, ni les filtres, ni la page.
   */
  accueilOuvert: boolean
  filtres: GlobalFilters
  /**
   * Scénario choisi pour l'affichage, `null` pour laisser le choix par défaut
   * (scénario retenu, sinon le scénario départemental).
   */
  scenarioChoisi: string | null
  ecoleSelectionnee: string | null

  /** Ouvre un jeu : filtres, sélection et scénario repartent de zéro. */
  ouvrirJeu: (jeu: IdJeu, page?: PageKey) => void
  /** Ferme le jeu courant (après sa suppression, par exemple) et revient à l'import. */
  fermerJeu: () => void
  setPage: (page: PageKey) => void
  changerMode: (mode: ViewMode) => void
  /** Change le thème et le mémorise pour les prochaines ouvertures. */
  changerTheme: (theme: Theme) => void
  setMenuOuvert: (ouvert: boolean) => void
  /** Réduit ou déploie la barre latérale et le mémorise. */
  basculerBarre: () => void
  ouvrirAccueil: () => void
  fermerAccueil: () => void
  setFiltres: (filtres: GlobalFilters) => void
  setScenarioChoisi: (scenario: string | null) => void
  setEcoleSelectionnee: (ecole: string | null) => void
  /** Ouvre la fiche d'une école. */
  ouvrirEcole: (ecole: string) => void
  /** Ouvre l'exploration territoriale sur une région. */
  explorerTerritoire: (region: string) => void
  /** Oublie toutes les préférences locales et revient à l'état initial. */
  reinitialiser: () => void
}

const ContexteSession = createContext<Session | null>(null)

/** Fournit la session d'interface à toute l'application. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [jeu, setJeu] = useState<IdJeu | null>(null)
  const [page, setPage] = useState<PageKey>('import')
  const [mode, setMode] = useState<ViewMode>('simple')
  const [theme, setTheme] = useState<Theme>('clair')
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [barreReduite, setBarreReduite] = useState(false)
  const [accueilOuvert, setAccueilOuvert] = useState(true)
  const [filtres, setFiltres] = useState<GlobalFilters>(FILTRES_VIDES)
  const [scenarioChoisi, setScenarioChoisi] = useState<string | null>(null)
  const [ecoleSelectionnee, setEcoleSelectionnee] = useState<string | null>(null)

  // Préférences relues après le premier rendu : le stockage local n'existe pas
  // pendant la génération statique, et le premier rendu doit lui être identique.
  useEffect(() => {
    const vue = lirePreference<ViewMode>('vue', 'simple')
    const dernierJeu = lirePreference<IdJeu | null>('jeu', null)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation unique avec le stockage local
    setMode(vue)
    setBarreReduite(lirePreference<boolean>('barre', false))
    // Le thème a déjà été appliqué avant l'affichage par SCRIPT_THEME : la session s'y aligne.
    setTheme(themeApplique())
    // Le dernier jeu est rouvert derrière l'écran de bienvenue ; « Commencer » mène alors au
    // tableau de bord, sinon à « Données de référence ».
    if (dernierJeu) setJeu(dernierJeu)
  }, [])

  const ouvrirJeu = useCallback((nouveau: IdJeu, pageInitiale: PageKey = 'overview') => {
    setJeu(nouveau)
    setFiltres(FILTRES_VIDES)
    setScenarioChoisi(null)
    setEcoleSelectionnee(null)
    setPage(pageInitiale)
    ecrirePreference('jeu', nouveau)
  }, [])

  const fermerJeu = useCallback(() => {
    setJeu(null)
    setFiltres(FILTRES_VIDES)
    setScenarioChoisi(null)
    setEcoleSelectionnee(null)
    setPage('import')
    ecrirePreference('jeu', null)
  }, [])

  const changerMode = useCallback((nouveau: ViewMode) => {
    setMode(nouveau)
    ecrirePreference('vue', nouveau)
  }, [])

  const changerTheme = useCallback((nouveau: Theme) => {
    setTheme(nouveau)
    appliquerTheme(nouveau)
    ecrirePreference('theme', nouveau)
  }, [])

  const basculerBarre = useCallback(() => {
    setBarreReduite(courante => {
      ecrirePreference('barre', !courante)
      return !courante
    })
  }, [])

  // Tant qu'aucun thème n'a été choisi, l'application suit le réglage du système.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const requete = window.matchMedia('(prefers-color-scheme: dark)')
    const suivreSysteme = () => {
      if (lirePreference<Theme | null>('theme', null) !== null) return
      const systeme = themeSysteme()
      appliquerTheme(systeme)
      setTheme(systeme)
    }
    requete.addEventListener('change', suivreSysteme)
    return () => requete.removeEventListener('change', suivreSysteme)
  }, [])

  const ouvrirAccueil = useCallback(() => {
    setMenuOuvert(false)
    setAccueilOuvert(true)
  }, [])

  const fermerAccueil = useCallback(() => setAccueilOuvert(false), [])

  const ouvrirEcole = useCallback((ecole: string) => {
    setEcoleSelectionnee(ecole)
    setPage('schools')
  }, [])

  const explorerTerritoire = useCallback((region: string) => {
    setFiltres(courants => ({ ...courants, territoire: { region, departement: null, commune: null } }))
    setPage('territoires')
  }, [])

  const reinitialiser = useCallback(() => {
    effacerPreferences()
    setMode('simple')
    setBarreReduite(false)
    const systeme = themeSysteme()
    appliquerTheme(systeme)
    setTheme(systeme)
    fermerJeu()
  }, [fermerJeu])

  const session = useMemo<Session>(
    () => ({
      jeu,
      page,
      mode,
      theme,
      menuOuvert,
      barreReduite,
      accueilOuvert,
      filtres,
      scenarioChoisi,
      ecoleSelectionnee,
      ouvrirJeu,
      fermerJeu,
      setPage,
      changerMode,
      changerTheme,
      setMenuOuvert,
      basculerBarre,
      ouvrirAccueil,
      fermerAccueil,
      setFiltres,
      setScenarioChoisi,
      setEcoleSelectionnee,
      ouvrirEcole,
      explorerTerritoire,
      reinitialiser,
    }),
    [
      jeu,
      page,
      mode,
      theme,
      menuOuvert,
      barreReduite,
      accueilOuvert,
      filtres,
      scenarioChoisi,
      ecoleSelectionnee,
      ouvrirJeu,
      fermerJeu,
      changerMode,
      changerTheme,
      basculerBarre,
      ouvrirAccueil,
      fermerAccueil,
      ouvrirEcole,
      explorerTerritoire,
      reinitialiser,
    ],
  )

  return <ContexteSession.Provider value={session}>{children}</ContexteSession.Provider>
}

/**
 * Session d'interface courante.
 *
 * @throws Error si le composant n'est pas placé sous `SessionProvider`.
 */
export function useSession(): Session {
  const session = useContext(ContexteSession)
  if (!session) throw new Error('useSession doit être utilisé sous <SessionProvider>.')
  return session
}
