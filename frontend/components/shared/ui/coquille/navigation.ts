/**
 * Définition de la navigation.
 *
 * La barre latérale ne liste plus les écrans un à un : elle propose une
 * rubrique par variable que l'application calcule ou fait décider (données de
 * référence, écoles prioritaires, affectations, quotas, nominations, rapport,
 * règles). Chaque rubrique ordonne ses écrans comme une chaîne de calcul :
 * d'abord les éléments qui composent la variable, puis l'écran du choix final,
 * marqué `finale`. Cette chaîne est affichée en tête de page (`EtapesRubrique`).
 *
 * Les écrans techniques ne sont proposés qu'en Vue analyste : la Vue simplifiée
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
  ScrollText,
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

/** Vue simplifiée (décideurs) ou Vue analyste (détail technique complet). */
export type ViewMode = 'simple' | 'analyste'

/** Rôle de la personne connectée : le DRH voit tout, un délégué régional ne voit que sa région. */
export type RoleAcces = 'drh' | 'delegue'

/** Un écran, c'est-à-dire une étape d'une rubrique. */
export interface NavItem {
  id: PageKey
  label: string
  /** Courte explication affichée sous le titre de la page. */
  sousTitre?: string
  icon: typeof LayoutDashboard
  /** `true` si l'écran porte le choix final de la rubrique (et non l'un de ses éléments). */
  finale?: boolean
  /** `true` si l'entrée n'apparaît qu'en Vue analyste. */
  analysteSeulement?: boolean
  /** `true` si l'entrée est réservée au DRH : décisions et règles qui engagent tout le pays. */
  drhSeulement?: boolean
  /** L'entrée exige qu'un diagnostic ait été calculé. */
  exigeDonnees?: boolean
  /** L'entrée exige qu'une simulation ait été exécutée. */
  exigeSimulation?: boolean
}

/** Une variable de l'application et la chaîne d'écrans qui y mène. */
export interface Rubrique {
  id: string
  label: string
  /** Ce qui est décidé ou calculé au bout de la chaîne. */
  sousTitre: string
  icon: typeof LayoutDashboard
  /** Éléments de la variable, dans l'ordre du calcul, puis le choix final. */
  etapes: NavItem[]
}

/** Ce qui est prêt dans le jeu ouvert : détermine les écrans accessibles. */
export interface EtatJeu {
  donneesChargees: boolean
  simulationPrete: boolean
}

export const RUBRIQUES: Rubrique[] = [
  {
    id: 'donnees',
    label: 'Données de référence',
    sousTitre: 'Choix final : le jeu de données validé',
    icon: Upload,
    etapes: [
      { id: 'import', label: 'Ajouter les données', sousTitre: 'Import et contrôle qualité', icon: Upload },
      {
        id: 'data',
        label: 'Qualité des données',
        sousTitre: 'Colonnes reconnues et contrôles',
        icon: Database,
        analysteSeulement: true,
        exigeDonnees: true,
      },
      {
        id: 'validation',
        label: 'Validation et actualisation',
        sousTitre: 'Données de référence de l’exercice',
        icon: BadgeCheck,
        exigeDonnees: true,
        finale: true,
      },
    ],
  },
  {
    id: 'accueil',
    label: 'Tableau de bord',
    sousTitre: 'Synthèse de toutes les variables',
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
    ],
  },
  {
    id: 'besoins',
    label: 'Besoin des écoles',
    sousTitre: 'Choix final : les écoles prioritaires',
    icon: ListChecks,
    etapes: [
      {
        id: 'teachers',
        label: 'Enseignants en poste',
        sousTitre: 'Personnel disponible par école',
        icon: Users,
        exigeDonnees: true,
      },
      {
        id: 'schools',
        label: 'Besoin par école',
        sousTitre: 'Effectifs, classes, dotation et écart',
        icon: Building2,
        exigeDonnees: true,
      },
      { id: 'territoires', label: 'Territoires', sousTitre: 'Carte et exploration', icon: Map, exigeDonnees: true },
      {
        id: 'diagnostic',
        label: 'Situation nationale',
        sousTitre: 'Déficits et excédents agrégés',
        icon: BarChart3,
        exigeDonnees: true,
      },
      {
        id: 'priorites',
        label: 'Écoles prioritaires',
        sousTitre: 'Classement retenu pour les affectations',
        icon: ListChecks,
        exigeDonnees: true,
        finale: true,
      },
    ],
  },
  {
    id: 'affectations',
    label: 'Affectations',
    sousTitre: 'Choix final : les propositions arbitrées',
    icon: Gavel,
    etapes: [
      {
        id: 'prince',
        label: 'Fait de Prince',
        sousTitre: 'Redéploiements décidés par la DRH',
        icon: Crown,
        exigeDonnees: true,
        drhSeulement: true,
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
        id: 'pool',
        label: 'Vivier',
        sousTitre: 'Enseignants mobilisables du scénario',
        icon: GraduationCap,
        analysteSeulement: true,
        exigeSimulation: true,
      },
      {
        id: 'posts',
        label: 'Postes',
        sousTitre: 'Postes à pourvoir et leur poids',
        icon: ClipboardList,
        analysteSeulement: true,
        exigeSimulation: true,
      },
      {
        id: 'assignments',
        label: 'Affectations calculées',
        sousTitre: 'Score de chaque appariement',
        icon: Sigma,
        analysteSeulement: true,
        exigeSimulation: true,
      },
      {
        id: 'unassigned',
        label: 'Non affectés',
        icon: UserX,
        analysteSeulement: true,
        exigeSimulation: true,
      },
      {
        id: 'logs',
        label: 'Journal de simulation',
        icon: ScrollText,
        analysteSeulement: true,
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
        finale: true,
      },
    ],
  },
  {
    id: 'quotas',
    label: 'Quotas de recrutement',
    sousTitre: 'Choix final : les quotas validés',
    icon: ClipboardCheck,
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
        id: 'rapport-previsionnel',
        label: 'Rapport prévisionnel',
        sousTitre: 'Scénarios, retraites par région, redéploiement, priorités',
        icon: FileText,
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
    id: 'nominations',
    label: 'Nominations',
    sousTitre: 'Choix final : les nominations validées',
    icon: UserRoundCheck,
    etapes: [
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
    ],
  },
  {
    id: 'suivi',
    label: 'Suivi et rapports',
    sousTitre: 'Choix final : le rapport de synthèse',
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
        id: 'audit',
        label: 'Journal d’audit',
        sousTitre: 'Toutes les décisions, horodatées',
        icon: History,
        exigeDonnees: true,
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
    // « Règles » et non « Paramètres » : ce qu'on y règle, ce sont les règles de l'analyse.
    id: 'regles',
    label: 'Règles de calcul',
    sousTitre: 'Choix final : le référentiel appliqué',
    icon: BookMarked,
    etapes: [
      { id: 'methodology', label: 'Méthodologie', sousTitre: 'Formules expliquées', icon: BookOpen },
      {
        id: 'engine',
        label: 'Configuration du moteur',
        sousTitre: 'Barème, poids et phases',
        icon: SlidersHorizontal,
        analysteSeulement: true,
        drhSeulement: true,
      },
      {
        id: 'settings',
        label: 'Référentiel',
        sousTitre: "Règles utilisées pour l'analyse",
        icon: BookMarked,
        drhSeulement: true,
        finale: true,
      },
    ],
  },
]

