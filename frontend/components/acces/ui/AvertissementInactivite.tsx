'use client'

/** Avertissement affiché deux minutes avant le verrouillage pour inactivité. */

import { useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'

import { formaterDuree } from '../domain/inactivite'

export function AvertissementInactivite({
  secondes,
  onRester,
  onDeconnecter,
}: {
  secondes: number
  onRester: () => void
  onDeconnecter: () => void
}) {
  const bouton = useRef<HTMLButtonElement>(null)
  useEffect(() => bouton.current?.focus(), [])

  return (
    <div className="dialogue-voile">
      <div
        className="dialogue"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="inactivite-titre"
        aria-describedby="inactivite-texte"
      >
        <Clock size={26} aria-hidden="true" className="dialogue-icone" />
        <h2 id="inactivite-titre">Votre session va être verrouillée</h2>
        <p id="inactivite-texte">
          Sans activité de votre part, la session sera verrouillée dans{' '}
          <strong className="dialogue-compte" aria-live="off">
            {formaterDuree(secondes)}
          </strong>
          . Vos données restent enregistrées sur le serveur.
        </p>
        <div className="dialogue-actions">
          <button type="button" className="btn" onClick={onDeconnecter}>
            Se déconnecter
          </button>
          <button ref={bouton} type="button" className="btn btn-primary" onClick={onRester}>
            Rester connecté
          </button>
        </div>
      </div>
    </div>
  )
}
