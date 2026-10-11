'use client'

/**
 * Scénario retenu pour la planification et état du dernier calcul. Les
 * mouvements du scénario retenu alimentent les effectifs projetés ; le
 * serveur recalcule la planification après chaque décision.
 */

import { RefreshCw } from 'lucide-react'

import type { IdJeu } from '@shared/api'
import { Notice, Panel, Pill } from '@shared/ui/commun'
import { ErreurAction } from '@shared/ui/etats'
import { useJeu } from '@components/donnees'
import { useRetenirScenario, useScenarioAffiche } from '@components/simulation'

import { useEtatPlanification, useRecalculerPlanification } from '../../application/hooks'

/** Panneau « Scénario retenu et calcul ». */
export function EtatPlanificationPanel({ jeu }: { jeu: IdJeu }) {
  const meta = useJeu(jeu)
  const etat = useEtatPlanification(jeu)
  const { calcules } = useScenarioAffiche()
  const retenir = useRetenirScenario(jeu)
  const recalcul = useRecalculerPlanification(jeu)

  const retenu = meta.data?.scenarioRetenuId ?? null
  const e = etat.data

  return (
    <Panel
      kicker="Base de la projection"
      title="Scénario retenu et état du calcul"
      hint="Les mouvements du scénario retenu (redéploiements validés), les nominations et les recrues fixent les effectifs de départ ; la projection est recalculée après chaque décision."
    >
      {!retenu && (
        <Notice tone="warn" title="Aucun scénario retenu.">
          Choisissez le scénario dont les mouvements alimentent la planification.
        </Notice>
      )}
      <div className="param-grid">
        <div className="field">
          <label htmlFor="pl-retenu">Scénario retenu</label>
          <select
            id="pl-retenu"
            value={retenu ?? ''}
            disabled={retenir.isPending}
            onChange={ev => ev.target.value && retenir.mutate(ev.target.value)}
          >
            <option value="">— Choisir un scénario calculé —</option>
            {calcules.map(c => (
              <option key={c.scenario.id} value={c.scenario.id}>
                {c.scenario.nom}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ErreurAction erreur={retenir.error ?? recalcul.error} />

      {e && (
        <p className="hint">
          Version {e.version}
          {e.calculeLe ? `, calculée le ${new Date(e.calculeLe).toLocaleString('fr-FR')}` : ''}
          {e.declencheur ? ` (${e.declencheur})` : ''}. {e.obsolete && <Pill tone="warn">À recalculer</Pill>}
        </p>
      )}
      <div className="topbar-actions">
        <button type="button" className="btn btn-sm" disabled={recalcul.isPending} onClick={() => recalcul.mutate()}>
          <RefreshCw size={13} className={recalcul.isPending ? 'spin' : undefined} aria-hidden="true" /> Recalculer
          maintenant
        </button>
      </div>
    </Panel>
  )
}
