/**
 * Indicateurs du tableau de bord : ce que la DRH lit en premier.
 *
 * Le module est pur : il reçoit ce que les requêtes ont déjà rapporté et décide
 * de ce qui est affiché. Il ne calcule aucun résultat du moteur. Deux règles de
 * lecture s'y appliquent :
 *   - une valeur qui n'existe pas s'affiche « — », jamais un zéro ou une valeur inventée ;
 *   - chaque indicateur dit à quelle situation il se rapporte (étape) et, pour l'attrition,
 *     s'il s'agit d'une hypothèse de projection.
 */

import type {
  DegreAlea,
  Hypotheses,
  IndicateursAnnee,
  MethodeAttrition,
  SimulationResult,
  TerritorialTotals,
} from '../../shared/api'
import type { PageKey } from '../../shared/ui/coquille/navigation'

/** Situation à laquelle se rapporte un indicateur. */
export type EtapeSituation = 'effective' | 'simulation' | 'hypothese'

export const LIBELLE_ETAPE: Record<EtapeSituation, string> = {
  effective: 'Après effets du Prince',
  simulation: 'Après simulation',
  hypothese: 'Hypothèse de projection',
}

export interface Kpi {
  cle: string
  label: string
  /** Valeur prête à afficher, « — » si elle n'existe pas. */
  valeur: string
  hint: string
  etape: EtapeSituation
  /** `false` quand la valeur n'existe pas : l'indicateur n'ouvre alors aucun détail. */
  disponible: boolean
  /** Page de détail ouverte par un clic sur l'indicateur. */
  cible: PageKey
  ton?: 'ok' | 'warn' | 'alert' | 'info'
}

export interface EntreeKpis {
  totals: TerritorialTotals
  /** Écoles du jeu, tous filtres levés. */
  ecolesDuJeu: number
  /** Résultat du scénario affiché, `null` tant qu'aucun scénario n'est choisi. */
  resultat: Pick<
    SimulationResult,
    'scenarioNom' | 'assignments' | 'postesCouverts' | 'besoinResiduel' | 'tauxCouverture'
  > | null
  hypotheses: Pick<Hypotheses, 'attrition'> | null
  alea: Pick<DegreAlea, 'national'> | null
  /** Première année de la planification (N+1), `null` si elle n'est pas disponible. */
  anneePlan: Pick<IndicateursAnnee, 'quotaCalcule' | 'quotaRetenu' | 'besoinRestant'> | null
  /**
   * Pourquoi `resultat` est vide, pour l'expliquer au lieu d'un simple « — » : scénario en cours de lecture
   * (`chargement`), jeu sans scénario calculé (`aucun_scenario`), ou « situation actuelle » choisie
   * (`situation_actuelle`). Absent quand le résultat est là.
   */
  raisonSansResultat?: 'chargement' | 'aucun_scenario' | 'situation_actuelle' | null
}

/** Texte de la carte « Affectations proposées » : d'où viennent les propositions, ou pourquoi il n'y en a pas encore. */
export function indiceAffectations(e: Pick<EntreeKpis, 'resultat' | 'raisonSansResultat'>): string {
  if (e.resultat) {
    return `Scénario : ${e.resultat.scenarioNom}. Chaque proposition est classée par score d’appariement (barème, poids du poste, proximité, ajustements).`
  }
  switch (e.raisonSansResultat) {
    case 'chargement':
      return 'Lecture du scénario en cours : les propositions s’affichent dès qu’il est chargé.'
    case 'aucun_scenario':
      return 'Aucun scénario calculé : lancez « Calculer » pour obtenir des propositions classées par score d’appariement.'
    case 'situation_actuelle':
      return 'Situation actuelle sans simulation : choisissez un scénario pour voir les propositions, classées par score d’appariement.'
    default:
      return 'Aucun scénario n’est encore choisi.'
  }
}

const TIRET = '—'

const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

function entier(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? TIRET : NOMBRE.format(Math.round(v))
}

