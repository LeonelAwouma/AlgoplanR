'use client'

/**
 * Champ de désignation de l'enseignant à redéployer. Quand plusieurs
 * homonymes correspondent, c'est l'utilisateur qui tranche, jamais
 * l'application.
 */

import { Check } from 'lucide-react'

import { fmt } from '@shared/ui/commun'

import type { DesignationEnseignant } from '../useDesignation'

/** Homonymes listés avant d'inviter à saisir le matricule. */
const HOMONYMES_AFFICHES = 8

export interface ProprietesChampEnseignant {
  saisie: string
  onSaisie: (saisie: string) => void
  onChoixHomonyme: (matricule: string) => void
  designation: DesignationEnseignant
}

/** Champ « Nom de l'enseignant à redéployer ». */
export function ChampEnseignant({ saisie, onSaisie, onChoixHomonyme, designation }: ProprietesChampEnseignant) {
  const { designe, candidats, suggestions, total } = designation

  return (
    <div className="field">
      <label htmlFor="prince-ens">Nom de l’enseignant à redéployer</label>
      <input
        id="prince-ens"
        type="text"
        list="prince-ens-liste"
        autoComplete="off"
        value={saisie}
        onChange={e => onSaisie(e.target.value)}
        placeholder="Tapez le nom, le prénom ou le matricule…"
      />
      <datalist id="prince-ens-liste">
        {suggestions.map(t => (
          <option key={t.id} value={t.id}>
            {t.nom} {t.prenom} · {t.communeAttache}
          </option>
        ))}
      </datalist>

      {designe ? (
        designe.faitPrinceId ? (
          <span className="hint">
            {designe.nom} {designe.prenom} a déjà été redéployé par la DRH : annulez d’abord cette décision.
          </span>
        ) : (
          <span className="prince-trouve">
            <Check size={13} aria-hidden="true" /> {designe.nom} {designe.prenom} ({designe.id}) — rattaché à{' '}
            {designe.idEtabAttache}, {designe.communeAttache}
          </span>
        )
      ) : candidats.length > 0 ? (
        <div className="prince-homonymes">
          <span className="hint">{fmt(candidats.length)} enseignants portent ce nom. Lequel redéployer ?</span>
          <ul>
            {candidats.slice(0, HOMONYMES_AFFICHES).map(t => (
              <li key={t.id}>
                <button type="button" className="btn btn-sm" onClick={() => onChoixHomonyme(t.id)}>
                  {t.nom} {t.prenom} — {t.id} ({t.communeAttache})
                </button>
              </li>
            ))}
          </ul>
          {candidats.length > HOMONYMES_AFFICHES && (
            <span className="hint">
              {fmt(candidats.length - HOMONYMES_AFFICHES)} autres ne sont pas listés : saisissez le matricule pour
              trancher.
            </span>
          )}
        </div>
      ) : (
        <span className="hint">
          {saisie.trim()
            ? 'Aucun enseignant ne correspond : vérifiez le nom ou saisissez le matricule.'
            : `${fmt(total)} enseignants dans le jeu de données.`}
        </span>
      )}
    </div>
  )
}
