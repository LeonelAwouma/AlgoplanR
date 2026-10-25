'use client'

/**
 * Scénario affiché, scénario retenu et état du dernier calcul.
 *
 * - Le scénario affiché est celui que l'on consulte (filtre global) : il ne change aucun calcul.
 * - Le scénario retenu est choisi explicitement, après confirmation : ses mouvements (faits du Prince compris)
 *   fixent les effectifs projetés, les quotas et les nominations. Il n'est jamais retenu automatiquement.
 * Sans scénario retenu, le serveur calcule sur le scénario par défaut : la projection est provisoire.
 */

import { RefreshCw } from 'lucide-react'
import { useState } from 'react'

import type { IdJeu } from '@shared/api'
import { Notice, Panel, Pill } from '@shared/ui/commun'
import { ErreurAction } from '@shared/ui/etats'
import { useUtilisateur } from '@components/acces'
import { useJeu } from '@components/donnees'
import { useRetenirScenario, useScenarioAffiche } from '@components/simulation'

import { useEtatPlanification, useRecalculerPlanification } from '../../application/hooks'

/** Panneau « Scénario affiché, scénario retenu et état du calcul ». */
export function EtatPlanificationPanel({ jeu }: { jeu: IdJeu }) {
  const meta = useJeu(jeu)
  const etat = useEtatPlanification(jeu)
  const utilisateur = useUtilisateur()
  const { detail: affiche, calcules } = useScenarioAffiche()
  const retenir = useRetenirScenario(jeu)
  const recalcul = useRecalculerPlanification(jeu)
  const [confirmation, setConfirmation] = useState(false)

  const retenuId = meta.data?.scenarioRetenuId ?? null
  const retenu = calcules.find(c => c.scenario.id === retenuId)?.scenario ?? null
  const e = etat.data
  const base = e?.baseCalcul
  const delegue = utilisateur?.role === 'delegue'
  // Le DRH ne modifie que les jeux nationaux ; le serveur refuse de toute façon l'écriture sur un jeu régional.
  const peutRetenir = !!utilisateur && (delegue || meta.data?.portee === 'national')
  const dejaRetenu = !!affiche && affiche.scenario.id === retenuId
  const perimetre = delegue ? `la région ${utilisateur?.region ?? ''}` : 'tout le jeu de données'

  const valider = () => {
    if (!affiche) return
    retenir.mutate(affiche.scenario.id, { onSuccess: () => setConfirmation(false) })
  }

  return (
    <Panel
      kicker="Base de la projection"
      title="Scénario affiché, scénario retenu et état du calcul"
      hint="Le scénario affiché est celui que vous consultez ; le scénario retenu est celui que vous avez choisi pour alimenter la planification. Les mouvements du scénario retenu (faits du Prince compris) fixent les effectifs de départ ; la projection est recalculée après chaque décision."
    >
      <dl className="scenarios-etat">
        <div>
          <dt>Scénario affiché (consulté)</dt>
          <dd>{affiche ? affiche.scenario.nom : 'Aucun'}</dd>
        </div>
        <div>
          <dt>Scénario retenu (planification)</dt>
          <dd>{retenu ? retenu.nom : 'Aucun scénario retenu'}</dd>
        </div>
      </dl>

      {!retenuId && (
        <Notice tone="warn" title="Aucun scénario retenu : projection provisoire.">
          {base?.scenarioNom
            ? `Les résultats affichés sont calculés sur le scénario par défaut « ${base.scenarioNom} », faute de choix explicite. `
            : 'Aucun scénario calculé ne peut servir de base pour le moment. '}
          Ils ne constituent pas une décision validée. Afficher un scénario dans le filtre global ne le retient pas.
        </Notice>
      )}

      {peutRetenir && affiche && !dejaRetenu && !confirmation && (
        <div className="topbar-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirmation(true)}>
            Retenir ce scénario pour la planification
          </button>
          <span className="hint">Scénario concerné : {affiche.scenario.nom}</span>
        </div>
      )}
      {dejaRetenu && (
        <p className="hint">
          <Pill tone="ok">Retenu</Pill> Le scénario affiché est celui qui alimente la planification.
        </p>
      )}
      {!peutRetenir && meta.data && (
        <p className="hint">
          Vous consultez ce jeu sans pouvoir le modifier : le scénario de planification se retient sur un jeu national,
          ou par le délégué pour le jeu de sa région.
        </p>
      )}

      {confirmation && affiche && (
        <div className="confirmation-bloc" role="group" aria-labelledby="pl-confirmation">
          <h3 id="pl-confirmation">Retenir « {affiche.scenario.nom} » pour la planification ?</h3>
          <ul>
            <li>
              Les mouvements de ce scénario deviendront la base des effectifs projetés, des quotas et des nominations
              pour {perimetre}.
            </li>
            <li>La projection et les quotas calculés avec la base actuelle seront marqués « à recalculer ».</li>
            {retenu && (
              <li>Le scénario retenu jusqu’ici (« {retenu.nom} ») ne sera plus la base de la planification.</li>
            )}
            <li>La décision est inscrite au journal d’audit ; vous pourrez retenir un autre scénario ensuite.</li>
          </ul>
          <div className="topbar-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={retenir.isPending} onClick={valider}>
              Confirmer
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={retenir.isPending}
              onClick={() => setConfirmation(false)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
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
