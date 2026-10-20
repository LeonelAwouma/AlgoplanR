'use client'

/**
 * Menu proposé une fois les bases des écoles et des enseignants chargées : le DRH joint-il un fichier de faits du
 * prince ? Ces décisions passent avant l'algorithme, qui calcule ensuite normalement tout le reste.
 */

import { Crown } from 'lucide-react'

import type { FichierImporte } from '@shared/api'
import { Panel } from '@shared/ui/commun'

import { CarteFichier } from './CarteFichier'

export interface ProprietesChoixFaitsPrince {
  /** `null` tant que l'utilisateur n'a pas répondu. */
  souhaite: boolean | null
  onChoix: (souhaite: boolean) => void
  fichier: FichierImporte | null
  erreur: string | null
  enLecture: boolean
  desactive: boolean
  onFichier: (fichier: File) => void
}

/** Panneau « Fait du prince » de la page d'import. */
export function ChoixFaitsPrince({
  souhaite,
  onChoix,
  fichier,
  erreur,
  enLecture,
  desactive,
  onFichier,
}: ProprietesChoixFaitsPrince) {
  return (
    <Panel
      kicker="Fait du prince"
      title="Importer le fichier des faits du prince ?"
      hint="Les affectations décidées par l’autorité sont prioritaires sur l’algorithme : elles sont appliquées en premier, puis l’algorithme calcule normalement les autres affectations sur ce qui reste."
    >
      <div className="topbar-actions" role="group" aria-label="Fichier des faits du prince">
        <button
          type="button"
          className={souhaite === true ? 'btn btn-primary' : 'btn'}
          aria-pressed={souhaite === true}
          disabled={desactive}
          onClick={() => onChoix(true)}
        >
          <Crown size={15} aria-hidden="true" /> Oui, importer le fichier
        </button>
        <button
          type="button"
          className={souhaite === false ? 'btn btn-primary' : 'btn'}
          aria-pressed={souhaite === false}
          disabled={desactive}
          onClick={() => onChoix(false)}
        >
          Non, l’algorithme seul
        </button>
      </div>
      {souhaite === true && (
        <div className="upload-cards">
          <CarteFichier
            type="prince"
            fichier={fichier}
            erreur={erreur}
            enLecture={enLecture}
            desactive={desactive}
            onFichier={onFichier}
          />
        </div>
      )}
    </Panel>
  )
}