/** Gestion des comptes des délégués régionaux (suspension, sessions, mot de passe temporaire, historique). */
export const PAGE_ACCES: NavItem = {
  id: 'acces',
  label: 'Comptes et accès',
  sousTitre: 'Délégués régionaux et historique des accès',
  icon: KeyRound,
  drhSeulement: true,
}

const TOUTES = [...RUBRIQUES.flatMap(r => r.etapes), PAGE_ACCES]

/** Titre de page affiché dans l'en-tête. */
export function titreDePage(page: PageKey): string {
  return TOUTES.find(i => i.id === page)?.label ?? "Vue d'ensemble"
}

/** Sous-titre de page, quand il existe. */
export function sousTitreDePage(page: PageKey): string | undefined {
  return TOUTES.find(i => i.id === page)?.sousTitre
}

/** Rubrique qui contient la page. */
export function rubriqueDePage(page: PageKey): Rubrique | undefined {
  return RUBRIQUES.find(r => r.etapes.some(e => e.id === page))
}

/** Vrai si la page est réservée au DRH : un délégué ne doit ni la voir dans le menu ni l'ouvrir. */
export function pageReserveeAuDrh(page: PageKey): boolean {
  return TOUTES.some(i => i.id === page && i.drhSeulement)
}

/** Étapes d'une rubrique visibles dans le mode d'affichage courant, pour le rôle connecté. */
export function etapesVisibles(rubrique: Rubrique, mode: ViewMode, role: RoleAcces): NavItem[] {
  return rubrique.etapes.filter(
    e => (mode === 'analyste' || !e.analysteSeulement) && (role === 'drh' || !e.drhSeulement),
  )
}

/** Rubriques ayant au moins une étape visible. */
export function rubriquesVisibles(mode: ViewMode, role: RoleAcces): Rubrique[] {
  return RUBRIQUES.filter(r => etapesVisibles(r, mode, role).length > 0)
}

/** Vrai si l'écran peut être ouvert avec ce qui est prêt dans le jeu. */
export function etapeAccessible(etape: NavItem, etat: EtatJeu): boolean {
  return !(etape.exigeDonnees && !etat.donneesChargees) && !(etape.exigeSimulation && !etat.simulationPrete)
}

/** Premier écran ouvrable d'une rubrique, `undefined` si aucun ne l'est encore. */
export function premiereEtapeAccessible(
  rubrique: Rubrique,
  mode: ViewMode,
  role: RoleAcces,
  etat: EtatJeu,
): NavItem | undefined {
  return etapesVisibles(rubrique, mode, role).find(e => etapeAccessible(e, etat))
}
