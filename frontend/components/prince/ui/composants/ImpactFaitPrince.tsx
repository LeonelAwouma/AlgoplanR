'use client'

/**
 * Conséquences prévisibles d'un fait du Prince sur les deux écoles, calculées
 * par le serveur avant l'enregistrement. Elles sont informatives : elles
 * n'empêchent jamais la décision.
 */

import { AlertTriangle } from 'lucide-react'

import type { ImpactEcolePrince, ImpactPrince } from '@shared/api'
import { fmt } from '@shared/ui/commun'

/** Valeur avant → après. */
function Evolution({ avant, apres }: { avant: number; apres: number }) {
  return (
    <>
      {fmt(avant)} → <strong>{fmt(apres)}</strong>
    </>
  )
}

/** Ligne d'une école dans le tableau d'impact. */
function LigneImpact({ libelle, ecole }: { libelle: string; ecole: ImpactEcolePrince }) {
  return (
    <tr>
      <th scope="row">
        {libelle} — {ecole.nom}
      </th>
      <td className="num">
        <Evolution avant={ecole.effectifAvant} apres={ecole.effectifApres} />
      </td>
      <td className="num">
        <Evolution avant={ecole.besoinAvant} apres={ecole.besoinApres} />
      </td>
      <td className="num">
        <Evolution avant={ecole.excedentAvant} apres={ecole.excedentApres} />
      </td>
    </tr>
  )
}

/** Bloc « Conséquences de cette décision ». */
export function ImpactFaitPrince({ impact }: { impact: ImpactPrince }) {
  return (
    <div className="prince-impact">
      <h3>Conséquences de cette décision</h3>
      <table className="compare-table">
        <thead>
          <tr>
            <th>Établissement</th>
            <th className="num">Enseignants État</th>
            <th className="num">Postes manquants</th>
            <th className="num">Excédent mobilisable</th>
          </tr>
        </thead>
        <tbody>
          {impact.origine && <LigneImpact libelle="Origine" ecole={impact.origine} />}
          <LigneImpact libelle="Destination" ecole={impact.destination} />
        </tbody>
      </table>

      {impact.observations.length > 0 && (
        <ul className="reason-list">
          {impact.observations.map(o => (
            <li key={o}>
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Ces observations sont informatives : elles n’empêchent pas la décision.</p>
    </div>
  )
}
