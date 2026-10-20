'use client'

/**
 * Indicateurs de suivi (mémo de synthèse, §3, étape 6) : couverture du besoin,
 * mobilisation du vivier, réalisation des nominations, écart entre prévu et
 * réalisé, besoin résiduel — sur le périmètre sélectionné, et leur évolution
 * d'une version de planification à l'autre. Un panneau compare aussi le taux
 * d'encadrement et le turnover avant (fichier d'origine) et après l'algorithme.
 */

import type { IndicateurSuivi } from '@shared/api'
import { selectionLevel } from '@shared/kernel'
import { useSession } from '@shared/session'
import { KpiCard, Panel, fmt } from '@shared/ui/commun'
import { ChargementEnCours, EtatRequetes } from '@shared/ui/etats'

import { useEncadrementScenario, useScenarioAffiche } from '@components/simulation'

import { useDegreAlea, useEvolutionIndicateurs, useIndicateurs } from '../application/hooks'
import { construireSuiviAvantApres } from '../application/suiviAvantApres'
import { EncadrementTurnover } from './composants/EncadrementTurnover'
import { SuiviAvantApres } from './composants/SuiviAvantApres'

/** Valeur affichée d'un indicateur, selon son unité. */
function valeurAffichee(indicateur: IndicateurSuivi): string {
  if (indicateur.valeur == null) return '—'
  // Le serveur renvoie les pourcentages déjà en pourcents entiers (47 pour 47 %), pas en part de 0 à 1.
  return indicateur.unite === 'pourcentage' ? `${Math.round(indicateur.valeur)} %` : fmt(indicateur.valeur)
}

/** Page « Indicateurs de suivi ». */
export function IndicateursPage() {
  const { jeu, filtres } = useSession()
  const perimetre = {
    niveau: selectionLevel(filtres.territoire),
    region: filtres.territoire.region,
    departement: filtres.territoire.departement,
    commune: filtres.territoire.commune,
  }
  const indicateurs = useIndicateurs(jeu, perimetre)
  const evolution = useEvolutionIndicateurs(jeu, perimetre)
  const { scenario, detail } = useScenarioAffiche()
  const encadrement = useEncadrementScenario(jeu, scenario, filtres.territoire)
  const alea = useDegreAlea(jeu, { ...perimetre, scenario: scenario ?? undefined })

  if (!jeu) return <ChargementEnCours />
  if (!indicateurs.data) return <EtatRequetes requetes={[indicateurs]} />

  const codes = indicateurs.data.indicateurs.map(i => i.code)

  return (
    <div className="stack">
      <Panel kicker="Suivi" title={`Indicateurs — ${indicateurs.data.perimetre}`}>
        <div className="kpi-row">
          {indicateurs.data.indicateurs.map(i => (
            <KpiCard key={i.code} label={i.libelle} value={valeurAffichee(i)} hint={i.detail} />
          ))}
        </div>
      </Panel>

      {scenario !== null && (encadrement.data || alea.data) && (
        <SuiviAvantApres
          suivi={construireSuiviAvantApres(encadrement.data, alea.data)}
          scenarioNom={detail?.scenario.nom ?? 'scénario affiché'}
        />
      )}

      {scenario === null ? (
        <Panel kicker="Encadrement et rotation" title="Avant / après l’algorithme">
          <p className="hint">
            Aucun scénario calculé : lancez un scénario pour comparer l’encadrement et le turnover.
          </p>
        </Panel>
      ) : encadrement.data ? (
        <EncadrementTurnover comparaison={encadrement.data} scenarioNom={detail?.scenario.nom ?? 'scénario affiché'} />
      ) : (
        <EtatRequetes requetes={[encadrement]} />
      )}

      <Panel kicker="Évolution" title="D’une version de la planification à l’autre">
        {!evolution.data ? (
          <EtatRequetes requetes={[evolution]} />
        ) : evolution.data.points.length === 0 ? (
          <p className="hint">Une seule version calculée : l’évolution apparaîtra après la prochaine actualisation.</p>
        ) : (
          <div className="table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  {indicateurs.data.indicateurs.map(i => (
                    <th key={i.code} scope="col" className="num">
                      {i.libelle}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evolution.data.points.map(p => {
                  const parCode = new Map(p.indicateurs.map(i => [i.code, i]))
                  return (
                    <tr key={p.version}>
                      <th scope="row">
                        {p.version}
                        <small className="bloc">{new Date(p.calculeLe).toLocaleDateString('fr-FR')}</small>
                      </th>
                      {codes.map(code => {
                        const i = parCode.get(code)
                        return (
                          <td key={code} className="num">
                            {i ? valeurAffichee(i) : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
