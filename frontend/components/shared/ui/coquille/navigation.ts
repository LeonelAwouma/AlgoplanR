/**
 * Définition de la navigation.
 *
 * L'application se présente comme un outil d'aide à la décision : cinq menus
 * qui suivent le travail de la DRH (données, tableau de bord, affectations,
 * planification, rapports), un menu « Comptes et accès » réservé au DRH, et un
 * espace « Paramètres avancés » pour ce qui relève du réglage et du contrôle
 * (méthodologie, moteur, référentiel, journal d'audit).
 *
 * Dans un menu, les écrans du parcours s'enchaînent (bouton « Continuer »). Les
 * écrans marqués `onglet` sont des détails : on y arrive en cliquant sur un
 * indicateur ou depuis la barre d'onglets, ils ne font pas partie du parcours.
 * Aucun écran n'est supprimé : chacun appartient à exactement un menu.
 *
 * Les écrans techniques ne sont proposés qu'en Vue analyste : la vue Décideur
 * conserve exactement le même moteur et les mêmes données, mais n'expose que
 * les écrans de pilotage. Les deux rôles (DRH et délégué régional) disposent des deux
 * vues : changer de vue ne modifie ni les permissions ni le périmètre territorial.
 *
 * Dans la barre latérale, les menus sont présentés en deux groupes (voir `GROUPES_SIDEBAR`) ; l'ordre des
 * menus dans le parcours guidé (`RUBRIQUES`) reste celui du travail : on importe avant de lire le tableau de bord.
 */

import {
  ArrowRightLeft,
  BadgeCheck,
  BarChart3,
  BookMarked,
  BookOpen,
  Building2,
  Calculator,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Crown,
  Database,
  FileText,
  FlaskConical,
  Gauge,
  Gavel,
  Globe,
  GraduationCap,
  History,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ListOrdered,
  Map,
  Scale,
  ScrollText,
  Settings2,
  Shuffle,
  Sigma,
  SlidersHorizontal,
  Upload,
  UserPlus,
  UserRoundCheck,
  UserX,
  Users,
  UsersRound,
} from 'lucide-react'

export type PageKey =
  | 'import'
  | 'validation'
  | 'overview'
  | 'alea'
  | 'diagnostic'
  | 'territoires'
  | 'priorites'
  | 'schools'
  | 'teachers'
  | 'prince'
  | 'voeux'
  | 'arbitrage'
  | 'recrutes'
  | 'simulations'
  | 'comparison'
  | 'planification'
  | 'hypotheses'
  | 'quotas'
  | 'rapport-previsionnel'
  | 'vivier'
  | 'nominations'
  | 'mouvements'
  | 'indicateurs'
  | 'synthese-territoriale'
  | 'reports'
  | 'audit'
  | 'methodology'
  | 'settings'
  | 'engine'
  | 'data'
  | 'pool'
  | 'posts'
  | 'assignments'
  | 'unassigned'
  | 'logs'
  | 'acces'

/** Vue Décideur (`simple`, valeur conservée pour les préférences déjà enregistrées) ou Vue analyste. */
export type ViewMode = 'simple' | 'analyste'

/** Rôle de la personne connectée : le DRH voit tout, un délégué régional ne voit que sa région. */
export type RoleAcces = 'drh' | 'delegue'

/** Un écran, c'est-à-dire une étape d'un menu ou l'un de ses détails. */
export interface NavItem {
  id: PageKey
  label: string
  /** Courte explication affichée sous le titre de la page. */
  sousTitre?: string
  icon: typeof LayoutDashboard
  /** `true` si l'écran porte le choix final du menu (et non l'un de ses éléments). */
  finale?: boolean
  /** `true` si l'écran est un détail (onglet), hors du parcours guidé du menu. */
  onglet?: boolean
  /** `true` si l'entrée n'apparaît qu'en Vue analyste. */
  analysteSeulement?: boolean
  /** `true` si l'entrée est réservée au DRH : décisions et règles qui engagent tout le pays. */
  drhSeulement?: boolean
  /** L'entrée exige qu'un diagnostic ait été calculé. */
  exigeDonnees?: boolean
  /** L'entrée exige qu'une simulation ait été exécutée. */
  exigeSimulation?: boolean
  /**
   * L'entrée n'a de sens qu'avec le fichier nominatif des enseignants (agents identifiés, mobilité individuelle).
   * Sans lui, elle reste fermée ; les écrans qui n'exigent qu'une simulation s'ouvrent, car la planification sur les
   * écoles seules ne dépend d'aucune affectation individuelle.
   */
  exigeNominatif?: boolean
}

