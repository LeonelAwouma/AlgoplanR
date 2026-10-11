'use client'

/**
 * Scénarios calculés et leurs indicateurs principaux. L'utilisateur choisit
 * celui qui est affiché dans le reste de l'application.
 */

import { Check, X } from 'lucide-react'

import type { ScenarioCalcule } from '@shared/api'
import { LIBELLE_PROXIMITE, LIBELLE_SCOPE } from '@shared/kernel'
import { Panel, Pill, fmt, fmtPct } from '@shared/ui/commun'

import { NIVEAUX_PROXIMITE } from '../../domain/explications'

/** Mouvements par proximité, en une ligne : « 12 même commune · 3 même département ». */
function resumeMouvements(indicateurs: NonNullable<ScenarioCalcule['indicateurs']>): string {
  const parNiveau = new Map(indicateurs.mouvementsParPerimetre.map(m => [m.niveau, m.nombre]))
  const morceaux = NIVEAUX_PROXIMITE.filter(n => (parNiveau.get(n) ?? 0) > 0).map(
    n => `${fmt(parNiveau.get(n) ?? 0)} ${LIBELLE_PROXIMITE[n].toLowerCase()}`,
  )
  return morceaux.length === 0 ? '—' : morceaux.join(' · ')
}

export interface ProprietesTableauScenarios {
  scenarios: ScenarioCalcule[]
  /** Scénario affiché, `null` pour la situation actuelle. */
  affiche: string | null
  onAfficher: (scenario: string) => void
}

/** Panneau « Résultats ». */
export function TableauScenarios({ scenarios, affiche, onAfficher }: ProprietesTableauScenarios) {
  return (
    <Panel
      kicker="Résultats"
      title={`${fmt(scenarios.length)} scénario(s) calculé(s)`}
      hint="Sélectionnez le scénario à afficher dans tout le reste de l’application."
    >
      {scenarios.length === 0 ? (
        <p className="hint">Aucun scénario n’a encore été exécuté.</p>
      ) : (
        <table className="compare-table">
          <thead>
            <tr>
              <th>Scénario</th>
              <th>Périmètre</th>
              <th className="num">Postes nécessaires</th>
              <th className="num">Couverts</th>
              <th className="num">Résiduel</th>
              <th className="num">Couverture</th>
              <th>Mouvements proposés</th>
              <th>Contrôles</th>
              <th>Affiché</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map(({ scenario, indicateurs, obsolete }) => (
              <tr key={scenario.id} className={affiche === scenario.id ? 'ligne-active' : undefined}>
                <th scope="row">
                  {scenario.nom} {obsolete && <Pill tone="warn">Règles modifiées depuis</Pill>}
                </th>
                <td>{LIBELLE_SCOPE[scenario.scope]}</td>
                <td className="num">{indicateurs ? fmt(indicateurs.besoinInitial) : '—'}</td>
                <td className="num">{indicateurs ? fmt(indicateurs.postesCouverts) : '—'}</td>
                <td className="num">{indicateurs ? fmt(indicateurs.besoinResiduel) : '—'}</td>
                <td className="num">{indicateurs ? fmtPct(indicateurs.tauxCouverture) : '—'}</td>
                <td>{indicateurs ? resumeMouvements(indicateurs) : '—'}</td>
                <td>
                  {indicateurs &&
                    (indicateurs.controlesEnEcart === 0 ? (
                      <Pill tone="ok">
                        <Check size={11} aria-hidden="true" /> Conformes
                      </Pill>
                    ) : (
                      <Pill tone="alert">
                        <X size={11} aria-hidden="true" /> {indicateurs.controlesEnEcart} écart(s)
                      </Pill>
                    ))}
                </td>
                <td>
                  {affiche === scenario.id ? (
                    <Pill tone="info">Affiché</Pill>
                  ) : (
                    <button type="button" className="btn btn-sm" onClick={() => onAfficher(scenario.id)}>
                      Afficher
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}
