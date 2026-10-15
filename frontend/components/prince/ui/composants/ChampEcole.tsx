'use client'

/** Champ de désignation de l'école de destination, par son nom ou son code. */

import { Check } from 'lucide-react'

import type { SchoolDiagnostic } from '@shared/api'
import { fmt } from '@shared/ui/commun'

import type { DesignationEcole } from '../useDesignation'

/** Écoles listées quand plusieurs correspondent à la saisie. */
const CANDIDATES_AFFICHEES = 6

/** Besoin d'une école, en clair. */
function besoinEnClair(d: SchoolDiagnostic): string {
  return d.besoinTheorique > 0 ? `${d.besoinTheorique} poste(s) manquant(s)` : 'aucun poste manquant'
}

export interface ProprietesChampEcole {
  saisie: string
  onSaisie: (saisie: string) => void
  designation: DesignationEcole
}

/** Champ « École où le déployer ». */
export function ChampEcole({ saisie, onSaisie, designation }: ProprietesChampEcole) {
  const { designe, candidats, suggestions, total } = designation

  return (
    <div className="field">
      <label htmlFor="prince-ecole">École où le déployer</label>
      <input
        id="prince-ecole"
        type="text"
        list="prince-ecole-liste"
        autoComplete="off"
        value={saisie}
        onChange={e => onSaisie(e.target.value)}
        placeholder="Tapez le nom de l’école ou son code…"
      />
      <datalist id="prince-ecole-liste">
        {suggestions.map(d => (
          <option key={d.school.id} value={d.school.nom}>
            {d.school.commune} · {besoinEnClair(d)}
          </option>
        ))}
      </datalist>

      {designe ? (
        <span className="prince-trouve">
          <Check size={13} aria-hidden="true" /> {designe.school.nom} ({designe.school.commune}) —{' '}
          {besoinEnClair(designe)}
        </span>
      ) : candidats.length > 0 ? (
        <div className="prince-homonymes">
          <span className="hint">{fmt(candidats.length)} écoles correspondent. Laquelle ?</span>
          <ul>
            {candidats.slice(0, CANDIDATES_AFFICHEES).map(d => (
              <li key={d.school.id}>
                <button type="button" className="btn btn-sm" onClick={() => onSaisie(d.school.id)}>
                  {d.school.nom} — {d.school.commune}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <span className="hint">
          {saisie.trim()
            ? 'Aucune école ne correspond : vérifiez le nom ou saisissez le code.'
            : `${fmt(total)} écoles dans le jeu de données.`}
        </span>
      )}
    </div>
  )
}
