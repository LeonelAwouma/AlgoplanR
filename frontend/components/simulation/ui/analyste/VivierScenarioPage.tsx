'use client'

/**
 * Vivier de redéploiement du scénario affiché (vue analyste) : comment il a été
 * constitué, motifs d'exclusion et enseignants retenus.
 */

import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'

import type { PoolTeacher } from '@shared/api'
import { exporterCSV } from '@shared/exports/export-csv'
import { correspondRecherche } from '@shared/kernel'
import { useSession } from '@shared/session'
import { DataTable, Panel, Pill, SearchField, fmt, fmtDec, type Colonne } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useVivierScenario } from '../../application/hooks'
import { useScenarioAffiche } from '../../application/scenarioAffiche'
import { SansScenario } from '../composants/SansScenario'

/** Colonnes de la liste du vivier. */
const COLONNES: Colonne<PoolTeacher>[] = [
  { cle: 'id', entete: 'Matricule', rendu: p => <span className="mono">{p.teacher.id}</span>, tri: p => p.teacher.id },
  { cle: 'nom', entete: 'Enseignant', rendu: p => `${p.teacher.nom} ${p.teacher.prenom}`, tri: p => p.teacher.nom },
  {
    cle: 'ecole',
    entete: 'École d’origine',
    rendu: p => (
      <span>
        {p.ecoleOrigine.nom}
        <small>{p.teacher.communeAttache}</small>
      </span>
    ),
    tri: p => p.ecoleOrigine.nom,
  },
  {
    cle: 'excedent',
    entete: 'Excédent de l’école',
    numerique: true,
    rendu: p => fmt(p.ecoleOrigine.excedentMobilisable),
    tri: p => p.ecoleOrigine.excedentMobilisable,
  },
  {
    cle: 'rang',
    entete: 'Rang dans l’école',
    numerique: true,
    rendu: p => fmt(p.rangDansEcole),
    tri: p => p.rangDansEcole,
  },
  { cle: 'bareme', entete: 'Barème', numerique: true, rendu: p => fmtDec(p.bareme, 2), tri: p => p.bareme },
  {
    cle: 'affecte',
    entete: 'Affecté',
    rendu: p => <Pill tone={p.affecte ? 'ok' : 'neutral'}>{p.affecte ? 'Oui' : 'Non'}</Pill>,
    tri: p => (p.affecte ? 1 : 0),
  },
]

/** Exporte le vivier affiché en CSV. */
function exporterVivier(lignes: PoolTeacher[]) {
  exporterCSV(
    'vivier.csv',
    ['Matricule', 'Nom', 'Prénom', 'École origine', 'Commune', 'Excédent école', 'Rang', 'Barème', 'Affecté'],
    lignes.map(p => [
      p.teacher.id,
      p.teacher.nom,
      p.teacher.prenom,
      p.ecoleOrigine.nom,
      p.teacher.communeAttache,
      p.ecoleOrigine.excedentMobilisable,
      p.rangDansEcole,
      p.bareme,
      p.affecte ? 'Oui' : 'Non',
    ]),
  )
}

/** Page « Vivier » (vue analyste). */
export function VivierScenarioPage() {
  const { jeu } = useSession()
  const { scenario } = useScenarioAffiche()
  const vivier = useVivierScenario(jeu, scenario)
  const [recherche, setRecherche] = useState('')

  const lignes = useMemo(
    () =>
      (vivier.data?.teachers ?? []).filter(p =>
        correspondRecherche(recherche, p.teacher.id, p.teacher.nom, p.teacher.prenom, p.ecoleOrigine.nom),
      ),
    [vivier.data, recherche],
  )

  if (!scenario) return <SansScenario texte="Le vivier est constitué lors de l’exécution d’un scénario." />
  if (!vivier.data) return <EtatRequetes requetes={[vivier]} />

  const v = vivier.data
  return (
    <div className="stack">
      <Panel kicker="Constitution" title="Comment ce vivier a été constitué">
        <dl className="def-grid">
          <div>
            <dt>Excédent théorique total</dt>
            <dd>{fmt(v.excedentTotal)}</dd>
          </div>
          <div>
            <dt>Enseignants retenus</dt>
            <dd>{fmt(v.teachers.length)}</dd>
          </div>
          <div>
            <dt>Écoles sources</dt>
            <dd>{fmt(v.ecolesSources.length)}</dd>
          </div>
          <div>
            <dt>Affectés</dt>
            <dd>{fmt(v.teachers.filter(p => p.affecte).length)}</dd>
          </div>
        </dl>
        <h3 className="titre-section">Motifs d’exclusion du vivier</h3>
        <table className="compare-table">
          <thead>
            <tr>
              <th>Motif</th>
              <th className="num">Enseignants écartés</th>
            </tr>
          </thead>
          <tbody>
            {v.exclusions.map(e => (
              <tr key={e.code}>
                <th scope="row" className="th-normal">
                  {e.label}
                </th>
                <td className="num">{fmt(e.count)}</td>
              </tr>
            ))}
            {v.exclusions.length === 0 && (
              <tr>
                <td colSpan={2}>Aucun enseignant écarté.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      <div className="filter-bar">
        <SearchField
          value={recherche}
          onChange={setRecherche}
          label="Rechercher dans le vivier"
          placeholder="Matricule, nom, école…"
        />
        <div className="filter-bar-actions">
          <button type="button" className="btn btn-sm" onClick={() => exporterVivier(lignes)}>
            <Download size={13} aria-hidden="true" /> Exporter (CSV)
          </button>
        </div>
      </div>

      <Panel kicker="Vivier" title={`${fmt(lignes.length)} enseignants mobilisables`} flush>
        <DataTable
          lignes={lignes}
          colonnes={COLONNES}
          cle={p => p.teacher.id}
          legende="Vivier réellement redéployable"
        />
      </Panel>
    </div>
  )
}
