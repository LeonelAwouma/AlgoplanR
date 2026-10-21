'use client'

/**
 * États d'attente et d'erreur des données lues sur le serveur.
 *
 * Chaque page lit ses données par des hooks de requête ; tant qu'elles ne sont
 * pas là, elle affiche `EtatRequetes`, qui montre l'erreur la plus utile
 * (serveur injoignable, refus, panne) ou, à défaut, un indicateur d'attente.
 */

import type { UseQueryResult } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Calculator, RefreshCw, ServerOff } from 'lucide-react'

import { appeler, estAucunScenario, estInjoignable, messageErreur, route } from '@shared/api'
import { useEcritureJeu } from '@shared/requetes'
import { useSession } from '@shared/session'
import { Notice } from '@shared/ui/commun'

/** Délai après lequel l'attente est expliquée : un grand fichier national se calcule en plusieurs secondes. */
const DELAI_EXPLICATION_MS = 6000

/** Indicateur d'attente, annoncé aux lecteurs d'écran ; une attente longue est expliquée, pas laissée muette. */
export function ChargementEnCours({ libelle = 'Chargement des données…' }: { libelle?: string }) {
  const [longue, setLongue] = useState(false)
  useEffect(() => {
    const minuteur = window.setTimeout(() => setLongue(true), DELAI_EXPLICATION_MS)
    return () => window.clearTimeout(minuteur)
  }, [])
  return (
    <div className="chargement" role="status" aria-live="polite">
      <RefreshCw size={16} className="spin" aria-hidden="true" />
      <span>
        {libelle}
        {longue && (
          <small className="bloc">
            Le calcul est en cours sur ce poste ; il peut prendre quelques secondes sur une base nationale.
          </small>
        )}
      </span>
    </div>
  )
}

/** Calcul des trois scénarios géographiques de base (action explicite, jamais déclenchée par une simple lecture). */
const ROUTE_SCENARIOS_BASE = route<unknown[]>()('POST', 'jeux/{jeu}/scenarios/base/')

/**
 * Message explicite quand le jeu n'a aucun scénario, avec l'action pour les calculer (utilisateur autorisé). Un
 * utilisateur qui ne peut pas écrire sur ce jeu (le DRH sur un jeu régional) reçoit le refus du serveur, expliqué.
 */
export function AucunScenario({ erreur, onReessayer }: { erreur: unknown; onReessayer?: () => void }) {
  const { jeu } = useSession()
  const calcul = useEcritureJeu(jeu, 'scenarios', (id, _aucun: void) =>
    appeler(ROUTE_SCENARIOS_BASE, { params: { jeu: id } }),
  )
  return (
    <Notice tone="warn" title="Aucun scénario calculé.">
      {messageErreur(erreur)}{' '}
      <button
        type="button"
        className="btn btn-sm"
        disabled={calcul.isPending}
        onClick={() => calcul.mutate(undefined, { onSuccess: () => onReessayer?.() })}
      >
        {calcul.isPending ? (
          <RefreshCw size={13} className="spin" aria-hidden="true" />
        ) : (
          <Calculator size={13} aria-hidden="true" />
        )}{' '}
        Calculer les scénarios de base
      </button>
      {calcul.isError && (
        <p className="hint" role="alert">
          {messageErreur(calcul.error)}
        </p>
      )}
    </Notice>
  )
}

/** Erreur d'une requête, avec un bouton pour réessayer. */
export function ErreurApi({ erreur, onReessayer }: { erreur: unknown; onReessayer?: () => void }) {
  if (estAucunScenario(erreur)) return <AucunScenario erreur={erreur} onReessayer={onReessayer} />
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
