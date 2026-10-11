'use client'

/**
 * Désignation d'un enseignant et d'une école à partir d'une saisie libre.
 *
 * Le serveur fait le rapprochement (route `recherche/`) et fournit des
 * suggestions pendant la frappe (listes filtrées par `q`). La saisie est
 * différée (`useDeferredValue`) pour ne pas interroger le serveur à chaque
 * touche pendant une frappe rapide.
 */

import { useDeferredValue } from 'react'

import { FILTRES_VIDES, type IdJeu, type SchoolDiagnostic, type Teacher } from '@shared/api'
import {
  useEnseignants,
  useEtablissements,
  useRechercheEnseignants,
  useRechercheEtablissements,
} from '@components/donnees'

/** Nombre de suggestions demandées pendant la frappe. */
const SUGGESTIONS = 40

/** Résultat de la désignation d'un enseignant. */
export interface DesignationEnseignant {
  /** Enseignant désigné sans ambiguïté, ou choisi parmi des homonymes. */
  designe: Teacher | null
  /** Homonymes à départager, déjà redéployés exclus. */
  candidats: Teacher[]
  suggestions: Teacher[]
  /** Nombre d'enseignants du jeu correspondant à la saisie. */
  total: number
}

/**
 * Désigne l'enseignant à redéployer.
 *
 * @param homonymeChoisi matricule choisi par l'utilisateur parmi des homonymes, vide sinon.
 */
export function useDesignationEnseignant(
  jeu: IdJeu | null,
  saisie: string,
  homonymeChoisi: string,
): DesignationEnseignant {
  const saisieDifferee = useDeferredValue(saisie)
  const suggestions = useEnseignants(jeu, FILTRES_VIDES, { recherche: saisieDifferee, page: 1, taille: SUGGESTIONS })
  const recherche = useRechercheEnseignants(jeu, saisieDifferee)

  // Un enseignant déjà redéployé par la DRH ne peut pas l'être une seconde fois.
  const candidats = (recherche.data?.candidats ?? []).filter(t => !t.faitPrinceId)
  const designe = homonymeChoisi
    ? (candidats.find(t => t.id === homonymeChoisi) ?? null)
    : (recherche.data?.trouve ?? null)

  return {
    designe,
    candidats,
    suggestions: (suggestions.data?.elements ?? []).map(l => l.teacher).filter(t => !t.faitPrinceId),
    total: suggestions.data?.total ?? 0,
  }
}

/** Résultat de la désignation d'une école. */
export interface DesignationEcole {
  designe: SchoolDiagnostic | null
  candidats: SchoolDiagnostic[]
  /** Suggestions, les plus en déficit d'abord : ce sont les destinations les plus probables. */
  suggestions: SchoolDiagnostic[]
  total: number
}

/** Désigne l'école de destination. */
export function useDesignationEcole(jeu: IdJeu | null, saisie: string): DesignationEcole {
  const saisieDifferee = useDeferredValue(saisie)
  const suggestions = useEtablissements(jeu, FILTRES_VIDES, {
    recherche: saisieDifferee,
    page: 1,
    taille: SUGGESTIONS,
    tri: '-besoin',
  })
  const recherche = useRechercheEtablissements(jeu, saisieDifferee)

  return {
    designe: recherche.data?.trouve ?? null,
    candidats: recherche.data?.candidats ?? [],
    suggestions: suggestions.data?.elements ?? [],
    total: suggestions.data?.total ?? 0,
  }
}
