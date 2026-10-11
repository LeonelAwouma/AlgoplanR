'use client'

/**
 * « Pourquoi cette proposition ? » (§15) : nature du mouvement, composantes du
 * score réellement utilisées et explication rédigée par le serveur.
 */

import { X } from 'lucide-react'

import type { IdJeu, ProposedAssignment } from '@shared/api'
import { LIBELLE_NATURE, LIBELLE_PROXIMITE } from '@shared/kernel'
import { Notice, Panel } from '@shared/ui/commun'

import { useExplication } from '../../application/hooks'
import { EXPLICATION_NATURE, libelleTotalScore } from '../../domain/explications'

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

      <table className="compare-table">
        <thead>
          <tr>
            <th>Composante réellement utilisée dans le calcul</th>
            <th className="num">Valeur</th>
            <th className="num">Poids</th>
            <th className="num">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {a.breakdown.components.map((c, i) => (
            <tr key={`${c.label}-${i}`}>
              <th scope="row" className="th-normal">
                {c.label}
              </th>
              <td className="num">{c.valeur.toLocaleString('fr-FR')}</td>
              <td className="num">{c.poids}</td>
              <td className="num">{c.contribution.toLocaleString('fr-FR')}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">{libelleTotalScore(a.nature)}</th>
            <td className="num" colSpan={3}>
              <strong>{a.breakdown.total.toLocaleString('fr-FR')}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <Notice tone="warn" title="Statut de cette proposition.">
        Cette proposition provient d’une simulation et nécessite une validation administrative.
      </Notice>
    </Panel>
  )
}
