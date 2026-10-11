'use client'

/**
 * Disponibilité des données qui fondent les projections : une date de
 * naissance manquante empêche de prévoir un départ à la retraite, un
 * sous-système manquant empêche de ventiler. Le mémo demande de consulter les
 * résultats « sous réserve de la disponibilité et de la fiabilité des données ».
 */

import type { IdJeu, LigneFiabilite } from '@shared/api'
import { fmt, fmtPct } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useFiabilite, type RequetePlanification } from '../../application/hooks'

/** Ligne du tableau de fiabilité. */
function Ligne({ ligne, entete }: { ligne: LigneFiabilite; entete?: boolean }) {
  return (
    <tr className={entete ? 'ligne-forte' : undefined}>
      <th scope="row">{ligne.territoire}</th>
      <td className="num">{fmt(ligne.ecoles)}</td>
      <td className="num">{fmt(ligne.enseignants)}</td>
      <td className="num">{fmtPct(ligne.tauxDateNaissance)}</td>
      <td className="num">{fmtPct(ligne.tauxSousSysteme)}</td>
      <td className="num">{fmtPct(ligne.tauxEffectifsEleves)}</td>
    </tr>
  )
}

/** Onglet « Fiabilité des données ». */
export function FiabilitePanel({ jeu, requete }: { jeu: IdJeu; requete: RequetePlanification }) {
  const fiabilite = useFiabilite(jeu, requete)
  if (!fiabilite.data) return <EtatRequetes requetes={[fiabilite]} />

  return (
    <div className="table-scroll">
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">Territoire</th>
            <th scope="col" className="num">
              Écoles
            </th>
            <th scope="col" className="num">
              Enseignants
            </th>
            <th scope="col" className="num">
              Dates de naissance renseignées
            </th>
            <th scope="col" className="num">
              Sous-système renseigné
            </th>
            <th scope="col" className="num">
              Effectifs d’élèves renseignés
            </th>
          </tr>
        </thead>
        <tbody>
          <Ligne ligne={fiabilite.data.global} entete />
          {fiabilite.data.parTerritoire.map(l => (
            <Ligne key={l.territoire} ligne={l} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
