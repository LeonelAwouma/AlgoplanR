'use client'

/**
 * Plan des départs : départs à la retraite nominatifs, année par année, et
 * attrition estimée par territoire et sous-système.
 */

import { Download } from 'lucide-react'

import type { DepartRetraitePrevu, IdJeu } from '@shared/api'
import { exporterCSV } from '@shared/exports/export-csv'
import { LIBELLE_SOUS_SYSTEME } from '@shared/kernel'
import { DataTable, fmt, type Colonne } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { usePlanDeparts, type RequetePlanification } from '../../application/hooks'

/** Colonnes de la liste des départs à la retraite. */
const COLONNES: Colonne<DepartRetraitePrevu>[] = [
  { cle: 'annee', entete: 'Année', rendu: d => d.annee, tri: d => d.annee },
  {
    cle: 'nom',
    entete: 'Enseignant',
    rendu: d => (
      <span>
        <strong>{d.nom}</strong>
        <small>{d.matricule}</small>
      </span>
    ),
    tri: d => d.nom,
  },
  { cle: 'ecole', entete: 'École', rendu: d => d.nomEtab, tri: d => d.nomEtab },
  { cle: 'age', entete: 'Âge au départ', numerique: true, rendu: d => fmt(d.ageAuDepart), tri: d => d.ageAuDepart },
]

/** Onglet « Plan des départs ». */
export function PlanDepartsPanel({ jeu, requete }: { jeu: IdJeu; requete: RequetePlanification }) {
  const departs = usePlanDeparts(jeu, requete)
  if (!departs.data) return <EtatRequetes requetes={[departs]} />

  const { retraites, attrition } = departs.data

  return (
    <div className="stack">
      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            exporterCSV(
              'plan-des-departs.csv',
              ['Année', 'Matricule', 'Enseignant', 'École', 'Date de naissance', 'Âge au départ'],
              retraites.map(d => [d.annee, d.matricule, d.nom, d.nomEtab, d.dateNaissance, d.ageAuDepart]),
            )
          }
        >
          <Download size={13} aria-hidden="true" /> Exporter les départs (CSV)
        </button>
      </div>

      <DataTable
        lignes={retraites}
        colonnes={COLONNES}
        cle={d => `${d.annee}-${d.matricule}`}
        legende="Départs à la retraite prévus"
        messageVide="Aucun départ à la retraite prévu sur ce périmètre et cet horizon."
      />

      <h3>Attrition estimée</h3>
      {attrition.length === 0 ? (
        <p className="hint">Aucune attrition estimée sur ce périmètre.</p>
      ) : (
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Année</th>
              <th scope="col">Territoire</th>
              <th scope="col">Sous-système</th>
              <th scope="col" className="num">
                Départs estimés
              </th>
            </tr>
          </thead>
          <tbody>
            {attrition.map(a => (
              <tr key={`${a.annee}-${a.territoire}-${a.sousSysteme}`}>
                <th scope="row">{a.annee}</th>
                <td>{a.territoire}</td>
                <td>{LIBELLE_SOUS_SYSTEME[a.sousSysteme]}</td>
                <td className="num">{fmt(a.departs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
