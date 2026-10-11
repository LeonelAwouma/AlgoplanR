'use client'

/**
 * Onglets accessibles : liste d'onglets (`role="tablist"`), navigation au
 * clavier par les flèches, panneau associé à l'onglet actif.
 */

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface Onglet<C extends string> {
  cle: C
  libelle: string
}

export interface ProprietesOnglets<C extends string> {
  onglets: readonly Onglet<C>[]
  actif: C
  onChange: (cle: C) => void
  /** Nom de la liste d'onglets, lu par les lecteurs d'écran. */
  libelle: string
  children: ReactNode
}

/** Onglets et panneau de l'onglet actif. */
export function Onglets<C extends string>({ onglets, actif, onChange, libelle, children }: ProprietesOnglets<C>) {
  const prefixe = useId()
  const boutons = useRef<(HTMLButtonElement | null)[]>([])

  /** Flèches gauche/droite : passe à l'onglet voisin, en boucle. */
  function auClavier(evenement: KeyboardEvent<HTMLDivElement>) {
    if (evenement.key !== 'ArrowRight' && evenement.key !== 'ArrowLeft') return
    const index = onglets.findIndex(o => o.cle === actif)
    const pas = evenement.key === 'ArrowRight' ? 1 : -1
    const suivant = (index + pas + onglets.length) % onglets.length
    onChange(onglets[suivant].cle)
    boutons.current[suivant]?.focus()
    evenement.preventDefault()
  }

  return (
    <div className="onglets">
      <div className="onglets-liste" role="tablist" aria-label={libelle} onKeyDown={auClavier}>
        {onglets.map((onglet, i) => (
          <button
            key={onglet.cle}
            ref={bouton => {
              boutons.current[i] = bouton
            }}
            type="button"
            role="tab"
            id={`${prefixe}-onglet-${onglet.cle}`}
            aria-selected={onglet.cle === actif}
            aria-controls={`${prefixe}-panneau`}
            tabIndex={onglet.cle === actif ? 0 : -1}
            onClick={() => onChange(onglet.cle)}
          >
            {onglet.libelle}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${prefixe}-panneau`} aria-labelledby={`${prefixe}-onglet-${actif}`}>
        {children}
      </div>
    </div>
  )
}
