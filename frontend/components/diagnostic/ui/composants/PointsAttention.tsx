'use client'

/** Points d'attention (§18) calculés par le serveur ; le panneau disparaît s'il n'y en a aucun. */

import { Lightbulb } from 'lucide-react'

import type { PointAttention } from '@shared/api'
import { Panel } from '@shared/ui/commun'

/** Panneau « Points d'attention ». */
export function PointsAttention({ points }: { points: PointAttention[] }) {
  if (points.length === 0) return null
  return (
    <Panel kicker="Diagnostic automatique" title="Points d’attention">
      <ul className="reason-list">
        {points.map(p => (
          <li key={p.code}>
            <Lightbulb size={16} aria-hidden="true" />
            <span>
              <strong className="texte-fort">{p.titre}</strong> — {p.texte}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
