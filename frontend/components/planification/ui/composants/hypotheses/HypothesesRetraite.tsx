'use client'

/**
 * Hypothèses de départ à la retraite : âge légal, date à laquelle l'âge est apprécié et année de mesure des âges. Chaque valeur porte sa
 * source. Les exceptions par statut ou catégorie ne sont pas lues par le calcul des départs (le serveur applique
 * l'âge légal à tous) : leur saisie est retirée de l'écran, celles qui existent déjà restent enregistrées, telles
 * quelles, et sont signalées.
 */

import type { Hypotheses } from '@shared/api'
import { Notice, Panel } from '@shared/ui/commun'

import { Justification } from './Justification'

type Retraite = Hypotheses['retraite']

export interface ProprietesHypothesesRetraite {
  retraite: Retraite
  onChange: (retraite: Retraite) => void
}

/** Panneau « Départs à la retraite ». */
export function HypothesesRetraite({ retraite, onChange }: ProprietesHypothesesRetraite) {
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
        <div className="field">
          <label htmlFor="hy-annee-ages">Année de mesure des âges</label>
          <input
            id="hy-annee-ages"
            type="text"
            inputMode="numeric"
            placeholder="même date que les effectifs"
            value={retraite.anneeAges ?? ''}
            onChange={e => onChange({ ...retraite, anneeAges: e.target.value || null })}
          />
        </div>
      </div>

      <p className="hint">
        Cet âge pilote la projection nominative des départs à la retraite (N+1 à N+5) ; le taux moyen de 1,08 % du
        rapport n’est jamais utilisé à sa place. L’année de mesure des âges (« AAAA-AAAA ») sert quand le fichier des
        enseignants a été formaté à une autre date que les effectifs : les âges sont alors ramenés au début de N+1.
        Laissez vide si les âges ont été mesurés à la même date que les effectifs. Il est distinct de l’« âge de départ
        à la retraite » du moteur d’affectation (Paramètres avancés, configuration du moteur), qui sert au Prince, au
        vivier et au barème. Aucune exception par statut ou catégorie n’est appliquée : l’âge légal vaut pour tous.
      </p>
      {retraite.exceptions.length > 0 && (
        <Notice tone="warn" title="Exceptions enregistrées, non appliquées.">
          {retraite.exceptions.length} exception(s) figurent dans cette version des hypothèses et sont conservées telles
          quelles, mais le calcul des départs ne les lit pas.
        </Notice>
      )}

      <Justification
        id="hy-retraite"
        valeur={retraite}
        onChange={j => onChange({ ...retraite, source: j.source, justification: j.justification })}
      />
    </Panel>
  )
}
