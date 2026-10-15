'use client'

/**
 * Horizon de la projection, prise en compte des quotas des années précédentes
 * et sources de personnes retenues dans le vivier. Ces deux derniers points
 * sont à valider : leur valeur par défaut reste une décision de la DRH.
 */

import type { Hypotheses, SourceVivier } from '@shared/api'
import { LIBELLE_SOURCE_VIVIER, SOURCES_VIVIER } from '@shared/kernel'
import { Panel } from '@shared/ui/commun'

import type { BrouillonHypotheses } from '../../../domain/hypotheses'
import { Justification } from './Justification'

export interface ProprietesHypothesesHorizonVivier {
  brouillon: BrouillonHypotheses
  onChange: (brouillon: BrouillonHypotheses) => void
}

/** Panneaux « Horizon et quotas » et « Sources du vivier ». */
export function HypothesesHorizonVivier({ brouillon, onChange }: ProprietesHypothesesHorizonVivier) {
  const quotas = (patch: Partial<Hypotheses['quotas']>) =>
    onChange({ ...brouillon, quotas: { ...brouillon.quotas, ...patch } })
  const vivier = (patch: Partial<Hypotheses['vivier']>) =>
    onChange({ ...brouillon, vivier: { ...brouillon.vivier, ...patch } })

  const basculerSource = (source: SourceVivier, retenue: boolean) =>
    vivier({
      sources: retenue
        ? [...new Set([...brouillon.vivier.sources, source])]
        : brouillon.vivier.sources.filter(s => s !== source),
    })

  return (
    <>
      <Panel kicker="Horizon et quotas" title="Durée projetée et enchaînement des années">
        <div className="param-grid">
          <div className="field">
            <label htmlFor="hy-horizon">Horizon (années)</label>
            <input
              id="hy-horizon"
              type="number"
              min={1}
              max={10}
              value={brouillon.horizon}
              onChange={e => onChange({ ...brouillon, horizon: Number(e.target.value) })}
            />
          </div>
        </div>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={brouillon.quotas.anneesPrecedentesRealisees}
            onChange={e => quotas({ anneesPrecedentesRealisees: e.target.checked })}
          />
          <span>
            <b>Supposer recrutés les quotas des années précédentes</b>
            <span>
              Activé, l’effectif de chaque année inclut les recrutements prévus l’année d’avant (projection « plan
              réalisé »). Désactivé, la projection se fait sans recrutement intermédiaire.
            </span>
          </span>
        </label>
        <Justification
          id="hy-quotas"
          valeur={brouillon.quotas}
          onChange={j => quotas({ source: j.source, justification: j.justification })}
        />
      </Panel>

      <Panel
        kicker="Vivier"
        title="Personnes retenues dans le vivier"
        hint="La portée exacte de la nomination depuis le vivier est à confirmer : seules les sources cochées alimentent le vivier et les ressources mobilisables."
      >
        <div className="switch-list">
          {SOURCES_VIVIER.map(source => (
            <label className="switch-row" key={source}>
              <input
                type="checkbox"
                checked={brouillon.vivier.sources.includes(source)}
                onChange={e => basculerSource(source, e.target.checked)}
              />
              <span>
                <b>{LIBELLE_SOURCE_VIVIER[source]}</b>
              </span>
            </label>
          ))}
        </div>
        <Justification
          id="hy-vivier"
          valeur={brouillon.vivier}
          onChange={j => vivier({ source: j.source, justification: j.justification })}
        />
      </Panel>
    </>
  )
}
