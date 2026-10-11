'use client'

/**
 * Barre d'enregistrement des règles, visible dès qu'une modification n'est pas
 * enregistrée. L'enregistrement relance les calculs sur le serveur.
 */

import { RefreshCw, Save, Undo2 } from 'lucide-react'

import { Notice } from '@shared/ui/commun'
import { ErreurAction } from '@shared/ui/etats'

export interface ProprietesBarreEnregistrement {
  modifie: boolean
  enCours: boolean
  erreur: unknown
  onEnregistrer: () => void
  onAnnuler: () => void
}

/** Barre « Modifications non enregistrées ». */
export function BarreEnregistrement({
  modifie,
  enCours,
  erreur,
  onEnregistrer,
  onAnnuler,
}: ProprietesBarreEnregistrement) {
  if (!modifie && !erreur) return null
  return (
    <div className="barre-enregistrement" role="region" aria-label="Enregistrement des règles">
      <ErreurAction erreur={erreur} />
      {modifie && (
        <Notice tone="warn" title="Modifications non enregistrées.">
          Enregistrez-les pour que le diagnostic, les scénarios et la planification soient recalculés avec ces règles.
        </Notice>
      )}
      <div className="topbar-actions">
        <button type="button" className="btn btn-primary" disabled={!modifie || enCours} onClick={onEnregistrer}>
          {enCours ? (
            <RefreshCw size={14} className="spin" aria-hidden="true" />
          ) : (
            <Save size={14} aria-hidden="true" />
          )}{' '}
          Enregistrer les règles
        </button>
        <button type="button" className="btn" disabled={!modifie || enCours} onClick={onAnnuler}>
          <Undo2 size={14} aria-hidden="true" /> Annuler les modifications
        </button>
      </div>
    </div>
  )
}
