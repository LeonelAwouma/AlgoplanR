/**
 * Paramètres du moteur : configuration du serveur Django (DEFAULT_CONFIG du
 * moteur d'origine) ↔ `EngineSettings` du contrat.
 *
 * Le serveur ne règle qu'une partie des paramètres de l'interface : âges,
 * pondérations du barème et du score, points de proximité et de situation
 * familiale, ajustements, coefficients de vulnérabilité, phase des vœux et
 * règles du besoin (norme, première section, regroupement multigrade, double
 * flux). Les autres règles y sont fixées dans le code (seuils de difficulté 30
 * et 15, tranches de REM, barème C1 à C5…) : elles sont lues ici telles que le
 * serveur les applique, et une modification de l'interface ne leur est pas
 * transmise — l'interface les montre alors comme « non appliquées ».
 */

import { anneeScolaireCourante } from '../../../kernel/annee'
import type { EngineSettings, MiseAJourParametres } from '../../contrat'

/** Configuration telle que la sert le serveur. */
export interface ConfigDjango {
  seuils: {
    anciennete_poste_recevabilite_ans: number
    age_senior_ans: number
    age_jeune_ans: number
    age_retraite_ans: number
  }
  poids_bareme_individuel: {
    C1_carriere_zone: number
    C2_anciennete_poste: number
    C3_charges_familiales: number
    C4_formation_continue: number
    C5_cohorte_age: number
  }
  points_situation_familiale: Record<string, number>
  poids_score_appariement: {
    Z1_bareme_individu: number
    Z2_poids_poste_Up: number
    Z3_proximite: number
    Z4_ajustements: number
  }
  points_proximite: { meme_commune: number; meme_departement: number; autre: number }
  ajustements_contextuels: {
    appui_multigrades_jeune: number
    senior_vers_encadrement: number
    allegement_senior_standard: number
    transition_rural_urbain: number
    bonification_ciblee: number
  }
  vulnerabilite: { t1: number; t2: number }
  besoin: {
    norme_eleves_par_maitre: number
    effectif_premiere_section: number
    nombre_niveaux: number
    niveaux_par_maitre_multigrade: number
    minimum_selon_multigrades: boolean
    double_flux_autorise: boolean
  }
  regles_dreb: {
    phase1_voeux_actif: boolean
    phase2_proximite_iaeb: boolean
    phase2_proximite_departement: boolean
    phase3_extension_regionale: boolean
    phase4_vivier_recrutement: boolean
    regions_etanches: boolean
  }
}

/** Situations familiales que le serveur accepte : une autre clé est refusée (422). */
const SITUATIONS_DJANGO = ['celibataire', 'divorce', 'veuf', 'marie']

/**
 * Règles du moteur de référence que le serveur ne paramètre pas. Celles qu'il
 * applique en dur sont alignées sur son code (domaine/diagnostic/indicateurs.py).
 */
const REGLES_FIXES: Omit<EngineSettings, 'scoring'> & { scoring: Omit<EngineSettings['scoring'], 'seuils'> } = {
  anneeScolaire: '',
  besoin: {
    elevesParMaitre: 60,
    toleranceArrondi: 20,
    niveauxParMaitre: 2,
    minimumSelonMultigrades: true,
    doubleFluxAutorise: true,
    deduireDepartsConnus: false,
    ageRetraite: 60,
    enseignantsParClasseRepli: 1,
  },
  sourceDesPostes: 'besoinCalcule',
  seuilsSeverite: { faible: 0.15, important: 0.34 },
  priorite: {
    pointsAccessibilite: { urbain: 5, semi_urbain: 10, rural: 15, rural_enclave: 20 },
    pointsSecurite: { verte: 0, jaune: 10, rouge: 25 },
    coefAccessibilite: 0.3,
    coefSecurite: 0.7,
    seuilNiveau1: 30,
    seuilNiveau2: 15,
    tranchesBesoin: [
      { remMax: 80, points: 0 },
      { remMax: 100, points: 5 },
      { remMax: 150, points: 10 },
    ],
    pointsBesoinAuDela: 15,
  },
  mobilite: {
    stabiliteMinimaleAns: 5,
    ancienneteDebutPointsAns: 6,
    pointsAncienneteBase: 5,
    pointsParAnSupplementaire: 1,
    plafondAnciennete: 0,
    anneesAvantRetraite: 5,
    malusRetraite: 5,
    pointsAnneeNiveau1: 2,
    pointsAnneeNiveau2: 1,
    plancherZoneDifficile: 10,
    nombreMaxVoeux: 3,
    ordreExamen: 'voeux',
    phaseVoeux: true,
    stabilitePourObligatoire: true,
    protegerProchesRetraite: true,
    solutionProche: true,
    redeploiementObligatoire: true,
    regleZoneRouge: true,
    regionsEtanches: true,
    projectionN2: true,
    departageFeminin: false,
  },
  recrutement: { tauxAttritionHorsRetraite: 2 },
  scoring: {
    poidsBaremeIndividuel: {
      carriereZone: 0.3,
      anciennetePoste: 0.25,
      chargesFamiliales: 0.2,
      formationContinue: 0.15,
      cohorteAge: 0.1,
    },
    pointsSituationFamiliale: { celibataire: 10, divorce: 8, veuf: 8, marie: 5 },
    pointsParEnfant: 2,
    pointsParFormation: 2,
    plafondFormation: 10,
    pointsCohorte: { jeune: 10, median: 8, senior: 5 },
    poidsScoreAppariement: { bareme: 0.25, poidsPoste: 0.25, proximite: 0.25, ajustements: 0.25 },
    pointsProximite: { memeCommune: 60, memeIaeb: 30, memeDepartement: 30, memeRegion: 0, autre: 0 },
    ajustements: {
      jeuneVersMultigrades: 15,
      seniorVersEncadrement: 15,
      allegementSenior: 8,
      transitionRuralUrbain: 12,
      bonificationCiblee: 20,
    },
  },
}

