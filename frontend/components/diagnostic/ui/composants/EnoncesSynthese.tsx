'use client'

/**
 * Phrases de synthèse produites par le serveur. En vue analyste, la règle qui
 * a déclenché chaque phrase est affichée en dessous, pour qu'aucune conclusion
 * ne paraisse sortir de nulle part.
 */

import type { Enonce } from '@shared/api'

export interface ProprietesEnoncesSynthese {
  enonces: Enonce[]
  /** Affiche les règles déclenchantes (vue analyste). */
  afficherRegles: boolean
}

/** Liste de phrases, avec leurs règles dépliables en vue analyste. */
export function EnoncesSynthese({ enonces, afficherRegles }: ProprietesEnoncesSynthese) {
  return (
    <div className="stack-tight">
      {enonces.map((e, i) => (
        <p key={`${i}-${e.regle}`} className="enonce">
          {e.texte}
        </p>
      ))}
      {afficherRegles && (
        <details className="advanced">
          <summary>Règles ayant déclenché ces phrases</summary>
          <ul className="hint liste-regles">
            {enonces.map((e, i) => (
              <li key={`${i}-${e.regle}`} className="mono">
                {e.regle}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
