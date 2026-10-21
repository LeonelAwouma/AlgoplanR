'use client'

/**
 * Points par situation matrimoniale (critère C3 du barème). Le serveur ne connaît que quatre catégories — marié(e),
 * divorcé(e), veuf(ve) et célibataire (explicitement renseigné) : seuls ces quatre réglages sont proposés. Une situation
 * non renseignée ou non reconnue vaut 0 point (règle à valider par le métier) ; l'écran dit combien d'enseignants sont
 * dans ce cas, pour que la donnée soit corrigée à la source.
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

  /** Situations déclarées que le serveur ne reconnaît pas (ou absentes) : 0 point, signalées au contrôle qualité. */
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
          <Notice tone="warn" title="Situation absente ou non reconnue : 0 point.">
            {fmt(autres.effectif)} enseignant(s) n’ont aucune situation matrimoniale renseignée, ou une valeur qui n’est
            ni célibataire, ni marié(e), ni divorcé(e), ni veuf(ve) : la composante matrimoniale du barème vaut 0 point
            pour eux (jamais les {fmt(points.celibataire ?? 0)} points de « célibataire »). Corrigez la donnée à la
            source ; règle à valider par le métier avant toute décision officielle.
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
