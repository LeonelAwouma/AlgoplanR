'use client'

/**
 * Comparaison des conséquences de chaque scénario calculé sur le territoire
 * observé, puis détail du scénario affiché : avant / après, déficit par
 * région, contrôles métier.
 *
 * Comparer n'est pas classer : aucun scénario n'est présenté comme préférable.
 */

import { AlertTriangle, Check } from 'lucide-react'

import type { SimulationResult } from '@shared/api'
import { selectionLabel } from '@shared/kernel'
import { useSession } from '@shared/session'
import { Delta, EmptyState, Notice, Panel, Pill, fmt, fmtPct } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { AvantApres, CouvertureParScenario } from '@shared/ui/graphiques'
import { useDiagnostic } from '@components/diagnostic'

import { useComparaison, useFlux } from '../application/hooks'
import { useScenarioAffiche } from '../application/scenarioAffiche'
import { FluxPanel } from './composants/FluxPanel'

/** Ligne du tableau comparatif : valeur de la situation actuelle, puis de chaque scénario. */
interface LigneComparaison {
  label: string
  actuel: string
  valeur: (r: SimulationResult) => string
}

/** Nombre de mouvements d'une nature dans un résultat. */
function mouvements(r: SimulationResult, nature: SimulationResult['mouvementsParNature'][number]['nature']): number {
  return r.mouvementsParNature.find(m => m.nature === nature)?.nombre ?? 0
}

