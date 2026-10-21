'use client'

/**
 * Validation du jeu comme référence des projections : contrôles effectués par
 * le serveur et passage du statut « brouillon » à « validé ».
 */

import { useState } from 'react'
import { BadgeCheck, CircleAlert, Check } from 'lucide-react'

import { useUtilisateur } from '@components/acces'

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
  const utilisateur = useUtilisateur()
  const [motifReserve, setMotifReserve] = useState('')

  if (!validation.data) return <EtatRequetes requetes={[validation]} />

  const v = validation.data
  const bloques = v.controles.filter(c => c.bloquant && !c.ok)
  // Les contrôles dérogeables ne bloquent que la validation normale : la DRH peut valider avec réserve, en motivant.
  const structurels = bloques.filter(c => !c.derogeable)
  const derogeables = bloques.filter(c => c.derogeable)
  const peutDeroger = utilisateur?.role === 'drh' && structurels.length === 0 && derogeables.length > 0
  const valide = v.statut === 'valide'

  return (
    <Panel
      kicker="Données de référence"
      title="Statut du jeu de données"
      hint="Un jeu validé sert de référence aux projections sur cinq ans. Les contrôles bloquants doivent être satisfaits avant la validation."
    >
      <p className="pastilles">
        <Pill tone={valide ? (v.reserve ? 'warn' : 'ok') : 'neutral'}>
          {valide && v.reserve ? 'Validé avec réserve DRH' : LIBELLE_STATUT_JEU[v.statut]}
        </Pill>
        {valide && v.valideLe && (
          <span className="hint">
            {' '}
            Validé le {new Date(v.valideLe).toLocaleString('fr-FR')}
            {v.validePar ? ` par ${v.validePar}` : ''}.
          </span>
        )}
      </p>

      {valide && v.reserve && (
        <Notice tone="warn" title="Validé avec réserve DRH.">
          Motif : {v.reserve.motif} (par {v.reserve.auteur}, le {new Date(v.reserve.le).toLocaleString('fr-FR')}).{' '}
          Contrôle(s) en réserve : {v.reserve.controles.map(c => c.libelle).join(' ; ')}. Cette réserve figure dans les
          rapports. Les calculs partent des effectifs déclarés.
        </Notice>
      )}

      <ul className="check-list">
        {v.controles.map(c => (
          <li key={c.code} className={c.ok ? 'check-ok' : 'check-alert'}>
            {c.ok ? <Check size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}
            <span>
              <strong className="texte-fort">{c.libelle}</strong>{' '}
              {c.bloquant && !c.ok && <Pill tone="alert">Bloquant</Pill>}
              {c.bloquant && !c.ok && c.derogeable && <Pill tone="warn">Dérogeable par la DRH</Pill>}
              <span className="hint bloc">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      {!valide && (
        <>
          {structurels.length > 0 && (
            <Notice tone="alert" title="Validation impossible.">
              {structurels.length} incohérence(s) structurelle(s) à corriger, par une actualisation des fichiers :
              aucune dérogation n’est possible.
            </Notice>
          )}
          {structurels.length === 0 && derogeables.length > 0 && (
            <Notice tone="warn" title="Écarts d’effectif à réconcilier — ou à valider avec réserve.">
              {peutDeroger
                ? 'Vous pouvez valider avec réserve DRH : un motif est obligatoire, il est tracé et repris dans les rapports. Les calculs partent des effectifs déclarés.'
                : 'Seule la DRH peut valider avec réserve. Sinon, corrigez les données par une actualisation des fichiers.'}
            </Notice>
          )}
          {peutDeroger && (
            <div className="field">
              <label htmlFor="reserve-motif">Motif de la réserve (obligatoire)</label>
              <textarea
                id="reserve-motif"
                rows={3}
                maxLength={400}
                value={motifReserve}
                onChange={e => setMotifReserve(e.target.value)}
                placeholder="Ex. : liste nominative de la région en cours de mise à jour"
              />
            </div>
          )}
          <div className="param-grid">
            <ChampAuteur auteur={auteur} onChange={setAuteur} />
          </div>
          <ErreurAction erreur={valider.error} />
          <div className="topbar-actions actions-formulaire">
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                structurels.length > 0 ||
                (derogeables.length > 0 && (!peutDeroger || motifReserve.trim() === '')) ||
                auteur.trim() === '' ||
                valider.isPending
              }
              onClick={() =>
                valider.mutate(
                  derogeables.length > 0
                    ? { auteur: auteur.trim(), reserve: motifReserve.trim() }
                    : { auteur: auteur.trim() },
                )
              }
            >
              <BadgeCheck size={14} aria-hidden="true" />{' '}
              {derogeables.length > 0 ? 'Valider avec réserve DRH' : 'Valider ce jeu comme référence'}
            </button>
          </div>
        </>
      )}
    </Panel>
  )
}
