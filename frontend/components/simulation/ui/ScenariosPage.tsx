'use client'

/**
 * Section Simulations : création et exécution de scénarios, et propositions du
 * scénario affiché avec leur explication.
 *
 * L'application ne désigne jamais un « meilleur scénario ». Elle montre ce que
 * chaque jeu de règles produirait ; l'arbitrage reste humain.
 */

import { useSession } from '@shared/session'
import { Notice } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { useParametres } from '@components/parametrage'

import { useResultat } from '../application/hooks'
import { useScenarioAffiche } from '../application/scenarioAffiche'
import { ModelesScenarios } from './composants/ModelesScenarios'
import { PropositionsPanel } from './composants/PropositionsPanel'
import { ScenarioPersonnalise } from './composants/ScenarioPersonnalise'
import { TableauScenarios } from './composants/TableauScenarios'

/** Page « Scénarios ». */
export function ScenariosPage() {
  const { jeu, filtres, mode, setScenarioChoisi } = useSession()
  const { scenario, calcules } = useScenarioAffiche()
  const parametres = useParametres(jeu)
  const resultat = useResultat(jeu, scenario, filtres.territoire)

  if (!jeu || !parametres.data) return <EtatRequetes requetes={[parametres]} />

  return (
    <div className="stack">
      <Notice tone="info" title="Ce que fait une simulation.">
        Elle propose, poste par poste, quel enseignant du vivier mobilisable pourrait le couvrir. Elle ne modifie aucune
        donnée et ne constitue pas une décision d’affectation.
      </Notice>

      <ModelesScenarios jeu={jeu} onScenarioCree={setScenarioChoisi} />

      {/* Remonté à chaque changement de jeu : le formulaire repart des règles en vigueur. */}
      <ScenarioPersonnalise key={jeu} jeu={jeu} parametres={parametres.data} onScenarioCree={setScenarioChoisi} />

      <TableauScenarios scenarios={calcules} affiche={scenario} onAfficher={setScenarioChoisi} />

      {resultat.data && (
        <PropositionsPanel
          key={resultat.data.scenarioId}
          jeu={jeu}
          resultat={resultat.data}
          analyste={mode === 'analyste'}
        />
      )}
    </div>
  )
}