/** Un menu de l'application et les écrans qu'il regroupe. */
export interface Rubrique {
  id: string
  label: string
  /** Ce que le menu permet de faire. */
  sousTitre: string
  icon: typeof LayoutDashboard
  /** Écrans du menu : d'abord le parcours dans l'ordre, puis les onglets de détail. */
  etapes: NavItem[]
  /** `true` pour « Paramètres avancés » : hors du parcours guidé, présenté à part dans la barre latérale. */
  avance?: boolean
}

/** Ce qui est prêt dans le jeu ouvert : détermine les écrans accessibles. */
export interface EtatJeu {
  donneesChargees: boolean
  simulationPrete: boolean
  /** `false` : jeu créé en établissements seuls. Absent = fichier nominatif disponible. */
  nominatifDisponible?: boolean
}

export const RUBRIQUES: Rubrique[] = [
  {
    id: 'donnees',
    label: 'Données',
    sousTitre: 'Importer, appliquer le Prince, valider',
    icon: Upload,
    etapes: [
      { id: 'import', label: 'Ajouter les données', sousTitre: 'Import et contrôle qualité', icon: Upload },
      {
        id: 'prince',
        label: 'Fait de Prince',
        sousTitre: 'Décisions appliquées aux bases avant tout calcul (facultatif)',
        icon: Crown,
        exigeDonnees: true,
        drhSeulement: true,
      },
      {
        id: 'validation',
        label: 'Validation et actualisation',
        sousTitre: 'Données de référence de l’exercice',
        icon: BadgeCheck,
        exigeDonnees: true,
        finale: true,
      },
      {
        id: 'data',
        label: 'Qualité des données',
        sousTitre: 'Colonnes reconnues et contrôles',
        icon: Database,
        onglet: true,
        analysteSeulement: true,
        exigeDonnees: true,
      },
    ],
  },
  {
    id: 'accueil',
    label: 'Tableau de bord',
    sousTitre: 'Les réponses essentielles',
    icon: LayoutDashboard,
    etapes: [
      {
        id: 'overview',
        label: "Vue d'ensemble",
        sousTitre: 'Indicateurs et synthèse',
        icon: LayoutDashboard,
        exigeDonnees: true,
        finale: true,
      },
      {
        id: 'alea',
        label: 'Degré d’aléa',
        sousTitre: 'Les enseignants suivent-ils les effectifs d’élèves ? Détail par région',
        icon: Scale,
        onglet: true,
        exigeSimulation: true,
      },
      {
        id: 'priorites',
        label: 'Écoles prioritaires',
        sousTitre: 'Classement retenu pour les affectations',
        icon: ListChecks,
        onglet: true,
        exigeDonnees: true,
      },
      {
        id: 'schools',
        label: 'Besoin par école',
        sousTitre: 'Effectifs, classes, dotation et écart',
        icon: Building2,
        onglet: true,
        exigeDonnees: true,
      },
      {
        id: 'teachers',
        label: 'Enseignants en poste',
        sousTitre: 'Personnel disponible par école',
        icon: Users,
        onglet: true,
        exigeDonnees: true,
      },
      {
        id: 'territoires',
        label: 'Territoires',
        sousTitre: 'Carte et exploration',
        icon: Map,
        onglet: true,
        exigeDonnees: true,
      },
    ],
  },
  {
    id: 'affectations',
    label: 'Affectations',
    sousTitre: 'Des besoins recalculés aux nominations',
    icon: Gavel,
    etapes: [
      {
        id: 'diagnostic',
        label: 'Besoins recalculés',
        sousTitre: 'Situation nationale sur les bases après les effets du Prince',
        icon: BarChart3,
        exigeDonnees: true,
      },
      {
        id: 'simulations',
        label: 'Scénarios',
        sousTitre: 'Créer et exécuter',
        icon: FlaskConical,
        exigeDonnees: true,
      },
      {
        id: 'voeux',
        label: 'Vœux des enseignants',
        sousTitre: 'Demandes, recevabilité, scores et issue',
        icon: ListOrdered,
        exigeSimulation: true,
        exigeNominatif: true,
      },
      {
        id: 'comparison',
        label: 'Comparaison',
        sousTitre: 'Avant / après et scénarios',
        icon: ArrowRightLeft,
        exigeDonnees: true,
        exigeNominatif: true,
      },
      {
        id: 'arbitrage',
        label: 'Commission d’arbitrage',
        sousTitre: 'Valider, rejeter ou corriger les propositions',
        icon: Gavel,
        exigeSimulation: true,
        exigeNominatif: true,
      },
      {
        id: 'vivier',
        label: 'Vivier et postes ouverts',
        sousTitre: 'Personnes disponibles, rapprochement',
        icon: UsersRound,
        exigeSimulation: true,
        exigeNominatif: true,
      },
      {
        id: 'recrutes',
        label: 'Nouveaux recrutés',
        sousTitre: 'Déploiement sur les postes restés vacants',
        icon: UserPlus,
        exigeDonnees: true,
      },
      {
        id: 'nominations',
        label: 'Nominations',
        sousTitre: 'Proposées, validées, mises en œuvre',
        icon: UserRoundCheck,
        exigeSimulation: true,
        finale: true,
        exigeNominatif: true,
      },
      {
        id: 'pool',
        label: 'Vivier du scénario',
        sousTitre: 'Enseignants mobilisables du scénario',
        icon: GraduationCap,
        onglet: true,
        analysteSeulement: true,
        exigeSimulation: true,
        exigeNominatif: true,
      },
      {
        id: 'posts',
        label: 'Postes',
        sousTitre: 'Postes à pourvoir et leur poids',
        icon: ClipboardList,
        onglet: true,
        analysteSeulement: true,
        exigeSimulation: true,
        exigeNominatif: true,
      },
      {
        id: 'assignments',
        label: 'Affectations calculées',
        sousTitre: 'Score de chaque appariement',
        icon: Sigma,
        onglet: true,
        analysteSeulement: true,
        exigeSimulation: true,
        exigeNominatif: true,
      },
      {
        id: 'unassigned',
        label: 'Non affectés',
        icon: UserX,
        onglet: true,
        analysteSeulement: true,
        exigeSimulation: true,
        exigeNominatif: true,
      },
      {
        id: 'logs',
        label: 'Journal de simulation',
        icon: ScrollText,
        onglet: true,
        analysteSeulement: true,
        exigeSimulation: true,
        exigeNominatif: true,
      },
    ],
  },
  {
    id: 'planification',
    label: 'Planification',
    sousTitre: 'Attrition, retraites, projections et quotas',
    icon: CalendarRange,
    etapes: [
      {
        id: 'hypotheses',
        label: 'Hypothèses de calcul',
        sousTitre: 'Retraite, attrition, horizon',
        icon: Calculator,
        exigeDonnees: true,
      },
      {
        id: 'planification',
        label: 'Projection sur 5 ans',
        sousTitre: 'Départs, besoins, vivier et quotas par année',
        icon: CalendarRange,
        exigeSimulation: true,
      },
      {
        id: 'quotas',
        label: 'Quotas de recrutement',
        sousTitre: 'Calculés, ajustés, validés',
        icon: ClipboardCheck,
        exigeSimulation: true,
        finale: true,
      },
    ],
  },
  {
    id: 'rapports',
    label: 'Rapports',
    sousTitre: 'Rapport final, suivi des mouvements, prévisions',
    icon: FileText,
    etapes: [
      {
        id: 'mouvements',
        label: 'Registre des mouvements',
        sousTitre: 'Prévus et réalisés, sans double comptage',
        icon: Shuffle,
        exigeSimulation: true,
        exigeNominatif: true,
      },
      {
        id: 'indicateurs',
        label: 'Indicateurs de suivi',
        sousTitre: 'Couverture, réalisation, écarts',
        icon: Gauge,
        exigeSimulation: true,
      },
      {
        id: 'rapport-previsionnel',
        label: 'Rapport prévisionnel',
        sousTitre: 'Scénarios, retraites par région, redéploiement, priorités',
        icon: FileText,
        exigeSimulation: true,
      },
      {
        id: 'synthese-territoriale',
        label: 'Synthèse territoriale',
        sousTitre: 'Encadrement, couverture, aléa et attrition par territoire, exports Excel et Word',
        icon: Globe,
        onglet: true,
        exigeDonnees: true,
      },
      {
        id: 'reports',
        label: 'Rapport',
        sousTitre: 'Synthèse décisionnelle',
        icon: FileText,
        exigeDonnees: true,
        finale: true,
        exigeNominatif: true,
      },
    ],
  },
  {
    // Gestion des comptes des délégués régionaux : réservée au DRH, hors du parcours guidé.
    id: 'comptes',
    label: 'Comptes et accès',
    sousTitre: 'Délégués régionaux et historique des accès',
    icon: KeyRound,
    etapes: [
      {
        id: 'acces',
        label: 'Comptes et accès',
        sousTitre: 'Délégués régionaux et historique des accès',
        icon: KeyRound,
        onglet: true,
        drhSeulement: true,
      },
    ],
  },
  {
    // Réglage et contrôle, hors du parcours : chaque entrée garde ses restrictions d'accès.
    id: 'avancees',
    label: 'Paramètres avancés',
    sousTitre: 'Méthodologie, moteur, référentiel, audit',
    icon: Settings2,
    avance: true,
    etapes: [
      { id: 'methodology', label: 'Méthodologie', sousTitre: 'Formules expliquées', icon: BookOpen, onglet: true },
      {
        id: 'engine',
        label: 'Configuration du moteur',
        sousTitre: 'Barème, poids et phases',
        icon: SlidersHorizontal,
        onglet: true,
        analysteSeulement: true,
        drhSeulement: true,
      },
      {
        id: 'settings',
        label: 'Référentiel',
        sousTitre: "Règles utilisées pour l'analyse",
        icon: BookMarked,
        onglet: true,
        drhSeulement: true,
      },
      {
        id: 'audit',
        label: 'Journal d’audit',
        sousTitre: 'Toutes les décisions, horodatées',
        icon: History,
        onglet: true,
        exigeDonnees: true,
      },
    ],
  },
]