function decimal(v: number | null | undefined, decimales: number): string {
  if (v == null || !Number.isFinite(v)) return TIRET
  return v.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

/** Taux d'attrition en %, au centième près (2,25 % ne devient pas 2,3 %) mais sans zéro inutile (2,5 %). */
function tauxAttrition(v: number): string {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

function pourcentage(taux: number | null | undefined): string {
  return taux == null || !Number.isFinite(taux) ? TIRET : `${NOMBRE.format(Math.round(taux * 100))} %`
}

const LIBELLE_METHODE: Record<MethodeAttrition, string> = {
  taux_unique: 'taux unique',
  par_sous_systeme: 'par sous-système',
  par_region: 'par région',
}

/**
 * Taux d'attrition annuel (hors retraite) tel que posé dans les hypothèses :
 * une valeur pour un taux unique, une fourchette quand il varie.
 */
export function attritionAffichee(h: Pick<Hypotheses, 'attrition'> | null): { valeur: string; methode: string } {
  if (!h) return { valeur: TIRET, methode: '' }
  const a = h.attrition
  const taux =
    a.methode === 'taux_unique'
      ? [a.tauxUnique]
      : a.methode === 'par_sous_systeme'
        ? Object.values(a.parSousSysteme).filter((t): t is number => typeof t === 'number')
        : Object.values(a.parRegion)
  if (taux.length === 0) return { valeur: TIRET, methode: LIBELLE_METHODE[a.methode] }
  const min = Math.min(...taux)
  const max = Math.max(...taux)
  return {
    valeur: min === max ? `${tauxAttrition(min)} %` : `${tauxAttrition(min)} à ${tauxAttrition(max)} %`,
    methode: LIBELLE_METHODE[a.methode],
  }
}

/** Recrutements à prévoir en N+1 : le quota retenu s'il est fixé, sinon le quota calculé. */
export function recrutementsNecessaires(annee: EntreeKpis['anneePlan']): number | null {
  if (!annee) return null
  return annee.quotaRetenu ?? annee.quotaCalcule
}

/**
 * Les sept indicateurs visibles d'emblée et les quatre consultables en dessous.
 * Le REM national est celui des totaux : somme des élèves ÷ somme des enseignants
 * des écoles concernées, non la moyenne des REM des écoles.
 */
export function construireKpis(e: EntreeKpis): { principaux: Kpi[]; secondaires: Kpi[] } {
  const { totals, resultat } = e
  const filtre = e.ecolesDuJeu > totals.ecolesAnalysees
  const alea = e.alea?.national ?? null
  const attrition = attritionAffichee(e.hypotheses)
  const recrutements = recrutementsNecessaires(e.anneePlan)

  const principaux: Kpi[] = [
    {
      cle: 'ecoles',
      label: 'Écoles enregistrées',
      valeur: entier(totals.ecolesAnalysees),
      hint: filtre
        ? `Sur ${entier(e.ecolesDuJeu)} écoles du référentiel : le périmètre sélectionné.`
        : 'Couverture du référentiel.',
      etape: 'effective',
      disponible: true,
      cible: 'schools',
    },
    {
      cle: 'necessiteuses',
      label: 'Écoles nécessiteuses',
      valeur: entier(totals.ecolesEnDeficit),
      hint: 'Il y manque au moins un enseignant au regard de la norme paramétrée.',
      etape: 'effective',
      disponible: true,
      cible: 'priorites',
      ton: totals.ecolesEnDeficit > 0 ? 'alert' : 'ok',
    },
    {
      cle: 'enseignants',
      label: 'Enseignants en poste',
      valeur: entier(totals.enseignantsEtat),
      hint: 'Effectif déclaré, payé par l’État.',
      etape: 'effective',
      disponible: true,
      cible: 'teachers',
    },
    {
      cle: 'affectations',
      label: 'Affectations proposées',
      valeur: resultat ? entier(resultat.assignments.length) : TIRET,
      hint: indiceAffectations(e),
      etape: 'simulation',
      disponible: resultat !== null,
      cible: 'simulations',
      ton: 'info',
    },
    {
      cle: 'rem',
      label: 'Taux d’encadrement',
      valeur: decimal(totals.elevesParEnseignantEtat, 1),
      hint: 'Élèves par enseignant (national) : somme des élèves ÷ somme des enseignants, non la moyenne des écoles.',
      etape: 'effective',
      disponible: totals.elevesParEnseignantEtat != null,
      cible: 'territoires',
    },
    {
      cle: 'attrition',
      label: 'Taux d’attrition',
      valeur: attrition.valeur,
      hint: attrition.methode
        ? `Hypothèse annuelle hors retraite (${attrition.methode}), non un taux observé.`
        : 'Hypothèse annuelle non disponible.',
      etape: 'hypothese',
      disponible: attrition.valeur !== TIRET,
      cible: 'hypotheses',
    },
    {
      cle: 'alea',
      label: 'Degré d’aléa',
      valeur: decimal(alea?.alea, 2),
      hint:
        alea && alea.alea == null
          ? (alea.raison ?? 'Non calculable sur ce périmètre.')
          : '1 − R² enseignants ~ élèves : 0 = répartition alignée sur les effectifs, 1 = aucun alignement.',
      etape: 'simulation',
      disponible: alea?.alea != null,
      cible: 'alea',
      ton: 'info',
    },
  ]

  const secondaires: Kpi[] = [
    {
      cle: 'restants',
      label: 'Postes restant à pourvoir',
      valeur: resultat ? entier(resultat.besoinResiduel) : TIRET,
      hint: 'Déficit après redéploiement.',
      etape: 'simulation',
      disponible: resultat !== null,
      cible: 'comparison',
      ton: 'alert',
    },
    {
      cle: 'couverture',
      label: 'Taux de couverture des besoins',
      valeur: resultat ? pourcentage(resultat.tauxCouverture) : TIRET,
      hint: 'Part du besoin couverte par le scénario.',
      etape: 'simulation',
      disponible: resultat !== null,
      cible: 'comparison',
      ton: 'ok',
    },
    {
      cle: 'redeployables',
      label: 'Enseignants redéployables',
      valeur: entier(totals.excedentMobilisable),
      hint: 'Ils peuvent quitter leur école sans la mettre en déficit.',
      etape: 'effective',
      disponible: true,
      cible: 'schools',
      ton: 'info',
    },
    {
      cle: 'recrutements',
      label: 'Recrutements nécessaires',
      valeur: entier(recrutements),
      hint: e.anneePlan?.quotaRetenu != null ? 'Quota retenu pour N+1.' : 'Quota calculé pour N+1, à valider.',
      etape: 'simulation',
      disponible: recrutements !== null,
      cible: 'quotas',
      ton: 'warn',
    },
  ]

  return { principaux, secondaires }
}
