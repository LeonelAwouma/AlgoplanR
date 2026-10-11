'use client'

/**
 * Vœux portant sur l'autre sous-système. L'algorithme n'affecte jamais un
 * enseignant hors de son sous-système ; la commission peut le décider au cas
 * par cas, si le poste est vacant et le départ dans la limite de l'excédent.
 */

import type { VoeuAutreSousSysteme } from '@shared/api'
import { Panel } from '@shared/ui/commun'

export interface ProprietesVoeuxAutreSousSysteme {
  voeux: VoeuAutreSousSysteme[]
  onDecider: (voeu: VoeuAutreSousSysteme) => void
}

/** Panneau « Vœux portant sur l'autre sous-système » ; absent s'il n'y en a aucun. */
export function VoeuxAutreSousSysteme({ voeux, onDecider }: ProprietesVoeuxAutreSousSysteme) {
  if (voeux.length === 0) return null
  return (
    <Panel
      kicker="Changement de sous-système"
      title="Vœux portant sur l’autre sous-système"
      hint="L’algorithme n’affecte jamais un enseignant hors de son sous-système. La commission peut le décider au cas par cas."
    >
      <ul className="reason-list">
        {voeux.map(v => (
          <li key={`${v.teacherId}-${v.schoolId}`}>
            <span>
              <strong>{v.nom}</strong> ({v.sousSystemeEnseignant ?? 'sous-système non renseigné'}) demande {v.nomEtab} (
              {v.sousSystemePoste ?? '—'}). {v.posteVacant ? 'Poste vacant.' : 'Aucun poste vacant.'}{' '}
              {v.departDansLimiteExcedent
                ? 'Départ dans la limite de l’excédent.'
                : 'L’excédent de l’école d’attache est atteint.'}{' '}
              {v.posteVacant && v.departDansLimiteExcedent && (
                <button type="button" className="btn-link" onClick={() => onDecider(v)}>
                  Décider le changement
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