const TOUTES = RUBRIQUES.flatMap(r => r.etapes)

/** Regroupement des menus dans la barre latérale. */
export interface GroupeSidebar {
  id: 'pilotage' | 'administration'
  label: string
  /** Identifiants des menus du groupe, dans l'ordre d'affichage. */
  rubriques: readonly string[]
}

export const GROUPES_SIDEBAR: readonly GroupeSidebar[] = [
  {
    id: 'pilotage',
    label: 'Pilotage et opérations',
    rubriques: ['accueil', 'donnees', 'affectations', 'planification', 'rapports'],
  },
  { id: 'administration', label: 'Administration', rubriques: ['comptes', 'avancees'] },
]

/** Titre de page affiché dans l'en-tête. */
export function titreDePage(page: PageKey): string {
  return TOUTES.find(i => i.id === page)?.label ?? "Vue d'ensemble"
}

/** Sous-titre de page, quand il existe. */
export function sousTitreDePage(page: PageKey): string | undefined {
  return TOUTES.find(i => i.id === page)?.sousTitre
}

/** Menu qui contient la page. */
export function rubriqueDePage(page: PageKey): Rubrique | undefined {
  return RUBRIQUES.find(r => r.etapes.some(e => e.id === page))
}

/** Vrai si la page est réservée au DRH : un délégué ne doit ni la voir dans le menu ni l'ouvrir. */
export function pageReserveeAuDrh(page: PageKey): boolean {
  return TOUTES.some(i => i.id === page && i.drhSeulement)
}

