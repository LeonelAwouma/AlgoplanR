'use client'

/**
 * Cas d'usage du contexte « Données » : import, jeux, validation,
 * actualisation, fiches et recherche.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  cleJeu,
  clesGlobales,
  type CorpsActualisation,
  type CorpsCreationJeu,
  type DemandePage,
  type GlobalFilters,
  type IdJeu,
  type TypeColonnes,
  type TypeFichier,
} from '../../shared/api'
import { useEcritureJeu, useLectureJeu } from '../../shared/requetes'
import {
  actualiserJeu,
  corrigerCorrespondances,
  creerJeu,
  creerJeuDemonstration,
  envoyerFichier,
  lireEcartsActualisation,
  lireEnseignant,
  lireEtablissement,
  lireJeu,
  lireQualite,
  lireValidation,
  listerActualisations,
  listerColonnesAttendues,
  listerEnseignants,
  listerEtablissements,
  listerJeux,
  rechercherEnseignants,
  rechercherEtablissements,
  supprimerJeu,
  validerJeu,
  type FiltresEnseignants,
} from '../infrastructure/donneesApi'

/** Longueur minimale d'une saisie avant de lancer une recherche. */
const SAISIE_MINIMALE = 2

// --- Import ---------------------------------------------------------------------------------

/** Colonnes attendues dans un classeur ; le dictionnaire ne change pas pendant la session. */
export function useColonnesAttendues(type: TypeColonnes) {
  return useQuery({
    queryKey: ['colonnes-attendues', type],
    queryFn: ({ signal }) => listerColonnesAttendues(type, signal),
    staleTime: Infinity,
  })
}

/** Envoie un classeur au serveur ; rien n'est encore rattaché à un jeu. */
export function useEnvoyerFichier() {
  return useMutation({
    mutationFn: ({ type, fichier, feuille }: { type: TypeFichier; fichier: Blob; feuille?: string }) =>
      envoyerFichier(type, fichier, feuille),
  })
}

/** Corrige à la main la correspondance des colonnes d'un fichier envoyé. */
export function useCorrigerCorrespondances() {
  return useMutation({
    mutationFn: ({ fichier, correspondances }: { fichier: string; correspondances: Record<string, string | null> }) =>
      corrigerCorrespondances(fichier, correspondances),
  })
}

// --- Jeux de données ------------------------------------------------------------------------

/** Jeux enregistrés. */
export function useJeux() {
  return useQuery({ queryKey: clesGlobales.jeux(), queryFn: ({ signal }) => listerJeux(signal) })
}

/** Métadonnées d'un jeu : statut, effectifs, scénario retenu. */
export function useJeu(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'meta', [], lireJeu)
}

/** Crée un jeu à partir de deux fichiers envoyés. */
export function useCreerJeu() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (corps: CorpsCreationJeu) => creerJeu(corps),
    onSuccess: () => client.invalidateQueries({ queryKey: clesGlobales.jeux() }),
  })
}

/** Crée le jeu de démonstration. */
export function useCreerJeuDemonstration() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => creerJeuDemonstration(),
    onSuccess: () => client.invalidateQueries({ queryKey: clesGlobales.jeux() }),
  })
}

/** Supprime un jeu et oublie tout ce qui le concernait dans le cache. */
export function useSupprimerJeu() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (jeu: IdJeu) => supprimerJeu(jeu),
    onSuccess: (_resultat, jeu) => {
      client.removeQueries({ queryKey: cleJeu(jeu) })
      return client.invalidateQueries({ queryKey: clesGlobales.jeux() })
    },
  })
}

/** Rapport de qualité du jeu et correspondance des colonnes de ses fichiers. */
export function useQualite(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'qualite', [], lireQualite)
}

// --- Validation et actualisation ---------------------------------------------------------------

/** État de validation du jeu et contrôles associés. */
export function useValidation(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'validation', [], lireValidation)
}

/** Valide le jeu comme référence des projections. */
export function useValiderJeu(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'donnees', (id, auteur: string) => validerJeu(id, auteur))
}

/** Historique des actualisations. */
export function useActualisations(jeu: IdJeu | null) {
  return useLectureJeu(jeu, 'actualisations', [], listerActualisations)
}

/** Actualise l'exercice avec de nouveaux fichiers. */
export function useActualiserJeu(jeu: IdJeu | null) {
  return useEcritureJeu(jeu, 'donnees', (id, corps: CorpsActualisation) => actualiserJeu(id, corps))
}

/** Écarts introduits par une actualisation ; rien n'est demandé sans actualisation choisie. */
export function useEcartsActualisation(jeu: IdJeu | null, actualisation: string | null) {
  return useLectureJeu(
    jeu,
    'actualisations',
    ['ecarts', actualisation],
    (id, signal) => lireEcartsActualisation(id, actualisation ?? '', signal),
    { active: actualisation !== null },
  )
}

// --- Établissements et enseignants --------------------------------------------------------------

/** Établissements du périmètre filtré, avec leur diagnostic. */
export function useEtablissements(
  jeu: IdJeu | null,
  filtres: GlobalFilters,
  options: DemandePage & { recherche?: string } = {},
) {
  return useLectureJeu(jeu, 'etablissements', ['liste', filtres, options], (id, signal) =>
    listerEtablissements(id, filtres, options, signal),
  )
}

/** Fiche d'un établissement ; rien n'est demandé sans établissement choisi. */
export function useEtablissement(jeu: IdJeu | null, ecole: string | null) {
  return useLectureJeu(
    jeu,
    'etablissements',
    ['fiche', ecole],
    (id, signal) => lireEtablissement(id, ecole ?? '', signal),
    { active: ecole !== null },
  )
}

/** Enseignants du périmètre, avec barème et mobilité. */
export function useEnseignants(jeu: IdJeu | null, filtres: GlobalFilters, options: FiltresEnseignants = {}) {
  return useLectureJeu(jeu, 'enseignants', ['liste', filtres, options], (id, signal) =>
    listerEnseignants(id, filtres, options, signal),
  )
}

/** Fiche d'un enseignant ; rien n'est demandé sans enseignant choisi. */
export function useEnseignant(jeu: IdJeu | null, matricule: string | null) {
  return useLectureJeu(
    jeu,
    'enseignants',
    ['fiche', matricule],
    (id, signal) => lireEnseignant(id, matricule ?? '', signal),
    { active: matricule !== null },
  )
}

// --- Recherche -------------------------------------------------------------------------------------

/** Recherche d'un enseignant par saisie libre, à partir de deux caractères. */
export function useRechercheEnseignants(jeu: IdJeu | null, saisie: string) {
  const texte = saisie.trim()
  return useLectureJeu(
    jeu,
    'recherche',
    ['enseignants', texte],
    (id, signal) => rechercherEnseignants(id, texte, signal),
    { active: texte.length >= SAISIE_MINIMALE },
  )
}

/** Recherche d'un établissement par saisie libre, à partir de deux caractères. */
export function useRechercheEtablissements(jeu: IdJeu | null, saisie: string) {
  const texte = saisie.trim()
  return useLectureJeu(
    jeu,
    'recherche',
    ['etablissements', texte],
    (id, signal) => rechercherEtablissements(id, texte, signal),
    { active: texte.length >= SAISIE_MINIMALE },
  )
}

/** Types de requête utiles à l'interface. */
export type { FiltresEnseignants } from '../infrastructure/donneesApi'
