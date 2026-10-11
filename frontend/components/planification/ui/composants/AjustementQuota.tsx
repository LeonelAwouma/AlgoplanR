'use client'

/**
 * Ajustement administratif d'un quota : valeur retenue et motif obligatoire.
 * L'écart avec le quota calculé reste visible dans le tableau et l'historique.
 */

import { useState } from 'react'
import { Save } from 'lucide-react'

import type { QuotaRecrutement } from '@shared/api'
import { LIBELLE_SOUS_SYSTEME } from '@shared/kernel'
import { Panel, fmt } from '@shared/ui/commun'
import { ErreurAction } from '@shared/ui/etats'

export interface ProprietesAjustementQuota {
  quota: QuotaRecrutement
  enCours: boolean
  erreur: unknown
  /** Le nom de l'agent n'est pas saisi : l'ajustement ne peut pas être signé. */
  auteurManquant: boolean
  onAjuster: (retenu: number, motif: string) => void
  onFermer: () => void
}

/** Panneau « Ajuster un quota ». */
export function AjustementQuota({
  quota,
  enCours,
  erreur,
  auteurManquant,
  onAjuster,
  onFermer,
}: ProprietesAjustementQuota) {
  const [retenu, setRetenu] = useState(quota.retenu)
  const [motif, setMotif] = useState(quota.motifAjustement ?? '')

  return (
    <Panel
      kicker={`Ajustement — ${quota.annee}`}
      title={`${quota.territoire} · ${LIBELLE_SOUS_SYSTEME[quota.sousSysteme]}`}
      hint={`Quota calculé : ${fmt(quota.calcule)}. Un quota retenu différent doit être motivé.`}
    >
      <div className="param-grid">
        <div className="field">
          <label htmlFor="qu-retenu">Quota retenu</label>
          <input
            id="qu-retenu"
            type="number"
            min={0}
            value={retenu}
            onChange={e => setRetenu(Number(e.target.value))}
          />
        </div>
        <div className="field field-recherche">
          <label htmlFor="qu-motif">Motif de l’ajustement</label>
          <input
            id="qu-motif"
            type="text"
            value={motif}
            onChange={e => setMotif(e.target.value)}
            placeholder="Arbitrage budgétaire, capacité de formation…"
          />
        </div>
      </div>
      <ErreurAction erreur={erreur} />
      {auteurManquant && <p className="hint">Indiquez qui prend la décision, dans le champ « Décision prise par ».</p>}
      <div className="topbar-actions actions-formulaire">
        <button
          type="button"
          className="btn btn-primary"
          disabled={enCours || auteurManquant || motif.trim() === '' || retenu < 0}
          onClick={() => onAjuster(retenu, motif.trim())}
        >
          <Save size={14} aria-hidden="true" /> Enregistrer l’ajustement
        </button>
        <button type="button" className="btn" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </Panel>
  )
}