/** Vrai si la page n'existe qu'en Vue analyste (ouverte au DRH comme au délégué ; ses droits d'accès restent ceux de la page). */
export function pageAnalysteSeule(page: PageKey): boolean {
  return TOUTES.some(i => i.id === page && i.analysteSeulement)
}

/** Écrans d'un menu visibles dans le mode d'affichage courant, pour le rôle connecté. */
export function etapesVisibles(rubrique: Rubrique, mode: ViewMode, role: RoleAcces): NavItem[] {
  return rubrique.etapes.filter(
    e => (mode === 'analyste' || !e.analysteSeulement) && (role === 'drh' || !e.drhSeulement),
  )
}

/** Écrans du parcours guidé d'un menu (sans ses onglets de détail). */
export function parcoursVisible(rubrique: Rubrique, mode: ViewMode, role: RoleAcces): NavItem[] {
  return etapesVisibles(rubrique, mode, role).filter(e => !e.onglet)
}

/** Menus ayant au moins un écran visible. */
export function rubriquesVisibles(mode: ViewMode, role: RoleAcces): Rubrique[] {
  return RUBRIQUES.filter(r => etapesVisibles(r, mode, role).length > 0)
}

/** Vrai si l'écran peut être ouvert avec ce qui est prêt dans le jeu. */
export function etapeAccessible(etape: NavItem, etat: EtatJeu): boolean {
  const sansNominatif = etat.nominatifDisponible === false
  if (sansNominatif && etape.exigeNominatif) return false
  // Sans fichier nominatif, aucune simulation de mobilité n'est exécutée : exiger son résultat fermerait la
  // planification (projections, quotas, rapport prévisionnel) qui se calcule sur les écoles.
  const exigeSimulation = etape.exigeSimulation && !sansNominatif
  return !(etape.exigeDonnees && !etat.donneesChargees) && !(exigeSimulation && !etat.simulationPrete)
}

