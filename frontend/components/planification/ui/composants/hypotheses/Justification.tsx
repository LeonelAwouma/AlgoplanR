'use client'

/** Source et justification d'une hypothèse : toute valeur retenue doit dire d'où elle vient. */

import type { Justification as Valeur } from '@shared/api'

export interface ProprietesJustification {
  /** Préfixe des identifiants de champs, unique dans la page. */
  id: string
  valeur: Valeur
  onChange: (valeur: Valeur) => void
}

/** Champs « Source » et « Justification ». */
export function Justification({ id, valeur, onChange }: ProprietesJustification) {
  return (
    <div className="param-grid justification">
      <div className="field">
        <label htmlFor={`${id}-source`}>Source</label>
        <input
          id={`${id}-source`}
          type="text"
          value={valeur.source}
          placeholder="Texte réglementaire, note de service, étude…"
          onChange={e => onChange({ ...valeur, source: e.target.value })}
        />
      </div>
      <div className="field field-recherche">
        <label htmlFor={`${id}-justification`}>Justification</label>
        <input
          id={`${id}-justification`}
          type="text"
          value={valeur.justification}
          placeholder="Pourquoi cette valeur est retenue"
          onChange={e => onChange({ ...valeur, justification: e.target.value })}
        />
      </div>
    </div>
  )
}