/** Configuration du serveur → paramètres du contrat. */
export function versEngineSettings(c: ConfigDjango, anneeScolaire: string = anneeScolaireCourante()): EngineSettings {
  const f = REGLES_FIXES
  return {
    ...f,
    anneeScolaire,
    besoin: {
      ...f.besoin,
      ageRetraite: c.seuils.age_retraite_ans,
      elevesParMaitre: c.besoin.norme_eleves_par_maitre,
      toleranceArrondi: c.besoin.effectif_premiere_section,
      niveauxParMaitre: c.besoin.niveaux_par_maitre_multigrade,
      minimumSelonMultigrades: c.besoin.minimum_selon_multigrades,
      doubleFluxAutorise: c.besoin.double_flux_autorise,
    },
    priorite: { ...f.priorite, coefAccessibilite: c.vulnerabilite.t1, coefSecurite: c.vulnerabilite.t2 },
    mobilite: {
      ...f.mobilite,
      stabiliteMinimaleAns: c.seuils.anciennete_poste_recevabilite_ans,
      phaseVoeux: c.regles_dreb.phase1_voeux_actif,
      regionsEtanches: c.regles_dreb.regions_etanches,
    },
    scoring: {
      ...f.scoring,
      seuils: { ageJeuneAns: c.seuils.age_jeune_ans, ageSeniorAns: c.seuils.age_senior_ans },
      poidsBaremeIndividuel: {
        carriereZone: c.poids_bareme_individuel.C1_carriere_zone,
        anciennetePoste: c.poids_bareme_individuel.C2_anciennete_poste,
        chargesFamiliales: c.poids_bareme_individuel.C3_charges_familiales,
        formationContinue: c.poids_bareme_individuel.C4_formation_continue,
        cohorteAge: c.poids_bareme_individuel.C5_cohorte_age,
      },
      pointsSituationFamiliale: { ...c.points_situation_familiale },
      poidsScoreAppariement: {
        bareme: c.poids_score_appariement.Z1_bareme_individu,
        poidsPoste: c.poids_score_appariement.Z2_poids_poste_Up,
        proximite: c.poids_score_appariement.Z3_proximite,
        ajustements: c.poids_score_appariement.Z4_ajustements,
      },
      pointsProximite: {
        ...f.scoring.pointsProximite,
        memeCommune: c.points_proximite.meme_commune,
        memeDepartement: c.points_proximite.meme_departement,
        autre: c.points_proximite.autre,
      },
      ajustements: {
        jeuneVersMultigrades: c.ajustements_contextuels.appui_multigrades_jeune,
        seniorVersEncadrement: c.ajustements_contextuels.senior_vers_encadrement,
        allegementSenior: c.ajustements_contextuels.allegement_senior_standard,
        transitionRuralUrbain: c.ajustements_contextuels.transition_rural_urbain,
        bonificationCiblee: c.ajustements_contextuels.bonification_ciblee,
      },
    },
  }
}

