'use client'

/**
 * Journal d'exécution du scénario affiché (vue analyste) : étapes du calcul,
 * tours de l'acceptation différée (§3.4) et contrôles métier.
 */

import { useSession } from '@shared/session'
import { Panel, Pill, fmt } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useInvariants, useJournalSimulation } from '../../application/hooks'
import { useScenarioAffiche } from '../../application/scenarioAffiche'
import { SansScenario } from '../composants/SansScenario'

/** Éléments listés par tour avant troncature. */
const ELEMENTS_PAR_TOUR = 12

/** Liste tronquée, avec une ellipse quand des éléments sont omis. */
function tronquer(elements: string[], separateur: string): string {
  const texte = elements.slice(0, ELEMENTS_PAR_TOUR).join(separateur)
  return elements.length > ELEMENTS_PAR_TOUR ? `${texte} …` : texte
}

/** Page « Journal de simulation » (vue analyste). */
export function JournalSimulationPage() {
  const { jeu } = useSession()
  const { scenario, detail } = useScenarioAffiche()
  const journal = useJournalSimulation(jeu, scenario)
  const invariants = useInvariants(jeu, scenario)

  if (!scenario) return <SansScenario texte="Le journal retrace chaque étape de la dernière simulation." />
  if (!journal.data || !invariants.data) return <EtatRequetes requetes={[journal, invariants]} />

  const j = journal.data
  return (
    <div className="stack">
      <Panel
        kicker="Exécution"
        title={`Journal — ${detail?.scenario.nom ?? scenario}`}
        hint={`Calculé le ${new Date(j.computedAt).toLocaleString('fr-FR')}.`}
      >
        <table className="compare-table">
          <thead>
            <tr>
              <th>Étape</th>
              <th>Détail</th>
              <th className="num">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {j.logs.map((l, i) => (
              <tr key={`${l.etape}-${i}`}>
                <th scope="row">{l.etape}</th>
                <td>{l.message}</td>
                <td className="num">{l.valeur == null ? '—' : fmt(l.valeur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel
        kicker="Acceptation différée (§3.4)"
        title="Tours de l’algorithme d’appariement"
        hint={`Chaque tour : les candidats libres demandent l’école suivante de leur liste ; chaque école garde provisoirement les mieux classés et refuse les autres.${j.toursTronques ? ' Seuls les premiers tours de chaque niveau sont conservés.' : ''}`}
      >
        {j.tours.length === 0 ? (
          <p className="hint">Aucune demande de mutation recevable : l’algorithme n’a pas eu de tour à jouer.</p>
        ) : (
          <div className="table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Niveau</th>
                  <th className="num">Tour</th>
                  <th className="num">Demandes</th>
                  <th>Écoles et candidats gardés provisoirement</th>
                  <th>Refusés</th>
                </tr>
              </thead>
              <tbody>
                {j.tours.map(t => (
                  <tr key={`${t.niveau}-${t.tour}`}>
                    <th scope="row">{t.niveau}</th>
                    <td className="num">{t.tour}</td>
                    <td className="num">{fmt(t.demandes.length)}</td>
                    <td>
                      {tronquer(
                        t.gardes.map(g => `${g.schoolId} : ${g.teacherIds.join(', ') || '—'}`),
                        ' · ',
                      )}
                    </td>
                    <td>{t.refuses.length === 0 ? '—' : tronquer(t.refuses, ', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel kicker="Contrôles" title="Invariants métier vérifiés après simulation">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Contrôle</th>
              <th>Résultat</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {invariants.data.map(i => (
              <tr key={i.code}>
                <th scope="row">{i.label}</th>
                <td>
                  <Pill tone={i.ok ? 'ok' : 'alert'}>{i.ok ? 'Conforme' : 'Écart détecté'}</Pill>
                </td>
                <td>{i.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
