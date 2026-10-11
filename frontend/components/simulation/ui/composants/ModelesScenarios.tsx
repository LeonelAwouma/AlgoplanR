'use client'

/**
 * Modèles de scénarios (A à F). Le serveur indique, pour chacun, si les
 * données du jeu permettent d'appliquer réellement sa règle.
 */

import { AlertTriangle, Play, RefreshCw } from 'lucide-react'

import type { IdJeu } from '@shared/api'
import { Panel, Pill } from '@shared/ui/commun'
import { EtatRequetes, ErreurAction } from '@shared/ui/etats'

import { useCalculerScenariosDeBase, useCreerScenario, usePresets } from '../../application/hooks'

export interface ProprietesModelesScenarios {
  jeu: IdJeu
  /** Appelé avec l'identifiant du scénario créé, pour l'afficher. */
  onScenarioCree: (scenario: string) => void
}

/** Panneau « Modèles disponibles ». */
export function ModelesScenarios({ jeu, onScenarioCree }: ProprietesModelesScenarios) {
  const presets = usePresets(jeu)
  const creation = useCreerScenario(jeu)
  const calculBase = useCalculerScenariosDeBase(jeu)
  const occupe = creation.isPending || calculBase.isPending

  return (
    <Panel
      kicker="Scénarios prédéfinis"
      title="Modèles disponibles"
      hint="Un scénario n’est proposé que si les données permettent d’appliquer réellement sa règle."
      actions={
        <button type="button" className="btn btn-primary" onClick={() => calculBase.mutate()} disabled={occupe}>
          <RefreshCw size={14} className={calculBase.isPending ? 'spin' : undefined} aria-hidden="true" /> Recalculer
          les trois scénarios géographiques
        </button>
      }
    >
      <ErreurAction erreur={creation.error ?? calculBase.error} />
      {presets.data ? (
        <div className="upload-cards">
          {presets.data.map(preset => (
            <div className="upload-card" key={preset.cle}>
              <div className="upload-card-entete">
                <h3>{preset.nom}</h3>
                <Pill tone={preset.disponible ? 'ok' : 'neutral'}>
                  {preset.disponible ? 'Disponible' : 'Indisponible'}
                </Pill>
              </div>
              <p className="hint">{preset.description}</p>
              {!preset.disponible && (
                <p className="hint texte-avertissement">
                  <AlertTriangle size={13} aria-hidden="true" /> {preset.motif}
                </p>
              )}
              <button
                type="button"
                className="btn"
                disabled={!preset.disponible || occupe}
                onClick={() =>
                  creation.mutate({ preset: preset.cle }, { onSuccess: cree => onScenarioCree(cree.scenario.id) })
                }
              >
                <Play size={14} aria-hidden="true" /> Exécuter ce scénario
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EtatRequetes requetes={[presets]} />
      )}
    </Panel>
  )
}
