'use client'

/** Affectations proposées par le scénario affiché (vue analyste), avec l'étape de l'algorithme. */

import { Download } from 'lucide-react'

import { SELECTION_NATIONALE, type ProposedAssignment } from '@shared/api'
import { exporterCSV } from '@shared/exports/export-csv'
import { LIBELLE_PROXIMITE } from '@shared/kernel'
import { useSession } from '@shared/session'
import { EtatRequetes } from '@shared/ui/etats'

import { useResultat } from '../../application/hooks'
import { useScenarioAffiche } from '../../application/scenarioAffiche'
import { PropositionsPanel } from '../composants/PropositionsPanel'
import { SansScenario } from '../composants/SansScenario'

/** Exporte les affectations en CSV. */
function exporterAffectations(affectations: ProposedAssignment[]) {
  exporterCSV(
    'affectations.csv',
    [
      'Phase',
      'Poste',
      'Matricule',
      'Nom',
      'Prénom',
      'École origine',
      'Commune origine',
      'École destination',
      'Commune destination',
      'Périmètre',
      'Barème',
      'Score',
    ],
    affectations.map(a => [
      a.phase,
      a.postId,
      a.teacherId,
      a.nomEns,
      a.prenomEns,
      a.nomEtabOrigine,
      a.communeOrigine,
      a.nomEtabDestination,
      a.communeDestination,
      LIBELLE_PROXIMITE[a.niveauProximite],
      a.bareme,
      a.score,
    ]),
  )
}

/** Page « Affectations » (vue analyste). */
export function AffectationsPage() {
  const { jeu } = useSession()
  const { scenario } = useScenarioAffiche()
  const resultat = useResultat(jeu, scenario, SELECTION_NATIONALE)

  if (!scenario)
    return <SansScenario texte="Les propositions d’affectation sont produites par l’exécution d’un scénario." />
  if (!jeu || !resultat.data) return <EtatRequetes requetes={[resultat]} />

  const r = resultat.data
  return (
    <div className="stack">
      <div className="filter-bar">
        <div className="filter-bar-actions">
          <button type="button" className="btn btn-sm" onClick={() => exporterAffectations(r.assignments)}>
            <Download size={13} aria-hidden="true" /> Exporter (CSV)
          </button>
        </div>
      </div>
      <PropositionsPanel key={r.scenarioId} jeu={jeu} resultat={r} analyste />
    </div>
  )
}
