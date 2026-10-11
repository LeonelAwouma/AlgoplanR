'use client'

/**
 * Pastille d'état du bandeau supérieur : ce que le serveur est en train de
 * faire, ou ce qui est déjà disponible pour le jeu ouvert.
 */

import { useIsMutating } from '@tanstack/react-query'
import { AlertTriangle, Check, RefreshCw, ServerOff } from 'lucide-react'

import { estInjoignable } from '@shared/api'
import { Pill } from '@shared/ui/commun'

export interface ProprietesEtatTraitement {
  /** Le jeu ouvert est chargé : le diagnostic est disponible. */
  donneesChargees: boolean
  /** Au moins un scénario du jeu a un résultat. */
  simulationPrete: boolean
  /** Erreur de lecture du jeu ouvert, s'il y en a une. */
  erreur: unknown
}

/**
 * Pastille « Traitement en cours », « Serveur injoignable », « Scénarios
 * calculés »… Toute écriture en cours (import, calcul, décision) compte comme
 * un traitement : c'est le serveur qui calcule, l'interface ne fait qu'attendre.
 */
export function EtatTraitement({ donneesChargees, simulationPrete, erreur }: ProprietesEtatTraitement) {
  const ecrituresEnCours = useIsMutating()

  if (ecrituresEnCours > 0) {
    return (
      <Pill tone="info">
        <RefreshCw size={12} className="spin" aria-hidden="true" /> Traitement en cours
      </Pill>
    )
  }
  if (erreur) {
    return estInjoignable(erreur) ? (
      <Pill tone="alert">
        <ServerOff size={12} aria-hidden="true" /> Serveur injoignable
      </Pill>
    ) : (
      <Pill tone="alert">
        <AlertTriangle size={12} aria-hidden="true" /> Erreur du serveur
      </Pill>
    )
  }
  if (simulationPrete) {
    return (
      <Pill tone="ok">
        <Check size={12} aria-hidden="true" /> Scénarios calculés
      </Pill>
    )
  }
  if (donneesChargees) return <Pill tone="info">Diagnostic calculé</Pill>
  return <Pill tone="warn">Aucune donnée</Pill>
}