/** Pourquoi un écran est fermé : jeu en établissements seuls, ou données et simulation pas encore prêtes. */
export function raisonInaccessible(etape: NavItem, etat: EtatJeu): string {
  return etat.nominatifDisponible === false && etape.exigeNominatif
    ? 'Indisponible : ce jeu n’a pas de fichier nominatif des enseignants (importez-le dans « Validation et actualisation »)'
    : 'Disponible une fois les données importées et analysées'
}

/** Premier écran ouvrable d'un menu, `undefined` si aucun ne l'est encore. */
export function premiereEtapeAccessible(
  rubrique: Rubrique,
  mode: ViewMode,
  role: RoleAcces,
  etat: EtatJeu,
): NavItem | undefined {
  const visibles = etapesVisibles(rubrique, mode, role)
  // Le parcours d'abord : un menu s'ouvre sur sa première étape, pas sur un onglet de détail.
  return (
    visibles.filter(e => !e.onglet).find(e => etapeAccessible(e, etat)) ?? visibles.find(e => etapeAccessible(e, etat))
  )
}

/**
 * Étape qui suit la page courante dans le parcours guidé : les écrans de parcours
 * des cinq menus, dans l'ordre. `undefined` pour un onglet de détail, pour un
 * écran des paramètres avancés et pour la dernière étape. `accessible` dit si
 * l'étape peut déjà être ouverte (une simulation peut manquer). `ignorer` : étapes facultatives que « Continuer »
 * saute (le Fait de Prince quand il n'y en a aucun) ; elles restent ouvrables depuis le parcours.
 */
export function etapeSuivante(
  page: PageKey,
  mode: ViewMode,
  role: RoleAcces,
  etat: EtatJeu,
  ignorer: readonly PageKey[] = [],
): { etape: NavItem; accessible: boolean } | undefined {
  const parcours = RUBRIQUES.filter(r => !r.avance).flatMap(r => parcoursVisible(r, mode, role))
  const i = parcours.findIndex(e => e.id === page)
  if (i < 0) return undefined
  const etape = parcours.slice(i + 1).find(e => !ignorer.includes(e.id))
  if (!etape) return undefined
  return { etape, accessible: etapeAccessible(etape, etat) }
}

/**
 * Entrées du sous-menu d'un menu dans la barre latérale : les écrans du parcours ; pour « Paramètres avancés »,
 * et pour un menu sans écran de parcours (« Comptes et accès »), tous les écrans visibles. Les onglets de détail des autres menus restent
 * accessibles par la barre d'onglets de la page.
 */
export function sousMenu(rubrique: Rubrique, mode: ViewMode, role: RoleAcces): NavItem[] {
  const parcours = parcoursVisible(rubrique, mode, role)
  return rubrique.avance || parcours.length === 0 ? etapesVisibles(rubrique, mode, role) : parcours
}

/** Vrai si le menu se déplie : il compte plusieurs entrées. Sinon, c'est un lien direct. */
export function estDepliable(rubrique: Rubrique, mode: ViewMode, role: RoleAcces): boolean {
  return sousMenu(rubrique, mode, role).length > 1
}

/** Groupes de la barre latérale et menus visibles de chacun (un groupe sans menu visible disparaît). */
export function groupesVisibles(mode: ViewMode, role: RoleAcces): { groupe: GroupeSidebar; rubriques: Rubrique[] }[] {
  const visibles = rubriquesVisibles(mode, role)
  return GROUPES_SIDEBAR.map(groupe => ({
    groupe,
    rubriques: groupe.rubriques.flatMap(id => visibles.filter(r => r.id === id)),
  })).filter(g => g.rubriques.length > 0)
}

/** Menus à déplier quand la page courante change : les menus déjà ouverts, plus celui qui contient la page. */
export function menusOuverts(ouverts: ReadonlySet<string>, page: PageKey): ReadonlySet<string> {
  const courant = rubriqueDePage(page)
  return courant && !ouverts.has(courant.id) ? new Set([...ouverts, courant.id]) : ouverts
}

/** Touches de navigation au clavier dans la barre latérale. */
export type ToucheNavigation = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'

/** Index de l'entrée à focaliser après une touche, parmi `total` entrées navigables (parcours circulaire). */
export function indexApresTouche(touche: ToucheNavigation, courant: number, total: number): number {
  if (total <= 0) return -1
  if (touche === 'Home') return 0
  if (touche === 'End') return total - 1
  if (courant < 0) return touche === 'ArrowDown' ? 0 : total - 1
  return (courant + (touche === 'ArrowDown' ? 1 : -1) + total) % total
}
