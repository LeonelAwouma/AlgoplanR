'use client'

/**
 * Rapport décisionnel (§19).
 *
 * Le rapport est assemblé par le serveur à partir des seuls résultats calculés,
 * pour le périmètre, les filtres et le scénario sélectionnés. Cette page le
 * présente avec sa propre mise en page et en produit les fichiers d'export.
 */

import { useSession } from '@shared/session'
import { Panel } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { DataQualityPanel, useJeu, useQualite } from '@components/donnees'
import { useDiagnostic, useSynthese, useVueTerritoriale } from '@components/diagnostic'
import { useParametres } from '@components/parametrage'
import { useComparaison, useFlux, useResultat, useScenarioAffiche } from '@components/simulation'

import { useRapport } from '../application/hooks'
import { DocumentRapport } from './composants/DocumentRapport'
import { ExportsRapport } from './composants/ExportsRapport'

/** Page « Rapports ». */
export function RapportPage() {
  const { jeu, filtres } = useSession()
  const { scenario, detail } = useScenarioAffiche()

  const rapport = useRapport(jeu, filtres, scenario)
  const diagnostic = useDiagnostic(jeu, filtres)
  const synthese = useSynthese(jeu, filtres, scenario)
  const vue = useVueTerritoriale(jeu, filtres, null)
  const resultat = useResultat(jeu, scenario, filtres.territoire)
  const flux = useFlux(jeu, scenario, filtres.territoire)
  const comparaison = useComparaison(jeu, filtres.territoire)
  const qualite = useQualite(jeu)
  const meta = useJeu(jeu)
  const parametres = useParametres(jeu)

  if (!rapport.data || !diagnostic.data || !synthese.data) {
    return <EtatRequetes requetes={[rapport, diagnostic, synthese]} libelle="Préparation du rapport…" />
  }

  const affiche = scenario ? (resultat.data ?? null) : null
  const scenarioNom = detail?.scenario.nom ?? 'Situation actuelle (aucune simulation)'
  const rapportQualite = qualite.data?.rapport ?? null

  return (
    <div className="stack">
      <div className="no-print stack">
        <ExportsRapport
          rapport={rapport.data}
          scenarioNom={scenarioNom}
          demonstration={meta.data?.demonstration ?? false}
          ecoles={diagnostic.data.ecoles}
          arbre={vue.data?.noeud ?? null}
          parametres={parametres.data ?? null}
          qualite={rapportQualite}
          resultat={affiche}
          comparaison={comparaison.data?.resultats ?? []}
        />

        {rapportQualite && (
          <Panel kicker="Contrôle" title="Qualité des données du rapport">
            <DataQualityPanel rapport={rapportQualite} compact />
          </Panel>
        )}
      </div>

      <DocumentRapport
        rapport={rapport.data}
        scenarioNom={scenarioNom}
        totals={diagnostic.data.totals}
        resultat={affiche}
        besoins={synthese.data.besoinsParEnfant}
        reduction={synthese.data.reductionDeficit}
        flux={affiche ? (flux.data ?? null) : null}
      />
    </div>
  )
}
