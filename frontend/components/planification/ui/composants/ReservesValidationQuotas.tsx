'use client'

/**
 * Réserves à reconnaître avant de figer des quotas. Valider les quotas d'une année est une décision de recrutement :
 * quand le serveur signale ce qui les rend incertains (retraites non calculables ou partielles, besoin provisoire,
 * dépassement du plafond, sens de l'année non confirmé), chaque réserve doit être reconnue explicitement, et un
 * dépassement du plafond exige la référence d'une validation administrative ou budgétaire. Les consultations et les
 * simulations ne passent pas par ici. Les textes viennent du serveur.
 */

import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'

import { ApiError, type ReserveQuotas } from '@shared/api'
import { Notice } from '@shared/ui/commun'

/** Réserves portées par un refus `validation_reserves`, ou `null` pour toute autre erreur. */
export function reservesDuRefus(erreur: unknown): { reserves: ReserveQuotas[]; referenceRequise: boolean } | null {
  if (!(erreur instanceof ApiError) || erreur.code !== 'validation_reserves') return null
  const d = erreur.details as { reserves?: ReserveQuotas[]; reference_requise?: boolean } | null
  if (!d?.reserves?.length) return null
  return { reserves: d.reserves, referenceRequise: !!d.reference_requise }
}

interface Props {
  reserves: ReserveQuotas[]
  referenceRequise: boolean
  annee: string
  enCours: boolean
  onValider: (reconnues: string[], reference: string) => void
}

export function ReservesValidationQuotas({ reserves, referenceRequise, annee, enCours, onValider }: Props) {
  const [reconnues, setReconnues] = useState<string[]>([])
  const [reference, setReference] = useState('')
  const toutesReconnues = reserves.every(r => reconnues.includes(r.code))
  const referenceManquante = referenceRequise && reference.trim() === ''

  return (
    <Notice tone="warn" title={`Réserves à reconnaître avant de valider les quotas de ${annee}.`}>
      <span className="ligne-pleine">
        La validation fige une décision de recrutement. Les résultats ci-dessous restent des simulations tant que ces
        réserves ne sont pas levées ; reconnaissez chacune pour valider.
      </span>
      <ul className="liste-reserves">
        {reserves.map(r => (
          <li key={r.code}>
            <label>
              <input
                type="checkbox"
                checked={reconnues.includes(r.code)}
                onChange={e =>
                  setReconnues(courantes =>
                    e.target.checked ? [...courantes, r.code] : courantes.filter(c => c !== r.code),
                  )
                }
              />{' '}
              <strong>{r.libelle}.</strong> {r.detail}
            </label>
          </li>
        ))}
      </ul>
      {referenceRequise && (
        <div className="field">
          <label htmlFor="quotas-reference">Référence de la validation administrative ou budgétaire</label>
          <input
            id="quotas-reference"
            type="text"
            value={reference}
            onChange={e => setReference(e.target.value)}
            aria-invalid={referenceManquante}
          />
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!toutesReconnues || referenceManquante || enCours}
        onClick={() => onValider(reconnues, reference.trim())}
      >
        <BadgeCheck size={14} aria-hidden="true" /> Valider avec les réserves reconnues
      </button>
    </Notice>
  )
}
