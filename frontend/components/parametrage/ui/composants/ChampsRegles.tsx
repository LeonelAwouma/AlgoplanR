'use client'

/** Éléments de formulaire des règles : réglage formulé comme une phrase, interrupteur commenté. */

import type { ReactNode } from 'react'

/** Un réglage présenté comme une phrase à compléter. */
export function Regle({
  enonce,
  precision,
  htmlFor,
  nonApplique = false,
  children,
}: {
  enonce: string
  precision?: string
  htmlFor: string
  /** Le serveur ne lit pas ce réglage : il est affiché tel qu'il est appliqué, sans pouvoir le modifier. */
  nonApplique?: boolean
  children: ReactNode
}) {
  return (
    <div className="regle">
      <label htmlFor={htmlFor} className="regle-enonce">
        {enonce}
      </label>
      <div className="regle-valeur">{children}</div>
      {nonApplique && <p className="regle-precision">Non appliqué : le calcul n’utilise pas ce réglage.</p>}
      {precision && <p className="regle-precision">{precision}</p>}
    </div>
  )
}

/** Case à cocher décrite par un titre et sa conséquence. */
export function Interrupteur({
  titre,
  texte,
  coche,
  onChange,
  nonApplique = false,
}: {
  titre: string
  texte: string
  coche: boolean
  onChange: (coche: boolean) => void
  /** Le serveur ne lit pas ce réglage : l'interrupteur est affiché sans pouvoir le modifier. */
  nonApplique?: boolean
}) {
  return (
    <label className="switch-row">
      <input type="checkbox" checked={coche} disabled={nonApplique} onChange={e => onChange(e.target.checked)} />
      <span>
        <b>{titre}</b>
        <span>{nonApplique ? `Non appliqué : le calcul n’utilise pas ce réglage. ${texte}` : texte}</span>
      </span>
    </label>
  )
}

/** Champ numérique libellé, sur une grille de paramètres. */
export function ChampNombre({
  id,
  libelle,
  valeur,
  onChange,
  min = 0,
  max,
  pas,
}: {
  id: string
  libelle: string
  valeur: number
  onChange: (valeur: number) => void
  min?: number
  max?: number
  pas?: number
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{libelle}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </div>
  )
}
