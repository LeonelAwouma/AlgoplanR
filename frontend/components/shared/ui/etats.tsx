'use client'

/**
 * États d'attente et d'erreur des données lues sur le serveur.
 *
 * Chaque page lit ses données par des hooks de requête ; tant qu'elles ne sont
 * pas là, elle affiche `EtatRequetes`, qui montre l'erreur la plus utile
 * (serveur injoignable, refus, panne) ou, à défaut, un indicateur d'attente.
 */

import type { UseQueryResult } from '@tanstack/react-query'
import { RefreshCw, ServerOff } from 'lucide-react'

import { estInjoignable, messageErreur } from '@shared/api'
import { Notice } from '@shared/ui/commun'

/** Indicateur d'attente, annoncé aux lecteurs d'écran. */
export function ChargementEnCours({ libelle = 'Chargement des données…' }: { libelle?: string }) {
  return (
    <div className="chargement" role="status" aria-live="polite">
      <RefreshCw size={16} className="spin" aria-hidden="true" />
      <span>{libelle}</span>
    </div>
  )
}

/** Erreur d'une requête, avec un bouton pour réessayer. */
export function ErreurApi({ erreur, onReessayer }: { erreur: unknown; onReessayer?: () => void }) {
  const injoignable = estInjoignable(erreur)
  return (
    <Notice tone="alert" title={injoignable ? 'Serveur AlgoPlanR injoignable.' : 'Les données n’ont pas pu être lues.'}>
      {injoignable && <ServerOff size={14} aria-hidden="true" />} {messageErreur(erreur)}{' '}
      {onReessayer && (
        <button type="button" className="btn-link" onClick={onReessayer}>
          Réessayer
        </button>
      )}
    </Notice>
  )
}

/**
 * État combiné de plusieurs requêtes : la première erreur rencontrée, sinon un
 * indicateur d'attente. À afficher tant qu'une des données manque.
 *
 * ```tsx
 * if (!diagnostic.data || !synthese.data) return <EtatRequetes requetes={[diagnostic, synthese]} />
 * ```
 */
export function EtatRequetes({
  requetes,
  libelle,
}: {
  requetes: readonly Pick<UseQueryResult, 'error' | 'refetch'>[]
  libelle?: string
}) {
  const enErreur = requetes.find(r => r.error)
  if (enErreur) return <ErreurApi erreur={enErreur.error} onReessayer={() => void enErreur.refetch()} />
  return <ChargementEnCours libelle={libelle} />
}

/** Erreur d'une action (mutation), affichée près du bouton qui l'a déclenchée. */
export function ErreurAction({ erreur }: { erreur: unknown }) {
  if (!erreur) return null
  return (
    <Notice tone="alert" title="Action refusée.">
      {messageErreur(erreur)}
    </Notice>
  )
}
