'use client'

/**
 * Points par situation matrimoniale (critère C3 du barème). Le serveur ne connaît que quatre catégories — marié(e),
 * divorcé(e), veuf(ve) et célibataire — et compte toute autre situation, ou une situation non renseignée, comme
 * « célibataire » : seuls ces quatre réglages sont proposés (les autres n'ont aucun effet), et l'écran dit combien
 * d'enseignants tombent dans ce cas, plutôt que de laisser croire qu'ils valent zéro point.
 */

import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'

import type { EngineSettings, InventaireSituations } from '@shared/api'
import { LIBELLE_SITUATION } from '@shared/kernel'
import { Notice, Panel, fmt } from '@shared/ui/commun'

import { SITUATIONS_REGLABLES } from '../../../domain/champsMoteur'
import type { MajParametres } from '../../../domain/edition'

/** Valeurs listées avant troncature. */
const AUTRES_AFFICHEES = 8

export interface ProprietesSituationsFamiliales {
  parametres: EngineSettings
  maj: MajParametres
  /** Inventaire du fichier, `null` tant qu'il n'est pas lu. */
  inventaire: InventaireSituations | null
}

/** Panneau « Points par situation déclarée ». */
export function SituationsFamiliales({ parametres, maj, inventaire }: ProprietesSituationsFamiliales) {
  const points = parametres.scoring.pointsSituationFamiliale

  /** Situations déclarées que le serveur compte comme « célibataire » : autres graphies, non reconnues, non renseignées. */
  const autres = useMemo(() => {
    if (!inventaire) return { effectif: 0, valeurs: [] as { valeur: string; effectif: number }[] }
    const hors = inventaire.reconnues
      .filter(r => !(SITUATIONS_REGLABLES as readonly string[]).includes(r.cle))
      .flatMap(r => r.graphies.map(g => ({ valeur: g, effectif: r.effectif })))
    const valeurs = [...hors, ...inventaire.nonReconnues]
    return { effectif: valeurs.reduce((t, v) => t + v.effectif, 0) + inventaire.nonRenseignees, valeurs }
  }, [inventaire])

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
        {SITUATIONS_REGLABLES.map(cle => {
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

      {inventaire && autres.effectif > 0 && (
        <>
          <Notice tone="warn" title="Des enseignants sont comptés comme « célibataire ».">
            {fmt(autres.effectif)} enseignant(s) déclarent une autre situation que marié(e), divorcé(e), veuf(ve) ou
            célibataire, ou n’en déclarent aucune : le moteur leur attribue les points de « célibataire » (
            {fmt(points.celibataire ?? 0)} point(s)).
          </Notice>
          {autres.valeurs.length > 0 && (
            <ul className="reason-list">
              {autres.valeurs.slice(0, AUTRES_AFFICHEES).map(v => (
                <li key={v.valeur}>
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>
                    <strong>« {v.valeur} »</strong> — {fmt(v.effectif)} enseignant(s).
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  )
}
