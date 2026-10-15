'use client'

/**
 * Traçabilité des décisions de commission : chacune conserve la proposition
 * initiale, son motif et l'instance qui l'a prise. Une décision que les
 * données actuelles ne permettent plus d'appliquer est signalée.
 */

import { Undo2 } from 'lucide-react'

import type { DecisionArbitrageAppliquee } from '@shared/api'
import { Panel, Pill, fmt } from '@shared/ui/commun'

import { resumeDecision } from '../../domain/brouillon'

export interface ProprietesHistoriqueArbitrages {
  decisions: DecisionArbitrageAppliquee[]
  annulation: boolean
  onAnnuler: (decision: string) => void
}

/** Panneau « Traçabilité », décisions les plus récentes d'abord. */
export function HistoriqueArbitrages({ decisions, annulation, onAnnuler }: ProprietesHistoriqueArbitrages) {
  const recentes = [...decisions].sort((a, b) => b.decision.decideLe.localeCompare(a.decision.decideLe))

  return (
    <Panel kicker="Traçabilité" title={`${fmt(decisions.length)} décision(s) enregistrée(s)`}>
      {recentes.length === 0 ? (
        <p className="hint">Aucune décision n’a encore été prise.</p>
      ) : (
        <ul className="reason-list">
          {recentes.map(({ decision, appliquee, motif }) => (
            <li key={decision.id}>
              <span>
                <strong>{decision.nomEnseignant}</strong> — {resumeDecision(decision)}{' '}
                {!appliquee && <Pill tone="warn">Non appliquée : {motif}</Pill>}{' '}
                <button type="button" className="btn-link" disabled={annulation} onClick={() => onAnnuler(decision.id)}>
                  <Undo2 size={12} aria-hidden="true" /> Annuler
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
