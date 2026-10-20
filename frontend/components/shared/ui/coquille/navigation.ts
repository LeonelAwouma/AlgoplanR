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
 * les écrans de pilotage.
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
      },
      {
        id: 'comparison',
        label: 'Comparaison',
        sousTitre: 'Avant / après et scénarios',
        icon: ArrowRightLeft,
        exigeDonnees: true,
      },
      {
        id: 'arbitrage',
        label: 'Commission d’arbitrage',
        sousTitre: 'Valider, rejeter ou corriger les propositions',
        icon: Gavel,
        exigeSimulation: true,
      },
      {
        id: 'vivier',
        label: 'Vivier et postes ouverts',
        sousTitre: 'Personnes disponibles, rapprochement',
        icon: UsersRound,
        exigeSimulation: true,
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
      },
      {
        id: 'pool',
        label: 'Vivier du scénario',
        sousTitre: 'Enseignants mobilisables du scénario',
        icon: GraduationCap,
        onglet: true,
        analysteSeulement: true,
        exigeSimulation: true,
      },
      {
        id: 'posts',
        label: 'Postes',
        sousTitre: 'Postes à pourvoir et leur poids',
        icon: ClipboardList,
        onglet: true,
        analysteSeulement: true,
        exigeSimulation: true,
      },
      {
        id: 'assignments',
        label: 'Affectations calculées',
        sousTitre: 'Score de chaque appariement',
        icon: Sigma,
        onglet: true,
        analysteSeulement: true,
        exigeSimulation: true,
      },
      {
        id: 'unassigned',
        label: 'Non affectés',
        icon: UserX,
        onglet: true,
        analysteSeulement: true,
        exigeSimulation: true,
      },
      {
        id: 'logs',
        label: 'Journal de simulation',
        icon: ScrollText,
        onglet: true,
        analysteSeulement: true,
        exigeSimulation: true,
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
        id: 'reports',
        label: 'Rapport',
        sousTitre: 'Synthèse décisionnelle',
        icon: FileText,
        exigeDonnees: true,
        finale: true,
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

/** Vrai si la page n'existe qu'en Vue analyste, réservée au DRH : un délégué ne l'ouvre jamais. */
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
  return !(etape.exigeDonnees && !etat.donneesChargees) && !(etape.exigeSimulation && !etat.simulationPrete)
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
