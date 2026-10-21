/**
 * Champs que la page « Configuration du moteur » laisse modifier.
 *
 * Règle : un champ éditable doit être transmis au serveur (`versConfigDjango`) ; sinon il est absent de l'interface.
 * Un champ affiché mais ignoré par le calcul laisserait croire que le réglage agit. Le test
 * `tests/champs-moteur.test.ts` vérifie que chacun de ces chemins change la configuration envoyée au serveur.
 */

import type { ScoringConfig } from '../../shared/api'

/** Chemin d'un réglage dans `EngineSettings`. */
export type CheminReglage = readonly string[]

/** Points de proximité réglables : le serveur distingue commune, département et autre (pas d'IAEB ni de région). */
export const LIBELLES_PROXIMITE: Partial<Record<keyof ScoringConfig['pointsProximite'], string>> = {
  memeCommune: 'Même commune',
  memeDepartement: 'Même département',
  autre: 'Ailleurs',
}

/** Ajustements contextuels réglables. */
export const LIBELLES_AJUSTEMENTS: Record<keyof ScoringConfig['ajustements'], string> = {
  jeuneVersMultigrades: 'Jeune vers une école à classes multigrades',
  seniorVersEncadrement: 'Senior vers une structure d’encadrement (IAEB, DREB, délégation)',
  allegementSenior: 'Senior vers une école sans multigrade',
  transitionRuralUrbain: 'Rural vers urbain après 5 ans au poste',
  bonificationCiblee: 'Bonification ciblée (rapprochement de conjoint, suivi médical) sur l’école visée',
}

/**
 * Réglages que l'interface propose mais que le serveur ne lit pas : ils sont affichés tels qu'il les applique, sans
 * pouvoir les modifier (« non appliqué »). `tests/champs-moteur.test.ts` vérifie cette liste contre
 * `versConfigDjango` : un réglage transmis ne peut pas y figurer, et tout réglage non transmis doit être classé ici ou
 * dans `REGLAGES_FIXES`.
 */
export const REGLAGES_NON_APPLIQUES: readonly CheminReglage[] = [
  ['sourceDesPostes'],
  ['besoin', 'deduireDepartsConnus'],
  ['besoin', 'enseignantsParClasseRepli'],
  ['seuilsSeverite', 'faible'],
  ['seuilsSeverite', 'important'],
  ['priorite', 'pointsAccessibilite'],
  ['priorite', 'pointsSecurite'],
  ['priorite', 'seuilNiveau1'],
  ['priorite', 'seuilNiveau2'],
  ['priorite', 'tranchesBesoin'],
  ['priorite', 'pointsBesoinAuDela'],
  ['mobilite', 'nombreMaxVoeux'],
  ['mobilite', 'ordreExamen'],
  ['mobilite', 'anneesAvantRetraite'],
  ['mobilite', 'stabilitePourObligatoire'],
  ['mobilite', 'protegerProchesRetraite'],
  ['mobilite', 'solutionProche'],
  ['mobilite', 'redeploiementObligatoire'],
  ['mobilite', 'regleZoneRouge'],
  ['mobilite', 'projectionN2'],
  ['mobilite', 'departageFeminin'],
]

/**
 * Constantes du moteur que l'interface lit sans jamais les proposer à la modification (barème C1 à C5, proximité par
 * IAEB ou région que le serveur ne distingue pas…) ou qui ne se règlent pas ici (année scolaire : fixée à la création
 * du jeu).
 */
export const REGLAGES_FIXES: readonly CheminReglage[] = [
  ['anneeScolaire'],
  ['mobilite', 'ancienneteDebutPointsAns'],
  ['mobilite', 'pointsAncienneteBase'],
  ['mobilite', 'pointsParAnSupplementaire'],
  ['mobilite', 'plafondAnciennete'],
  ['mobilite', 'malusRetraite'],
  ['mobilite', 'pointsAnneeNiveau1'],
  ['mobilite', 'pointsAnneeNiveau2'],
  ['mobilite', 'plancherZoneDifficile'],
  ['scoring', 'pointsParEnfant'],
  ['scoring', 'pointsParFormation'],
  ['scoring', 'plafondFormation'],
  ['scoring', 'pointsCohorte'],
  ['scoring', 'pointsProximite', 'memeIaeb'],
  ['scoring', 'pointsProximite', 'memeRegion'],
]

/** Ce réglage est-il affiché sans effet sur le calcul ? (voir `REGLAGES_NON_APPLIQUES`) */
export function estNonApplique(...chemin: string[]): boolean {
  return REGLAGES_NON_APPLIQUES.some(c => c.length === chemin.length && c.every((cle, i) => cle === chemin[i]))
}

const SITUATIONS_REGLABLES = ['celibataire', 'divorce', 'veuf', 'marie']

/** Tous les champs éditables de la page, par chemin dans `EngineSettings`. */
export const CHEMINS_MOTEUR_EDITABLES: readonly CheminReglage[] = [
  ['scoring', 'poidsBaremeIndividuel', 'carriereZone'],
  ['scoring', 'poidsBaremeIndividuel', 'anciennetePoste'],
  ['scoring', 'poidsBaremeIndividuel', 'chargesFamiliales'],
  ['scoring', 'poidsBaremeIndividuel', 'formationContinue'],
  ['scoring', 'poidsBaremeIndividuel', 'cohorteAge'],
  ['scoring', 'seuils', 'ageJeuneAns'],
  ['scoring', 'seuils', 'ageSeniorAns'],
  ['priorite', 'coefAccessibilite'],
  ['priorite', 'coefSecurite'],
  ['scoring', 'poidsScoreAppariement', 'bareme'],
  ['scoring', 'poidsScoreAppariement', 'poidsPoste'],
  ['scoring', 'poidsScoreAppariement', 'proximite'],
  ['scoring', 'poidsScoreAppariement', 'ajustements'],
  ...Object.keys(LIBELLES_PROXIMITE).map(cle => ['scoring', 'pointsProximite', cle]),
  ...Object.keys(LIBELLES_AJUSTEMENTS).map(cle => ['scoring', 'ajustements', cle]),
  ...SITUATIONS_REGLABLES.map(cle => ['scoring', 'pointsSituationFamiliale', cle]),
]
