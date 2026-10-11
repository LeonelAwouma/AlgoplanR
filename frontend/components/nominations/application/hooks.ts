'use client'

/**
 * Cas d'usage du contexte « Nominations » : vivier, postes ouverts, cycle de
 * vie des nominations, registre des mouvements.
 *
 * Nature des écritures, pour les invalidations :
 *   - proposer, rejeter, annuler, générer : sans effet sur les effectifs (`nominations`) ;
 *   - valider, mettre en œuvre, réaliser un mouvement : les effectifs prévus ou
 *     réalisés changent, la planification aussi (`effectifs`).
 */

import type {
  CorpsGenerationNominations,
  CorpsImportNominations,
  CorpsImportVivier,
  CorpsLotNominations,
  CorpsMiseEnOeuvre,
  CorpsMiseEnOeuvreMouvement,
  CorpsMotifNomination,
  CorpsNomination,
  CorpsValidationNomination,
  DemandePage,
  FiltresMouvements,
  FiltresNominations,
  IdJeu,
  StatutPoste,
} from '../../shared/api'
import { useEcritureJeu, useLectureJeu } from '../../shared/requetes'
import {
  annulerNomination,
  controlerMouvements,
  genererNominations,
  importerNominations,
  importerVivier,
  lireMouvement,
  lireNomination,
  lirePersonneVivier,
  lireSyntheseNominations,
  listerCandidatsPoste,
  listerMouvements,
  listerMouvementsPersonne,
  listerNominations,
  listerPostesCompatibles,
  listerPostesOuverts,
  listerVivier,
  mettreEnOeuvreNomination,
  proposerNomination,
  realiserMouvement,
  rejeterNomination,
  traiterNominationsEnLot,
  validerNomination,
  type FiltresVivier,
} from '../infrastructure/nominationsApi'

// --- Vivier et postes ouverts ----------------------------------------------------------------------

/** Personnes disponibles, toutes sources confondues. */
export function useVivier(jeu: IdJeu | null, filtres: FiltresVivier = {}) {
  return useLectureJeu(jeu, 'vivier', ['liste', filtres], (id, signal) => listerVivier(id, filtres, signal))
}

/** Fiche d'une personne du vivier ; rien n'est demandé sans personne choisie. */
export function usePersonneVivier(jeu: IdJeu | null, personne: string | null) {
  return useLectureJeu(
    jeu,
    'vivier',
    ['fiche', personne],
    (id, signal) => lirePersonneVivier(id, personne ?? '', signal),
    { active: personne !== null },
  )
}

/** Postes compatibles avec une personne, classés. */
export function usePostesCompatibles(jeu: IdJeu | null, personne: string | null) {
  return useLectureJeu(
    jeu,
    'vivier',
    ['postes-compatibles', personne],
    (id, signal) => listerPostesCompatibles(id, personne ?? '', signal),
    { active: personne !== null },
  )
}

/** Ajoute au vivier des personnes d'une autre source. */
export function useImporterVivier(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'nominations', (id, corps: CorpsImportVivier) => importerVivier(id, corps))
}

/** Postes vacants et leur statut. */
export function usePostesOuverts(
  jeu: IdJeu | null,
  filtres: DemandePage & { statut?: StatutPoste; region?: string | null; departement?: string | null } = {},
) {
  return useLectureJeu(jeu, 'postes-ouverts', ['liste', filtres], (id, signal) =>
    listerPostesOuverts(id, filtres, signal),
  )
}

/** Personnes du vivier classées pour un poste ; rien n'est demandé sans poste choisi. */
export function useCandidatsPoste(jeu: IdJeu | null, poste: string | null) {
  return useLectureJeu(
    jeu,
    'postes-ouverts',
    ['candidats', poste],
    (id, signal) => listerCandidatsPoste(id, poste ?? '', signal),
    { active: poste !== null },
  )
}

// --- Nominations ----------------------------------------------------------------------------------------

/** Nominations filtrées. */
export function useNominations(jeu: IdJeu | null, filtres: FiltresNominations & DemandePage = {}) {
  return useLectureJeu(jeu, 'nominations', ['liste', filtres], (id, signal) => listerNominations(id, filtres, signal))
}

/** Décomptes par statut, territoire et année. */
export function useSyntheseNominations(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'nominations', ['synthese'], lireSyntheseNominations)
}

