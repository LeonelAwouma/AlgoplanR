'use client'

/**
 * Première activation d'un poste régional : le délégué confirme la région que
 * l'administration lui a attribuée. Le serveur verrouille ensuite ce choix ;
 * seule une réaffectation signée par l'administration peut le changer.
 */

import { useState } from 'react'
import { MapPin, RefreshCw } from 'lucide-react'

import { messageErreur } from '../../shared/api'
import { Notice } from '../../shared/ui/commun'
import { useConfirmerRegion } from '../application/hooks'
import type { CompteServeur, ReponseSession } from '../domain/types'
import { CadreAcces } from './CadreAcces'

export function EcranConfirmationRegion({
  compte,
  onConfirme,
  onAbandon,
}: {
  compte: CompteServeur
  onConfirme: (reponse: ReponseSession) => void
  onAbandon: () => void
}) {
  const [accord, setAccord] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const region = compte.region ?? ''
  const confirmation = useConfirmerRegion()

  async function confirmer() {
    setEnCours(true)
    setErreur(null)
    try {
      onConfirme(await confirmation.mutateAsync(region))
    } catch (err) {
      setErreur(messageErreur(err))
      setEnCours(false)
    }
  }

  return (
    <CadreAcces>
      <div className="login-form">
        <h1>Confirmez votre région</h1>
        <div className="login-region">
          <MapPin size={22} aria-hidden="true" />
          <div>
            <span>Région attribuée à votre compte</span>
            <strong>{region}</strong>
          </div>
        </div>
        <p className="hint">
          Vous ne pourrez consulter, importer, exporter et modifier que les données de cette région. Une fois confirmé,
          ce choix est verrouillé : un changement de région passe par une procédure de l’administration.
        </p>
        <label className="login-accord">
          <input type="checkbox" checked={accord} onChange={e => setAccord(e.target.checked)} disabled={enCours} />
          <span>Je confirme être le délégué régional de la région {region}.</span>
        </label>
        {erreur && <Notice tone="alert">{erreur}</Notice>}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!accord || enCours}
          onClick={() => void confirmer()}
        >
          {enCours && <RefreshCw size={15} className="spin" aria-hidden="true" />}
          Confirmer la région {region}
        </button>
        <button type="button" className="btn-link" onClick={onAbandon} disabled={enCours}>
          Ce n’est pas ma région : se déconnecter
        </button>
      </div>
    </CadreAcces>
  )
}
