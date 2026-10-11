'use client'

/**
 * Mouvements proposés pour une école dans le scénario affiché : arrivées,
 * départs et postes restés vacants. Le serveur filtre les mouvements de
 * l'école ; l'interface les sépare seulement selon leur sens.
 */

import { SANS_PAGINATION, type ProposedAssignment, type IdJeu } from '@shared/api'
import { LIBELLE_PROXIMITE } from '@shared/kernel'
import { Panel, fmt } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { useAffectations, usePostes, useScenarioAffiche } from '@components/simulation'

/** Nombre d'arrivées affichées ; au-delà, le total reste indiqué dans le titre. */
const ARRIVEES_AFFICHEES = 10

/** Nom complet de l'enseignant d'une proposition. */
function nomComplet(a: ProposedAssignment): string {
  return `${a.nomEns} ${a.prenomEns}`.trim()
}

export interface ProprietesMouvementsEcole {
  jeu: IdJeu
  ecole: string
  /** Plafond de départs de l'école (son excédent mobilisable). */
  plafondDeparts: number
}

/** Panneau « Mouvements proposés » ; absent tant qu'aucun scénario n'est affiché. */
export function MouvementsEcole({ jeu, ecole, plafondDeparts }: ProprietesMouvementsEcole) {
  const { scenario, detail } = useScenarioAffiche()
  const affectations = useAffectations(jeu, scenario, { ...SANS_PAGINATION, ecole })
  const postesVacants = usePostes(jeu, scenario, { pourvu: false, ecole, page: 1, taille: 1 })

  if (!scenario || !detail) return null
  if (!affectations.data) return <EtatRequetes requetes={[affectations]} />

  const arrivees = affectations.data.elements.filter(a => a.schoolDestinationId === ecole)
  const departs = affectations.data.elements.filter(a => a.schoolOrigineId === ecole)
  const restants = postesVacants.data?.total ?? null

  return (
    <Panel
      kicker="Simulation"
      title={`Mouvements proposés — ${detail.scenario.nom}`}
      hint="Ces propositions sont issues d’une simulation et nécessitent une validation administrative."
    >
      <div className="grid-2">
        <div>
          <h3>Arrivées proposées ({fmt(arrivees.length)})</h3>
          {arrivees.length === 0 ? (
            <p className="hint">Aucune arrivée proposée dans ce scénario.</p>
          ) : (
            <ul className="reason-list">
              {arrivees.slice(0, ARRIVEES_AFFICHEES).map(a => (
                <li key={a.postId}>
                  <span>
                    <strong className="texte-fort">{nomComplet(a)}</strong> depuis {a.nomEtabOrigine} (
                    {LIBELLE_PROXIMITE[a.niveauProximite].toLowerCase()}) — score {a.score}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {restants != null && restants > 0 && (
            <p className="hint">{fmt(restants)} poste(s) resteraient non pourvu(s) dans ce scénario.</p>
          )}
        </div>
        <div>
          <h3>Départs proposés ({fmt(departs.length)})</h3>
          {departs.length === 0 ? (
            <p className="hint">Aucun départ proposé dans ce scénario.</p>
          ) : (
            <ul className="reason-list">
              {departs.map(a => (
                <li key={a.postId}>
                  <span>
                    <strong className="texte-fort">{nomComplet(a)}</strong> vers {a.nomEtabDestination} (
                    {a.communeDestination}) — barème {a.bareme}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">Plafond de départs pour cet établissement : {fmt(plafondDeparts)} enseignant(s).</p>
        </div>
      </div>
    </Panel>
  )
}
