'use client'

/** Champ de mot de passe avec bouton afficher / masquer. */

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export function ChampMotDePasse({
  id,
  libelle,
  valeur,
  onChange,
  autoComplete,
  autoFocus,
  desactive,
  decritPar,
}: {
  id: string
  libelle: string
  valeur: string
  onChange: (valeur: string) => void
  autoComplete: 'current-password' | 'new-password'
  autoFocus?: boolean
  desactive?: boolean
  decritPar?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{libelle}</label>
      <div className="champ-mdp">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={desactive}
          spellCheck={false}
          aria-describedby={decritPar}
          value={valeur}
          onChange={e => onChange(e.target.value)}
        />
        <button
          type="button"
          className="champ-mdp-bascule"
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible(v => !v)}
          title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          <span className="sr-only">{visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}</span>
        </button>
      </div>
    </div>
  )
}
