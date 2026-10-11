'use client'

/**
 * Validation du jeu comme référence des projections : contrôles effectués par
 * le serveur et passage du statut « brouillon » à « validé ».
 */

import { BadgeCheck, CircleAlert, Check } from 'lucide-react'

import type { IdJeu } from '@shared/api'
import { LIBELLE_STATUT_JEU } from '@shared/kernel'
import { Notice, Panel, Pill } from '@shared/ui/commun'
import { ChampAuteur, useAuteur } from '@shared/ui/ChampAuteur'
import { EtatRequetes, ErreurAction } from '@shared/ui/etats'

import { useValidation, useValiderJeu } from '../../application/hooks'

/** Panneau « Statut du jeu ». */
export function StatutValidation({ jeu }: { jeu: IdJeu }) {
  const validation = useValidation(jeu)
  const valider = useValiderJeu(jeu)
  const [auteur, setAuteur] = useAuteur()

  if (!validation.data) return <EtatRequetes requetes={[validation]} />

  const v = validation.data
  const bloques = v.controles.filter(c => c.bloquant && !c.ok)
  const valide = v.statut === 'valide'

  return (
    <Panel
      kicker="Données de référence"
      title="Statut du jeu de données"
      hint="Un jeu validé sert de référence aux projections sur cinq ans. Les contrôles bloquants doivent être satisfaits avant la validation."
    >
      <p className="pastilles">
        <Pill tone={valide ? 'ok' : 'neutral'}>{LIBELLE_STATUT_JEU[v.statut]}</Pill>
        {valide && v.valideLe && (
          <span className="hint">
            {' '}
            Validé le {new Date(v.valideLe).toLocaleString('fr-FR')}
            {v.validePar ? ` par ${v.validePar}` : ''}.
          </span>
        )}
      </p>

      <ul className="check-list">
        {v.controles.map(c => (
          <li key={c.code} className={c.ok ? 'check-ok' : 'check-alert'}>
            {c.ok ? <Check size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}
            <span>
              <strong className="texte-fort">{c.libelle}</strong>{' '}
              {c.bloquant && !c.ok && <Pill tone="alert">Bloquant</Pill>}
              <span className="hint bloc">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      {!valide && (
        <>
          {bloques.length > 0 && (
            <Notice tone="alert" title="Validation impossible.">
              {bloques.length} contrôle(s) bloquant(s) à corriger, par une actualisation des fichiers.
            </Notice>
          )}
          <div className="param-grid">
            <ChampAuteur auteur={auteur} onChange={setAuteur} />
          </div>
          <ErreurAction erreur={valider.error} />
          <div className="topbar-actions actions-formulaire">
            <button
              type="button"
              className="btn btn-primary"
              disabled={bloques.length > 0 || auteur.trim() === '' || valider.isPending}
              onClick={() => valider.mutate(auteur.trim())}
            >
              <BadgeCheck size={14} aria-hidden="true" /> Valider ce jeu comme référence
            </button>
          </div>
        </>
      )}
    </Panel>
  )
}
