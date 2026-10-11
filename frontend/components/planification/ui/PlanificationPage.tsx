'use client'

/**
 * Planification sur cinq ans (mémo de synthèse, §2.1).
 *
 * Tableau prévisionnel N+1 → N+5 du périmètre sélectionné dans la barre de
 * filtres : effectifs, départs, besoins, ressources du vivier, quotas,
 * nominations et déploiements, besoin restant. Les ventilations, le plan des
 * départs, la fiabilité des données et les versions sont en onglets.
 */

import { useState } from 'react'

import type { SousSysteme } from '@shared/api'
import { descendre, selectionLevel } from '@shared/kernel'
import { useSession } from '@shared/session'
import { Notice, Panel } from '@shared/ui/commun'
import { ChargementEnCours, EtatRequetes } from '@shared/ui/etats'
import { Onglets } from '@shared/ui/Onglets'

import { useTableauPlanification, type RequetePlanification } from '../application/hooks'
import { EcolesPlanification } from './composants/EcolesPlanification'
import { EtatPlanificationPanel } from './composants/EtatPlanificationPanel'
import { FiabilitePanel } from './composants/FiabilitePanel'
import { PlanDepartsPanel } from './composants/PlanDepartsPanel'
import { TableauCinqAns } from './composants/TableauCinqAns'
import { VentilationSousSystemes, VentilationTerritoriale } from './composants/Ventilations'
import { VersionsPanel } from './composants/VersionsPanel'

/** Onglets de détail, sous le tableau principal. */
const ONGLETS = [
  { cle: 'territoires', libelle: 'Par territoire' },
  { cle: 'sous-systemes', libelle: 'Par sous-système' },
  { cle: 'ecoles', libelle: 'Écoles' },
  { cle: 'departs', libelle: 'Plan des départs' },
  { cle: 'fiabilite', libelle: 'Fiabilité des données' },
  { cle: 'versions', libelle: 'Versions' },
] as const

type CleOnglet = (typeof ONGLETS)[number]['cle']

/** Page « Planification sur 5 ans ». */
export function PlanificationPage() {
  const { jeu, filtres, setFiltres } = useSession()
  const [sousSysteme, setSousSysteme] = useState<SousSysteme | null>(null)
  const [onglet, setOnglet] = useState<CleOnglet>('territoires')

  const requete: RequetePlanification = {
    niveau: selectionLevel(filtres.territoire),
    region: filtres.territoire.region,
    departement: filtres.territoire.departement,
    commune: filtres.territoire.commune,
    sousSysteme,
  }
  const tableau = useTableauPlanification(jeu, requete)

  if (!jeu) return <ChargementEnCours />

  const explorer = (nom: string) => setFiltres({ ...filtres, territoire: descendre(filtres.territoire, nom) })

  return (
    <div className="stack">
      <Notice tone="info" title="Une projection, pas un engagement.">
        Les valeurs projetées dépendent des hypothèses de calcul (âge de départ, taux d’attrition, prise en compte des
        quotas) : elles sont explicites et modifiables dans « Hypothèses de calcul ». Les résultats se lisent sous
        réserve de la disponibilité des données, détaillée dans l’onglet « Fiabilité ».
      </Notice>

      <EtatPlanificationPanel jeu={jeu} />

      <Panel kicker="Périmètre" title="Territoire et sous-système">
        <div className="param-grid">
          <div className="field">
            <label htmlFor="pl-sous-systeme">Sous-système</label>
            <select
              id="pl-sous-systeme"
              value={sousSysteme ?? ''}
              onChange={e => setSousSysteme((e.target.value || null) as SousSysteme | null)}
            >
              <option value="">Les deux sous-systèmes</option>
              <option value="francophone">Francophone</option>
              <option value="anglophone">Anglophone</option>
            </select>
          </div>
        </div>
        <p className="hint">Le territoire se choisit dans la barre de filtres, en haut de la page.</p>
      </Panel>

      {tableau.data ? <TableauCinqAns tableau={tableau.data} /> : <EtatRequetes requetes={[tableau]} />}

      <Panel kicker="Détail" title="Ventilations et suivi" flush>
        <Onglets onglets={ONGLETS} actif={onglet} onChange={setOnglet} libelle="Détail de la planification">
          <div className="onglet-contenu">
            {onglet === 'territoires' && <VentilationTerritoriale jeu={jeu} requete={requete} onExplorer={explorer} />}
            {onglet === 'sous-systemes' && <VentilationSousSystemes jeu={jeu} requete={requete} />}
            {onglet === 'ecoles' && <EcolesPlanification jeu={jeu} requete={requete} />}
            {onglet === 'departs' && <PlanDepartsPanel jeu={jeu} requete={requete} />}
            {onglet === 'fiabilite' && <FiabilitePanel jeu={jeu} requete={requete} />}
            {onglet === 'versions' && <VersionsPanel jeu={jeu} />}
          </div>
        </Onglets>
      </Panel>
    </div>
  )
}
