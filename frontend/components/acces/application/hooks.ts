'use client'

/**
 * Cas d'usage du contexte « Accès » pour les écrans : activation du poste,
 * connexion, mot de passe, région, administration des comptes par le DRH.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { CompteServeur, UsageCode } from '../domain/types'
import {
  activerPoste,
  changerMotDePasse,
  confirmerRegion,
  connecter,
  debloquerCarnet,
  fermerSessionsCompte,
  importerCarnet,
  lireCodes,
  lireHistorique,
  listerComptes,
  reactiverCompte,
  reinitialiserMotDePasse,
  remettreCode,
  saisirCode,
  suspendreCompte,
} from '../infrastructure/accesApi'

const CLE_COMPTES = ['acces', 'comptes'] as const
const CLE_CODES = ['acces', 'codes'] as const

export function useActiverPoste() {
  return useMutation({ mutationFn: (fichier: File) => activerPoste(fichier) })
}

export function useConnexion() {
  return useMutation({
    mutationFn: ({ identifiant, motDePasse }: { identifiant: string; motDePasse: string }) =>
      connecter(identifiant, motDePasse),
  })
}

export function useChangerMotDePasse() {
  return useMutation({
    mutationFn: (c: { actuel: string; nouveau: string; confirmation: string }) =>
      changerMotDePasse(c.actuel, c.nouveau, c.confirmation),
  })
}

export function useConfirmerRegion() {
  return useMutation({ mutationFn: (region: string) => confirmerRegion(region) })
}

/** DRH : comptes du poste. */
export function useComptes() {
  return useQuery({ queryKey: CLE_COMPTES, queryFn: ({ signal }) => listerComptes(signal) })
}

/** DRH : historique des accès d'un compte. */
export function useHistoriqueCompte(identifiant: string) {
  return useQuery({
    queryKey: [...CLE_COMPTES, identifiant, 'historique'],
    queryFn: ({ signal }) => lireHistorique(identifiant, signal),
  })
}

export type ActionCompte = 'suspendre' | 'reactiver' | 'reinitialiser' | 'fermer'

/**
 * DRH : action sur le compte d'un délégué. La réinitialisation renvoie le mot de
 * passe temporaire, à montrer une seule fois.
 */
export function useActionCompte() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ action, compte }: { action: ActionCompte; compte: CompteServeur }) => {
      const id = compte.identifiant
      if (action === 'suspendre') return { temporaire: null, ...(await suspendreCompte(id)) }
      if (action === 'reactiver') return { temporaire: null, ...(await reactiverCompte(id)) }
      if (action === 'fermer') return { temporaire: null, ...(await fermerSessionsCompte(id)) }
      return { temporaire: (await reinitialiserMotDePasse(id)).mot_de_passe_temporaire }
    },
    onSettled: () => client.invalidateQueries({ queryKey: CLE_COMPTES }),
  })
}

/** Délégué : saisie d'un code d'activation ou de récupération. */
export function useSaisirCode() {
  return useMutation({
    mutationFn: ({ region, usage, code }: { region: string; usage: UsageCode; code: string }) =>
      saisirCode(region, usage, code),
  })
}

/** DRH : état du carnet des codes. */
export function useCodes() {
  return useQuery({ queryKey: CLE_CODES, queryFn: ({ signal }) => lireCodes(signal) })
}

/** DRH : remise d'un code à un délégué. */
export function useRemettreCode() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (d: { region: string; usage: UsageCode; motDePasse: string; remisA: string }) =>
      remettreCode(d.region, d.usage, d.motDePasse, d.remisA),
    onSettled: () => client.invalidateQueries({ queryKey: CLE_CODES }),
  })
}

/** DRH : import du carnet de l'administration. */
export function useImporterCarnet() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (d: { fichier: File; phrase: string; motDePasse: string }) =>
      importerCarnet(d.fichier, d.phrase, d.motDePasse),
    onSettled: () => client.invalidateQueries({ queryKey: CLE_CODES }),
  })
}

/** DRH : déblocage du carnet par la clé de secours. */
export function useDebloquerCarnet() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (d: { cleSecours: string; motDePasse: string }) => debloquerCarnet(d.cleSecours, d.motDePasse),
    onSettled: () => client.invalidateQueries({ queryKey: CLE_CODES }),
  })
}
