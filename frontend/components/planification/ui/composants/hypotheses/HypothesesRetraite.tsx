'use client'

/**
 * Hypothèses de départ à la retraite : âge légal, date à laquelle l'âge est
 * apprécié et exceptions par statut ou catégorie. Le mémo demande de confirmer
 * les règles réglementaires : chaque valeur porte sa source.
 */

import { Plus, Trash2 } from 'lucide-react'

import type { ExceptionRetraite, Hypotheses } from '@shared/api'
import { Panel } from '@shared/ui/commun'

import { Justification } from './Justification'

type Retraite = Hypotheses['retraite']

export interface ProprietesHypothesesRetraite {
  retraite: Retraite
  onChange: (retraite: Retraite) => void
}

/** Panneau « Départs à la retraite ». */
export function HypothesesRetraite({ retraite, onChange }: ProprietesHypothesesRetraite) {
  const majException = (index: number, patch: Partial<ExceptionRetraite>) =>
    onChange({ ...retraite, exceptions: retraite.exceptions.map((e, i) => (i === index ? { ...e, ...patch } : e)) })

  return (
    <Panel kicker="Retraite" title="Départs à la retraite">
      <div className="param-grid">
        <div className="field">
          <label htmlFor="hy-age">Âge légal de départ (ans)</label>
          <input
            id="hy-age"
            type="number"
            min={50}
            max={70}
            value={retraite.ageLegal}
            onChange={e => onChange({ ...retraite, ageLegal: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="hy-date">L’âge est apprécié</label>
          <select
            id="hy-date"
            value={retraite.dateReference}
            onChange={e => onChange({ ...retraite, dateReference: e.target.value as Retraite['dateReference'] })}
          >
            <option value="rentree">à la rentrée scolaire</option>
            <option value="fin_annee_civile">au 31 décembre</option>
          </select>
        </div>
      </div>

      <h3>Exceptions</h3>
      {retraite.exceptions.length === 0 && <p className="hint">Aucune exception : l’âge légal s’applique à tous.</p>}
      {retraite.exceptions.map((exception, i) => (
        <div className="param-grid ligne-exception" key={i}>
          <div className="field">
            <label htmlFor={`hy-exc-critere-${i}`}>Critère</label>
            <select
              id={`hy-exc-critere-${i}`}
              value={exception.critere}
              onChange={e => majException(i, { critere: e.target.value as ExceptionRetraite['critere'] })}
            >
              <option value="statut">Statut</option>
              <option value="categorie">Catégorie</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`hy-exc-valeur-${i}`}>Valeur</label>
            <input
              id={`hy-exc-valeur-${i}`}
              type="text"
              value={exception.valeur}
              onChange={e => majException(i, { valeur: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`hy-exc-age-${i}`}>Âge de départ</label>
            <input
              id={`hy-exc-age-${i}`}
              type="number"
              min={50}
              max={70}
              value={exception.ageLegal}
              onChange={e => majException(i, { ageLegal: Number(e.target.value) })}
            />
          </div>
          <button
            type="button"
            className="btn btn-sm btn-aligne"
            aria-label={`Retirer l’exception ${i + 1}`}
            onClick={() => onChange({ ...retraite, exceptions: retraite.exceptions.filter((_, j) => j !== i) })}
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm"
        onClick={() =>
          onChange({
            ...retraite,
            exceptions: [...retraite.exceptions, { critere: 'statut', valeur: '', ageLegal: retraite.ageLegal }],
          })
        }
      >
        <Plus size={13} aria-hidden="true" /> Ajouter une exception
      </button>

      <Justification
        id="hy-retraite"
        valeur={retraite}
        onChange={j => onChange({ ...retraite, source: j.source, justification: j.justification })}
      />
    </Panel>
  )
}
