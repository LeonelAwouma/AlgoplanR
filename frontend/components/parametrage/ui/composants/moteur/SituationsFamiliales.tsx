'use client'

/**
 * Points par situation matrimoniale (critère C3 du barème). L'inventaire des
 * situations réellement déclarées dans le fichier vient du serveur : une valeur
 * qu'aucune graphie connue ne reconnaît vaut zéro point, et mieux vaut la
 * montrer que la laisser peser silencieusement sur le classement.
 */

import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'

import type { EngineSettings, InventaireSituations } from '@shared/api'
import { LIBELLE_SITUATION, SITUATIONS_CONNUES } from '@shared/kernel'
import { Notice, Panel, fmt } from '@shared/ui/commun'

import type { MajParametres } from '../../../domain/edition'

/** Valeurs non reconnues listées avant troncature. */
const NON_RECONNUES_AFFICHEES = 8

export interface ProprietesSituationsFamiliales {
  parametres: EngineSettings
  maj: MajParametres
  /** Inventaire du fichier, `null` tant qu'il n'est pas lu. */
  inventaire: InventaireSituations | null
}

/** Panneau « Points par situation déclarée ». */
export function SituationsFamiliales({ parametres, maj, inventaire }: ProprietesSituationsFamiliales) {
  const points = parametres.scoring.pointsSituationFamiliale

  /** Clés à régler : celles connues, plus toute clé ajoutée à la main dans la configuration. */
  const clesSituations = useMemo(() => [...new Set<string>([...SITUATIONS_CONNUES, ...Object.keys(points)])], [points])

  const fixerPoints = (cle: string, valeur: number) =>
    maj(s => ({
      ...s,
      scoring: { ...s.scoring, pointsSituationFamiliale: { ...s.scoring.pointsSituationFamiliale, [cle]: valeur } },
    }))

  return (
    <Panel
      kicker="Situation matrimoniale"
      title="Points par situation déclarée"
      hint="Ces points alimentent le barème individuel. Les graphies du fichier sont rapprochées automatiquement : « Marié », « Mariée » et « MARIE(E) » comptent pour la même situation."
    >
      <div className="param-grid">
        {clesSituations.map(cle => {
          const observee = inventaire?.reconnues.find(r => r.cle === cle)
          const graphies = observee
            ? `${observee.graphies.slice(0, 3).join(', ')}${observee.graphies.length > 3 ? '…' : ''}`
            : ''
          return (
            <div className="field" key={cle}>
              <label htmlFor={`e-sit-${cle}`}>{LIBELLE_SITUATION[cle] ?? cle}</label>
              <input
                id={`e-sit-${cle}`}
                type="number"
                min={0}
                max={50}
                value={points[cle] ?? 0}
                onChange={e => fixerPoints(cle, Number(e.target.value))}
              />
              <span className="hint">
                {observee
                  ? `${fmt(observee.effectif)} enseignant(s) — ${graphies}`
                  : inventaire
                    ? 'aucun enseignant dans ce cas'
                    : 'inventaire en cours de lecture'}
              </span>
            </div>
          )
        })}
      </div>

      {inventaire && inventaire.nonReconnues.length > 0 && (
        <>
          <Notice tone="warn" title="Des situations déclarées ne sont rattachées à aucun barème.">
            Ces valeurs du fichier ne correspondent à aucune situation connue : elles valent <strong>0 point</strong>{' '}
            dans le classement. Ajoutez-les ci-dessous pour leur attribuer des points.
          </Notice>
          <ul className="reason-list">
            {inventaire.nonReconnues.slice(0, NON_RECONNUES_AFFICHEES).map(v => (
              <li key={v.valeur}>
                <AlertTriangle size={15} aria-hidden="true" />
                <span>
                  <strong>« {v.valeur} »</strong> — {fmt(v.effectif)} enseignant(s).{' '}
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => fixerPoints(v.valeur.trim().toLowerCase(), 0)}
                  >
                    Ajouter au barème
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {inventaire && inventaire.nonRenseignees > 0 && (
        <p className="hint">
          {fmt(inventaire.nonRenseignees)} enseignant(s) n’ont aucune situation matrimoniale renseignée : ce critère
          vaut 0 point pour eux, les autres critères du barème s’appliquent normalement.
        </p>
      )}
    </Panel>
  )
}
