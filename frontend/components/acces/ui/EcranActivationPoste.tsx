'use client'

/**
 * Activation d'un poste vierge. Chaque poste est autonome, hors réseau :
 *   - le DRH dépose le fichier d'activation signé remis par l'administration ;
 *   - un délégué régional choisit sa région et saisit le code d'activation remis par le DRH.
 *
 * Sans l'un ou l'autre, le poste n'a aucun compte : personne ne peut s'attribuer les droits du DRH ni ceux d'une
 * région en installant l'application. Le serveur vérifie la signature ou le code avec ce qui est embarqué dans
 * l'installation ; aucun fichier ni code n'expire.
 */

import { useState } from 'react'
import { Building2, MapPin } from 'lucide-react'

import { Notice } from '../../shared/ui/commun'
import type { EtatPoste, ReponseSession } from '../domain/types'
import { CadreAcces } from './CadreAcces'
import { FormulaireCode } from './FormulaireCode'
import { FormulaireFichier } from './FormulaireFichier'

type Choix = 'drh' | 'delegue'

export function EcranActivationPoste({
  poste,
  onActive,
  onCodeAccepte,
}: {
  poste: EtatPoste
  onActive: () => void
  onCodeAccepte: (reponse: ReponseSession, code: string) => void
}) {
  const [choix, setChoix] = useState<Choix>('delegue')

  return (
    <CadreAcces>
      <div className="login-form">
        <h1>Activation du poste</h1>
        {poste.registre === 'invalide' ? (
          <Notice tone="alert" title="Registre des accès incohérent.">
            Les comptes de ce poste ne correspondent plus à leurs activations. Aucune donnée n’a été effacée. Déposez le
            fichier de réparation remis par l’administration AlgoPlanR.
          </Notice>
        ) : (
          <p className="hint">Ce poste n’a encore aucun compte. Qui êtes-vous ?</p>
        )}
        <div className="login-tabs" role="tablist" aria-label="Profil du poste">
          <button type="button" role="tab" aria-selected={choix === 'delegue'} onClick={() => setChoix('delegue')}>
            <MapPin size={14} aria-hidden="true" /> Délégué régional
          </button>
          <button type="button" role="tab" aria-selected={choix === 'drh'} onClick={() => setChoix('drh')}>
            <Building2 size={14} aria-hidden="true" /> DRH
          </button>
        </div>
      </div>

      {choix === 'delegue' ? (
        <FormulaireCode usage="activation" onAccepte={onCodeAccepte} />
      ) : (
        <>
          <p className="hint">
            Déposez le fichier d’activation signé remis par l’administration AlgoPlanR. S’il doit être lié à ce poste,
            communiquez-lui l’identifiant du poste : <code className="mono">{poste.poste}</code>
          </p>
          <FormulaireFichier libelle="Activer le poste du DRH" onApplique={onActive} />
        </>
      )}
    </CadreAcces>
  )
}