/** Page « Comparaison ». */
export function ComparaisonPage() {
  const { jeu, filtres, setPage, ouvrirEcole } = useSession()
  const { scenario } = useScenarioAffiche()
  const comparaison = useComparaison(jeu, filtres.territoire)
  const diagnostic = useDiagnostic(jeu, filtres)
  const flux = useFlux(jeu, scenario, filtres.territoire)

  if (!comparaison.data || !diagnostic.data) return <EtatRequetes requetes={[comparaison, diagnostic]} />

  const { resultats, reductions } = comparaison.data
  if (resultats.length === 0) {
    return (
      <EmptyState
        titre="Aucun scénario calculé"
        action={{ label: 'Créer un scénario', onClick: () => setPage('simulations') }}
      >
        Exécutez au moins un scénario pour comparer les conséquences de chaque jeu de règles.
      </EmptyState>
    )
  }

  const indexAffiche = resultats.findIndex(r => r.scenarioId === scenario)
  const affiche = indexAffiche >= 0 ? resultats[indexAffiche] : null
  const reduction = indexAffiche >= 0 ? reductions[indexAffiche] : null
  const besoinActuel = diagnostic.data.totals.postesNecessaires
  const reference = resultats[0]

  const lignes: LigneComparaison[] = [
    { label: 'Postes nécessaires', actuel: fmt(besoinActuel), valeur: r => fmt(r.besoinInitial) },
    { label: 'Postes couverts', actuel: '0', valeur: r => fmt(r.postesCouverts) },
    { label: 'Enseignants déplacés', actuel: '0', valeur: r => fmt(r.enseignantsDeplaces) },
    { label: 'Écoles améliorées', actuel: '0', valeur: r => fmt(r.ecolesBeneficiaires) },
    { label: 'Écoles sources', actuel: '0', valeur: r => fmt(r.ecolesSources) },
    { label: 'Besoin résiduel', actuel: fmt(besoinActuel), valeur: r => fmt(r.besoinResiduel) },
    { label: 'Taux de couverture', actuel: '0 %', valeur: r => fmtPct(r.tauxCouverture) },
    { label: 'Vœux satisfaits', actuel: '—', valeur: r => fmt(mouvements(r, 'voeu')) },
    { label: 'Redéploiements obligatoires', actuel: '—', valeur: r => fmt(mouvements(r, 'obligatoire')) },
    {
      label: "Degré d'aléa",
      actuel: reference.syntheseAvant.degreAlea == null ? '—' : fmtPct(reference.syntheseAvant.degreAlea),
      valeur: r => (r.syntheseApres.degreAlea == null ? '—' : fmtPct(r.syntheseApres.degreAlea)),
    },
    {
      label: 'Recrutement à prévoir',
      actuel: fmt(reference.syntheseAvant.recrutementAPrevoir),
      valeur: r => fmt(r.syntheseApres.recrutementAPrevoir),
    },
  ]

  return (
    <div className="stack">
      <Notice tone="info" title="Comparer n’est pas classer.">
        Ce tableau présente les conséquences de chaque scénario. L’application ne désigne aucun scénario comme
        préférable : l’arbitrage relève d’une décision humaine.
      </Notice>

      <Panel kicker="Comparaison" title="Conséquences par scénario">
        <div className="table-scroll table-scroll-libre">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Indicateur</th>
                <th className="num">Situation actuelle</th>
                {resultats.map(r => (
                  <th key={r.scenarioId} className="num">
                    {r.scenarioNom} {scenario === r.scenarioId && <Pill tone="info">Affiché</Pill>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map(l => (
                <tr key={l.label}>
                  <th scope="row">{l.label}</th>
                  <td className="num">{l.actuel}</td>
                  {resultats.map(r => (
                    <td key={r.scenarioId} className="num">
                      {l.valeur(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {affiche && flux.data && (
        <FluxPanel
          flux={flux.data}
          perimetre={selectionLabel(filtres.territoire)}
          scenarioNom={affiche.scenarioNom}
          onOuvrirEcole={ouvrirEcole}
        />
      )}

      <Panel kicker="Couverture" title="Part des besoins couverte par scénario">
        <CouvertureParScenario
          scenarios={resultats.map(r => ({
            cle: r.scenarioId,
            label: r.scenarioNom,
            couverts: r.postesCouverts,
            residuel: r.besoinResiduel,
            taux: r.tauxCouverture,
          }))}
        />
      </Panel>

      {affiche && (
        <>
          <Panel kicker="Avant / Après" title={`Effet du scénario « ${affiche.scenarioNom} »`}>
            <AvantApres
              lignes={[
                {
                  label: 'Écoles en déficit',
                  avant: affiche.before.ecolesEnDeficit,
                  apres: affiche.after.ecolesEnDeficit,
                  rendu: <Delta avant={affiche.before.ecolesEnDeficit} apres={affiche.after.ecolesEnDeficit} />,
                },
                {
                  label: 'Postes vacants',
                  avant: affiche.before.postesVacants,
                  apres: affiche.after.postesVacants,
                  rendu: <Delta avant={affiche.before.postesVacants} apres={affiche.after.postesVacants} />,
                },
                {
                  label: 'Déficit total',
                  avant: affiche.before.deficitTotal,
                  apres: affiche.after.deficitTotal,
                  rendu: <Delta avant={affiche.before.deficitTotal} apres={affiche.after.deficitTotal} />,
                },
              ]}
            />
            {reduction && <p className="phrase-forte">{reduction.texte}</p>}
            {affiche.before.pressionMoyenne != null && (
              <p className="hint">
                Pression moyenne élèves par enseignant État : {affiche.before.pressionMoyenne.toLocaleString('fr-FR')}{' '}
                avant, {affiche.after.pressionMoyenne?.toLocaleString('fr-FR') ?? '—'} après.
              </p>
            )}
          </Panel>

          <div className="grid-2">
            <Panel kicker="Répartition" title="Déficit par région après simulation">
              {affiche.after.parRegion.length === 0 ? (
                <p className="hint">Aucun déficit résiduel sur ce périmètre.</p>
              ) : (
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>Région</th>
                      <th className="num">Avant</th>
                      <th className="num">Après</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affiche.before.parRegion.map(avant => (
                      <tr key={avant.region}>
                        <th scope="row">{avant.region}</th>
                        <td className="num">{fmt(avant.deficit)}</td>
                        <td className="num">
                          {fmt(affiche.after.parRegion.find(r => r.region === avant.region)?.deficit ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel kicker="Contrôles" title="Vérifications métier">
              <ul className="check-list">
                {affiche.invariants.map(i => (
                  <li key={i.code} className={i.ok ? 'check-ok' : 'check-alert'}>
                    {i.ok ? <Check size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
                    <span>
                      <strong className="texte-fort">{i.label}</strong>
                      <span className="hint bloc">{i.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
