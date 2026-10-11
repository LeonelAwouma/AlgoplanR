'use client'

/** Enseignants du vivier restés sans proposition dans le scénario affiché (vue analyste). */

import { SANS_PAGINATION, type PoolTeacher } from '@shared/api'
import { useSession } from '@shared/session'
import { DataTable, Notice, Panel, fmt, fmtDec, type Colonne } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useNonAffectes } from '../../application/hooks'
import { useScenarioAffiche } from '../../application/scenarioAffiche'
import { SansScenario } from '../composants/SansScenario'

/** Colonnes de la liste des non affectés. */
const COLONNES: Colonne<PoolTeacher>[] = [
  { cle: 'id', entete: 'Matricule', rendu: p => <span className="mono">{p.teacher.id}</span>, tri: p => p.teacher.id },
  { cle: 'nom', entete: 'Enseignant', rendu: p => `${p.teacher.nom} ${p.teacher.prenom}`, tri: p => p.teacher.nom },
  { cle: 'ecole', entete: 'École d’origine', rendu: p => p.ecoleOrigine.nom, tri: p => p.ecoleOrigine.nom },
  { cle: 'commune', entete: 'Commune', rendu: p => p.teacher.communeAttache, tri: p => p.teacher.communeAttache },
  {
    cle: 'departement',
    entete: 'Département',
    rendu: p => p.teacher.departementAttache,
    tri: p => p.teacher.departementAttache,
  },
  { cle: 'bareme', entete: 'Barème', numerique: true, rendu: p => fmtDec(p.bareme, 2), tri: p => p.bareme },
]

/** Page « Non affectés » (vue analyste). */
export function NonAffectesPage() {
  const { jeu } = useSession()
  const { scenario } = useScenarioAffiche()
  const nonAffectes = useNonAffectes(jeu, scenario, SANS_PAGINATION)

  if (!scenario) {
    return (
      <SansScenario texte="Cette page liste les enseignants du vivier pour lesquels aucun poste compatible n’a été trouvé." />
    )
  }
  if (!nonAffectes.data) return <EtatRequetes requetes={[nonAffectes]} />

  return (
    <div className="stack">
      <Notice tone="neutral" title="Pourquoi un enseignant reste non affecté.">
        Aucun poste ouvert ne se trouvait dans son périmètre autorisé, ou tous les postes de ce périmètre avaient déjà
        été pourvus par des enseignants mieux classés.
      </Notice>
      <Panel kicker="Vivier" title={`${fmt(nonAffectes.data.total)} enseignants non affectés`} flush>
        <DataTable
          lignes={nonAffectes.data.elements}
          colonnes={COLONNES}
          cle={p => p.teacher.id}
          legende="Enseignants du vivier sans proposition"
          messageVide="Tous les enseignants du vivier ont reçu une proposition."
        />
      </Panel>
    </div>
  )
}
