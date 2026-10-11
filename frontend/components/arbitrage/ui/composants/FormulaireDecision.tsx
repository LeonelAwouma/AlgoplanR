'use client'

/**
 * Saisie d'une décision de commission : instance, motif et, pour une
 * correction, école retenue parmi celles qui ont encore un poste ouvert. Le
 * serveur vérifie que le poste est vacant et que le départ reste dans la limite
 * de l'excédent.
 */

import { Gavel } from 'lucide-react'

import type { EcoleNonCouverte } from '@shared/api'
import { LIBELLE_NATURE } from '@shared/kernel'
import { Panel, fmt } from '@shared/ui/commun'
import { ErreurAction } from '@shared/ui/etats'

import { brouillonComplet, titreBrouillon, type BrouillonDecision } from '../../domain/brouillon'

export interface ProprietesFormulaireDecision {
  brouillon: BrouillonDecision
  onChange: (brouillon: BrouillonDecision) => void
  /** Écoles ayant encore un poste ouvert : destinations possibles d'une correction. */
  ecolesOuvertes: EcoleNonCouverte[]
  enregistrement: boolean
  erreur: unknown
  onEnregistrer: () => void
  onAnnuler: () => void
}

/** Panneau « Décision en cours ». */
export function FormulaireDecision({
  brouillon,
  onChange,
  ecolesOuvertes,
  enregistrement,
  erreur,
  onEnregistrer,
  onAnnuler,
}: ProprietesFormulaireDecision) {
  const maj = (patch: Partial<BrouillonDecision>) => onChange({ ...brouillon, ...patch })
  const ecolesTriees = [...ecolesOuvertes].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))

  return (
    <Panel kicker="Décision en cours" title={titreBrouillon(brouillon)}>
      {brouillon.proposition && (
        <p className="hint">
          Proposition initiale : {brouillon.proposition.nomEtabOrigine} → {brouillon.proposition.nomEtabDestination} (
          {LIBELLE_NATURE[brouillon.proposition.nature]}).
        </p>
      )}

      <div className="param-grid">
        {brouillon.decision === 'modifier' && (
          <div className="field">
            <label htmlFor="arb-dest">École retenue par la commission</label>
            <select
              id="arb-dest"
              value={brouillon.schoolDestinationId}
              onChange={e => maj({ schoolDestinationId: e.target.value })}
            >
              <option value="">Choisissez une école ayant un poste ouvert</option>
              {ecolesTriees.map(e => (
                <option key={e.schoolId} value={e.schoolId}>
                  {e.nom} — {e.commune} ({fmt(e.postes)} poste(s){e.sousSysteme ? `, ${e.sousSysteme}` : ''})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="arb-instance">Instance</label>
          <select
            id="arb-instance"
            value={brouillon.instance}
            onChange={e => maj({ instance: e.target.value as BrouillonDecision['instance'] })}
          >
            <option value="regionale">Commission régionale</option>
            <option value="centrale">Commission centrale</option>
          </select>
        </div>
        <div className="field field-recherche">
          <label htmlFor="arb-motif">Motif de la décision</label>
          <input
            id="arb-motif"
            type="text"
            value={brouillon.motif}
            onChange={e => maj({ motif: e.target.value })}
            placeholder="Consigné au procès-verbal"
          />
        </div>
      </div>

      {brouillon.decision === 'modifier' && (
        <label className="switch-row">
          <input
            type="checkbox"
            checked={brouillon.changementSousSysteme}
            onChange={e => maj({ changementSousSysteme: e.target.checked })}
          />
          <span>
            <b>Changement de sous-système</b>
            <span>
              Seulement si l’enseignant maîtrise la langue d’enseignement du sous-système d’accueil (preuve arrêtée par
              la DRH) et a demandé le poste ou y consent. Le serveur vérifie que le poste est vacant et que le départ
              reste dans la limite de l’excédent.
            </span>
          </span>
        </label>
      )}

      <ErreurAction erreur={erreur} />

      <div className="topbar-actions actions-formulaire">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!brouillonComplet(brouillon) || enregistrement}
          onClick={onEnregistrer}
        >
          <Gavel size={14} aria-hidden="true" /> Enregistrer la décision
        </button>
        <button type="button" className="btn" onClick={onAnnuler}>
          Annuler
        </button>
      </div>
    </Panel>
  )
}
