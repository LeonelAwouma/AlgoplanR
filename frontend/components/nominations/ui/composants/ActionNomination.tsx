'use client'

/**
 * Formulaire d'une action sur une nomination : la saisie demandée dépend de
 * l'action (référence de la décision, motif, ou date d'effet et acte), et sa
 * conséquence est rappelée avant confirmation.
 */

import { useState } from 'react'

import type { IdJeu, Nomination } from '@shared/api'
import { Notice, Panel } from '@shared/ui/commun'
import { ChampAuteur, useAuteur } from '@shared/ui/ChampAuteur'
import { ErreurAction } from '@shared/ui/etats'

import {
  useAnnulerNomination,
  useMettreEnOeuvreNomination,
  useRejeterNomination,
  useValiderNomination,
} from '../../application/hooks'
import {
  CONSEQUENCE_ACTION,
  LIBELLE_ACTION,
  SAISIE_ACTION,
  type ActionNomination as Action,
} from '../../domain/cycleDeVie'

export interface ProprietesActionNomination {
  jeu: IdJeu
  nomination: Nomination
  action: Action
  onTermine: () => void
  onAnnuler: () => void
}

/** Date du jour au format ISO (AAAA-MM-JJ), valeur par défaut de la date d'effet. */
function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Panneau de confirmation d'une action. */
export function ActionNomination({ jeu, nomination, action, onTermine, onAnnuler }: ProprietesActionNomination) {
  const valider = useValiderNomination(jeu)
  const rejeter = useRejeterNomination(jeu)
  const mettreEnOeuvre = useMettreEnOeuvreNomination(jeu)
  const annuler = useAnnulerNomination(jeu)
  const [auteur, setAuteur] = useAuteur()
  const [texte, setTexte] = useState('')
  const [dateEffet, setDateEffet] = useState(aujourdhui)

  const saisie = SAISIE_ACTION[action]
  const mutation = { valider, rejeter, 'mettre-en-oeuvre': mettreEnOeuvre, annuler }[action]
  const pret = auteur.trim() !== '' && texte.trim() !== '' && (saisie !== 'acte' || dateEffet !== '')

  function confirmer() {
    const ref = nomination.id
    const signature = { auteur: auteur.trim() }
    const options = { onSuccess: onTermine }
    switch (action) {
      case 'valider':
        valider.mutate({ nomination: ref, corps: { reference: texte.trim(), ...signature } }, options)
        break
      case 'rejeter':
        rejeter.mutate({ nomination: ref, corps: { motif: texte.trim(), ...signature } }, options)
        break
      case 'annuler':
        annuler.mutate({ nomination: ref, corps: { motif: texte.trim(), ...signature } }, options)
        break
      case 'mettre-en-oeuvre':
        mettreEnOeuvre.mutate(
          { nomination: ref, corps: { dateEffet, referenceActe: texte.trim(), ...signature } },
          options,
        )
        break
    }
  }

  const libelleTexte =
    saisie === 'reference'
      ? 'Référence de la décision'
      : saisie === 'acte'
        ? 'Référence de l’acte (arrêté, décision)'
        : 'Motif'

  return (
    <Panel
      kicker={LIBELLE_ACTION[action]}
      title={`${nomination.personne.nom} ${nomination.personne.prenom} → ${nomination.poste.nomEtab}`.trim()}
    >
      <Notice tone="warn">{CONSEQUENCE_ACTION[action]}</Notice>
      <div className="param-grid">
        <div className="field field-recherche">
          <label htmlFor="na-texte">{libelleTexte}</label>
          <input id="na-texte" type="text" value={texte} onChange={e => setTexte(e.target.value)} />
        </div>
        {saisie === 'acte' && (
          <div className="field">
            <label htmlFor="na-date">Date d’effet</label>
            <input id="na-date" type="date" value={dateEffet} onChange={e => setDateEffet(e.target.value)} />
          </div>
        )}
        <ChampAuteur auteur={auteur} onChange={setAuteur} />
      </div>
      <ErreurAction erreur={mutation.error} />
      <div className="topbar-actions actions-formulaire">
        <button type="button" className="btn btn-primary" disabled={!pret || mutation.isPending} onClick={confirmer}>
          {LIBELLE_ACTION[action]}
        </button>
        <button type="button" className="btn" onClick={onAnnuler}>
          Revenir
        </button>
      </div>
    </Panel>
  )
}
