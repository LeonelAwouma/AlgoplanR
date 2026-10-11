'use client'

/**
 * Pastilles d'état partagées par plusieurs contextes. Chacune associe une
 * couleur, un symbole et un libellé : l'information ne repose jamais sur la
 * seule couleur.
 */

import type { SchoolSeverity } from '@shared/api'
import { LIBELLE_SEVERITE } from '@shared/kernel'
import { Pill, type Tone } from '@shared/ui/commun'

/** Présentation de chaque niveau de sévérité. */
const PRESENTATION_SEVERITE: Record<SchoolSeverity, { ton: Tone; symbole: string }> = {
  deficit_critique: { ton: 'alert', symbole: '▲▲' },
  deficit_important: { ton: 'warn', symbole: '▲' },
  deficit_faible: { ton: 'warn', symbole: '△' },
  excedent: { ton: 'info', symbole: '▼' },
  satisfaisant: { ton: 'ok', symbole: '●' },
}

/** Sévérité de la situation d'une école. */
export function SeveritePill({ severite }: { severite: SchoolSeverity }) {
  const { ton, symbole } = PRESENTATION_SEVERITE[severite]
  return (
    <Pill tone={ton}>
      <span aria-hidden="true">{symbole}</span> {LIBELLE_SEVERITE[severite]}
    </Pill>
  )
}