/** Détail d'une nomination ; rien n'est demandé sans nomination choisie. */
export function useNomination(jeu: IdJeu | null, nomination: string | null) {
  return useLectureJeu(
    jeu,
    'nominations',
    ['fiche', nomination],
    (id, signal) => lireNomination({ jeu: id, nomination: nomination ?? '' }, signal),
    { active: nomination !== null },
  )
}

/** Propose manuellement une personne sur un poste. */
export function useProposerNomination(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'nominations', (id, corps: CorpsNomination) => proposerNomination(id, corps))
}

/** Génère des propositions automatiques. */
export function useGenererNominations(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'nominations', (id, corps: CorpsGenerationNominations) => genererNominations(id, corps))
}

/** Valide une nomination : le poste est réservé et la planification compte la nomination en « prévu ». */
export function useValiderNomination(jeu: IdJeu | null) {
  return useEcritureJeu(
    jeu,
    'effectifs',
    (id, { nomination, corps }: { nomination: string; corps: CorpsValidationNomination }) =>
      validerNomination({ jeu: id, nomination }, corps),
  )
}

/** Rejette une proposition. */
export function useRejeterNomination(jeu: IdJeu | null) {
  return useEcritureJeu(
    jeu,
    'nominations',
    (id, { nomination, corps }: { nomination: string; corps: CorpsMotifNomination }) =>
      rejeterNomination({ jeu: id, nomination }, corps),
  )
}

/** Met en œuvre une nomination validée : les effectifs réels changent. */
export function useMettreEnOeuvreNomination(jeu: IdJeu | null) {
  return useEcritureJeu(
    jeu,
    'effectifs',
    (id, { nomination, corps }: { nomination: string; corps: CorpsMiseEnOeuvre }) =>
      mettreEnOeuvreNomination({ jeu: id, nomination }, corps),
  )
}

/**
 * Annule une nomination proposée ou validée. Une nomination validée réservait
 * un poste : l'annulation change donc les effectifs prévus.
 */
export function useAnnulerNomination(jeu: IdJeu | null) {
  return useEcritureJeu(
    jeu,
    'effectifs',
    (id, { nomination, corps }: { nomination: string; corps: CorpsMotifNomination }) =>
      annulerNomination({ jeu: id, nomination }, corps),
  )
}

/** Valide ou rejette plusieurs nominations. */
export function useTraiterNominationsEnLot(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'effectifs', (id, corps: CorpsLotNominations) => traiterNominationsEnLot(id, corps))
}

/** Importe des nominations décidées ou réalisées hors de l'application. */
export function useImporterNominations(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'effectifs', (id, corps: CorpsImportNominations) => importerNominations(id, corps))
}

// --- Registre des mouvements -----------------------------------------------------------------------------

/** Registre consolidé des mouvements. */
export function useMouvements(jeu: IdJeu | null, filtres: FiltresMouvements & DemandePage = {}) {
  return useLectureJeu(jeu, 'mouvements', ['liste', filtres], (id, signal) => listerMouvements(id, filtres, signal))
}

/** Détection des doubles comptages. */
export function useControleMouvements(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'mouvements', ['controles'], controlerMouvements)
}

/** Détail d'un mouvement ; rien n'est demandé sans mouvement choisi. */
export function useMouvement(jeu: IdJeu | null, mouvement: string | null) {
  return useLectureJeu(
    jeu,
    'mouvements',
    ['fiche', mouvement],
    (id, signal) => lireMouvement(id, mouvement ?? '', signal),
    { active: mouvement !== null },
  )
}

/** Mouvements d'une personne ; rien n'est demandé sans matricule. */
export function useMouvementsPersonne(jeu: IdJeu | null, matricule: string | null) {
  return useLectureJeu(
    jeu,
    'mouvements',
    ['personne', matricule],
    (id, signal) => listerMouvementsPersonne(id, matricule ?? '', signal),
    { active: matricule !== null },
  )
}

/** Marque un redéploiement ou un déploiement de recrue comme réalisé. */
export function useRealiserMouvement(jeu: IdJeu | null) {
  return useEcritureJeu(
    jeu,
    'effectifs',
    (id, { mouvement, corps }: { mouvement: string; corps: CorpsMiseEnOeuvreMouvement }) =>
      realiserMouvement(id, mouvement, corps),
  )
}

/** Types de requête utiles à l'interface. */
export type { FiltresVivier, RefNomination } from '../infrastructure/nominationsApi'
