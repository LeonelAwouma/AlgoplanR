'use client'

/**
 * Formulaire d'un nouveau fait du Prince : enseignant, école de destination,
 * référence de la décision. Les conséquences prévisibles sont demandées au
 * serveur dès que l'enseignant et l'école sont désignés, avant validation.
 */

import { useState } from 'react'
import { Crown } from 'lucide-react'

import { messageErreur, type CorpsFaitPrince, type IdJeu } from '@shared/api'
import { Notice, Panel } from '@shared/ui/commun'

import { useEnregistrerFaitPrince, useImpactFaitPrince } from '../../application/hooks'
import { useDesignationEcole, useDesignationEnseignant } from '../useDesignation'
import { ChampEcole } from './ChampEcole'
import { ChampEnseignant } from './ChampEnseignant'
import { ImpactFaitPrince } from './ImpactFaitPrince'

export interface ProprietesSaisieFaitPrince {
  jeu: IdJeu
  /** Message de confirmation, affiché par la page après l'enregistrement. */
  onEnregistre: (message: string) => void
}

/** Panneau « Redéployer un enseignant ». */
export function SaisieFaitPrince({ jeu, onEnregistre }: ProprietesSaisieFaitPrince) {
  const [saisieEnseignant, setSaisieEnseignant] = useState('')
  const [homonymeChoisi, setHomonymeChoisi] = useState('')
  const [saisieEcole, setSaisieEcole] = useState('')
  const [reference, setReference] = useState('')

  const designationEnseignant = useDesignationEnseignant(jeu, saisieEnseignant, homonymeChoisi)
  const designationEcole = useDesignationEcole(jeu, saisieEcole)
  const enseignant = designationEnseignant.designe
  const destination = designationEcole.designe

  const corps: CorpsFaitPrince | null =
    enseignant && destination && !enseignant.faitPrinceId
      ? { matricule: enseignant.id, ecoleDestination: destination.school.id, reference }
      : null

  // La référence ne change pas l'impact : elle n'entre pas dans la demande d'aperçu.
  const impact = useImpactFaitPrince(jeu, corps ? { ...corps, reference: '' } : null)
  const enregistrement = useEnregistrerFaitPrince(jeu)

  function effacer() {
    setSaisieEnseignant('')
    setHomonymeChoisi('')
    setSaisieEcole('')
    setReference('')
    enregistrement.reset()
  }

  function enregistrer() {
    if (!corps || !enseignant || !destination) return
    enregistrement.mutate(corps, {
      onSuccess: () => {
        onEnregistre(
          `${enseignant.nom} ${enseignant.prenom} est désormais rattaché à ${destination.school.nom}. Le diagnostic et les simulations ont été recalculés.`,
        )
        effacer()
      },
    })
  }

  return (
    <Panel
      kicker="Nouvelle décision"
      title="Redéployer un enseignant"
      hint="Saisissez le nom de l’enseignant et celui de l’école où le déployer. Les suggestions apparaissent pendant la frappe ; les conséquences sont affichées avant validation."
    >
      <div className="grid-2 prince-saisie">
        <ChampEnseignant
          saisie={saisieEnseignant}
          onSaisie={valeur => {
            setSaisieEnseignant(valeur)
            setHomonymeChoisi('')
          }}
          onChoixHomonyme={setHomonymeChoisi}
          designation={designationEnseignant}
        />
        <ChampEcole saisie={saisieEcole} onSaisie={setSaisieEcole} designation={designationEcole} />
      </div>

      <div className="field champ-reference">
        <label htmlFor="prince-ref">Référence de la décision (facultatif)</label>
        <input
          id="prince-ref"
          type="text"
          value={reference}
          onChange={e => setReference(e.target.value)}
          placeholder="Note de service, courrier, numéro de décision…"
        />
      </div>

      {impact.data && <ImpactFaitPrince impact={impact.data} />}

      {enregistrement.error && (
        <Notice tone="alert" title="Décision impossible.">
          {messageErreur(enregistrement.error)}
        </Notice>
      )}

      <div className="topbar-actions actions-formulaire">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!corps || enregistrement.isPending}
          onClick={enregistrer}
        >
          <Crown size={15} aria-hidden="true" /> Enregistrer ce redéploiement
        </button>
        {(saisieEnseignant || saisieEcole || reference) && (
          <button type="button" className="btn" onClick={effacer}>
            Effacer la saisie
          </button>
        )}
      </div>
    </Panel>
  )
}
