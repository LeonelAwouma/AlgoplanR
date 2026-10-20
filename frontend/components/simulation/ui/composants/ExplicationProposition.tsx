'use client'

/**
 * « Pourquoi cette proposition ? » (§15) : nature du mouvement, composantes du
 * score réellement utilisées et explication rédigée par le serveur.
 */

import { X } from 'lucide-react'

import type { IdJeu, ProposedAssignment } from '@shared/api'
import { LIBELLE_NATURE, LIBELLE_PROXIMITE } from '@shared/kernel'
import { Notice, Panel } from '@shared/ui/commun'
import { TableauCalcul } from '@shared/ui/TableauCalcul'

import { useExplication } from '../../application/hooks'
import { EXPLICATION_NATURE, libelleTotalScore } from '../../domain/explications'

const fmtScore = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

export interface ProprietesExplicationProposition {
  jeu: IdJeu
  scenario: string
  proposition: ProposedAssignment
  onFermer: () => void
}

/** Panneau d'explication d'une proposition. */
export function ExplicationProposition({ jeu, scenario, proposition: a, onFermer }: ProprietesExplicationProposition) {
  const explication = useExplication(jeu, scenario, a.teacherId)

  return (
    <Panel
      kicker="Explication"
      title="Pourquoi cette proposition ?"
      actions={
        <button type="button" className="btn btn-sm" onClick={onFermer}>
          <X size={13} aria-hidden="true" /> Fermer
        </button>
      }
    >
      <p className="titre-proposition">
        {a.nomEns} {a.prenomEns}
      </p>
      <p className="hint">
        {a.nomEtabOrigine} ({a.communeOrigine}) → {a.nomEtabDestination} ({a.communeDestination}) ·{' '}
        {LIBELLE_PROXIMITE[a.niveauProximite]} · {LIBELLE_NATURE[a.nature]}
        {a.rangVoeu != null ? ` (vœu ${a.rangVoeu})` : ''}
      </p>
      <p>{EXPLICATION_NATURE[a.nature]}</p>

      {explication.data && explication.data.lignes.length > 0 && (
        <ul className="reason-list">
          {explication.data.lignes.map(ligne => (
            <li key={ligne}>
              <span>{ligne}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="titre-section">Score d’appariement : pourquoi {fmtScore(a.breakdown.total)}</h3>
      <TableauCalcul
        breakdown={a.breakdown}
        enteteComposante="Composante réellement utilisée dans le calcul"
        libelleTotal={libelleTotalScore(a.nature)}
        legende="Calcul du score d’appariement"
      />

      {explication.data && (
        <>
          <h3 className="titre-section">Z1 · Barème individuel : pourquoi {fmtScore(explication.data.bareme.total)}</h3>
          <TableauCalcul
            breakdown={explication.data.bareme}
            enteteComposante="Critère du barème"
            libelleTotal="Barème individuel (C1 + C2 + C3 + C4 + C5)"
            legende="Calcul du barème individuel"
          />
          <p className="hint">
            Le barème individuel ({fmtScore(explication.data.bareme.total)}) est la valeur de Z1 dans le score
            d’appariement. Les poids se règlent dans « Configuration du moteur ».
          </p>
        </>
      )}

      <Notice tone="warn" title="Statut de cette proposition.">
        Cette proposition provient d’une simulation et nécessite une validation administrative.
      </Notice>
    </Panel>
  )
}