type Objet = Record<string, unknown>

/** Ajoute `valeur` sous `chemin` si elle est définie. */
function poser(cible: Objet, chemin: string[], valeur: unknown): void {
  if (valeur === undefined) return
  let noeud = cible
  for (const cle of chemin.slice(0, -1)) {
    noeud[cle] ??= {}
    noeud = noeud[cle] as Objet
  }
  noeud[chemin[chemin.length - 1]] = valeur
}

/**
 * Paramètres du contrat (complets ou partiels) → configuration du serveur.
 * Seules les règles que le serveur connaît sont transmises ; les clés absentes
 * de la mise à jour restent absentes, pour une fusion partielle (PATCH).
 */
export function versConfigDjango(p: MiseAJourParametres): Partial<ConfigDjango> {
  const c: Objet = {}
  const s = p.scoring
  poser(c, ['seuils', 'anciennete_poste_recevabilite_ans'], p.mobilite?.stabiliteMinimaleAns)
  poser(c, ['seuils', 'age_jeune_ans'], s?.seuils?.ageJeuneAns)
  poser(c, ['seuils', 'age_senior_ans'], s?.seuils?.ageSeniorAns)
  poser(c, ['seuils', 'age_retraite_ans'], p.besoin?.ageRetraite)

  const b = s?.poidsBaremeIndividuel
  poser(c, ['poids_bareme_individuel', 'C1_carriere_zone'], b?.carriereZone)
  poser(c, ['poids_bareme_individuel', 'C2_anciennete_poste'], b?.anciennetePoste)
  poser(c, ['poids_bareme_individuel', 'C3_charges_familiales'], b?.chargesFamiliales)
  poser(c, ['poids_bareme_individuel', 'C4_formation_continue'], b?.formationContinue)
  poser(c, ['poids_bareme_individuel', 'C5_cohorte_age'], b?.cohorteAge)

  for (const [cle, points] of Object.entries(s?.pointsSituationFamiliale ?? {})) {
    if (SITUATIONS_DJANGO.includes(cle)) poser(c, ['points_situation_familiale', cle], points)
  }

  const z = s?.poidsScoreAppariement
  poser(c, ['poids_score_appariement', 'Z1_bareme_individu'], z?.bareme)
  poser(c, ['poids_score_appariement', 'Z2_poids_poste_Up'], z?.poidsPoste)
  poser(c, ['poids_score_appariement', 'Z3_proximite'], z?.proximite)
  poser(c, ['poids_score_appariement', 'Z4_ajustements'], z?.ajustements)

  const pp = s?.pointsProximite
  poser(c, ['points_proximite', 'meme_commune'], pp?.memeCommune)
  poser(c, ['points_proximite', 'meme_departement'], pp?.memeDepartement)
  poser(c, ['points_proximite', 'autre'], pp?.autre)

  const a = s?.ajustements
  poser(c, ['ajustements_contextuels', 'appui_multigrades_jeune'], a?.jeuneVersMultigrades)
  poser(c, ['ajustements_contextuels', 'senior_vers_encadrement'], a?.seniorVersEncadrement)
  poser(c, ['ajustements_contextuels', 'allegement_senior_standard'], a?.allegementSenior)
  poser(c, ['ajustements_contextuels', 'transition_rural_urbain'], a?.transitionRuralUrbain)
  poser(c, ['ajustements_contextuels', 'bonification_ciblee'], a?.bonificationCiblee)

  poser(c, ['besoin', 'norme_eleves_par_maitre'], p.besoin?.elevesParMaitre)
  poser(c, ['besoin', 'effectif_premiere_section'], p.besoin?.toleranceArrondi)
  poser(c, ['besoin', 'niveaux_par_maitre_multigrade'], p.besoin?.niveauxParMaitre)
  poser(c, ['besoin', 'minimum_selon_multigrades'], p.besoin?.minimumSelonMultigrades)
  poser(c, ['besoin', 'double_flux_autorise'], p.besoin?.doubleFluxAutorise)
  poser(c, ['vulnerabilite', 't1'], p.priorite?.coefAccessibilite)
  poser(c, ['vulnerabilite', 't2'], p.priorite?.coefSecurite)
  poser(c, ['regles_dreb', 'phase1_voeux_actif'], p.mobilite?.phaseVoeux)
  poser(c, ['regles_dreb', 'regions_etanches'], p.mobilite?.regionsEtanches)
  return c as Partial<ConfigDjango>
}
