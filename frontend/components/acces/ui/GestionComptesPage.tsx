'use client'

/**
 * Comptes et accès — page réservée au DRH (le serveur refuse ces routes à tout
 * autre compte).
 *
 * Postes autonomes : chaque délégué active son propre poste avec un code remis
 * par le DRH (section « Codes d'accès des délégués »). Les comptes de délégués
 * présents sur ce poste, s'il y en a, peuvent recevoir ici un mot de passe temporaire.
 * Rôles et régions ne changent que par un fichier signé de l'administration.
 */

import { useState } from 'react'
import { Copy, KeyRound } from 'lucide-react'

import { messageErreur } from '../../shared/api'
import { Notice, Panel, Pill, type Tone } from '../../shared/ui/commun'
import { useActionCompte, useComptes, type ActionCompte } from '../application/hooks'
import type { CompteServeur, EtatCompte } from '../domain/types'
import { CodesDelegues } from './CodesDelegues'

const ETAT: Record<EtatCompte, { libelle: string; ton: Tone }> = {
  ACTIF: { libelle: 'Actif', ton: 'ok' },
  SUSPENDU: { libelle: 'Suspendu', ton: 'warn' },
  REVOQUE: { libelle: 'Révoqué', ton: 'alert' },
}

export function GestionComptesPage() {
  const comptes = useComptes()
  const action = useActionCompte()
  const [temporaire, setTemporaire] = useState<{ identifiant: string; valeur: string } | null>(null)
  const [copie, setCopie] = useState(false)

  function agir(type: ActionCompte, compte: CompteServeur) {
    action.mutate(
      { action: type, compte },
      {
        onSuccess: r => {
          if (r.temporaire) {
            setCopie(false)
            setTemporaire({ identifiant: compte.identifiant, valeur: r.temporaire })
          }
        },
      },
    )
  }

  const delegues = (comptes.data ?? []).filter(c => c.role === 'DELEGUE')
  const drh = (comptes.data ?? []).filter(c => c.role === 'DRH')

  return (
    <div className="stack">
      <CodesDelegues />

      {temporaire && (
        <div className="acces-code-cree" role="status">
          <p>
            Mot de passe temporaire de <strong>{temporaire.identifiant}</strong>, à transmettre au délégué. Il ne sera
            plus affiché ; le délégué devra le changer à sa prochaine connexion.
          </p>
          <code className="acces-code">{temporaire.valeur}</code>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void navigator.clipboard?.writeText(temporaire.valeur).then(() => setCopie(true))}
          >
            <Copy size={13} aria-hidden="true" /> {copie ? 'Copié' : 'Copier'}
          </button>
        </div>
      )}
      {action.error && <Notice tone="alert">{messageErreur(action.error)}</Notice>}
      {comptes.error && <Notice tone="alert">{messageErreur(comptes.error)}</Notice>}

      {delegues.length > 0 && (
        <Panel
          kicker="Accès"
          title="Comptes de délégués sur ce poste"
          hint="Un compte par région ; la région est verrouillée après confirmation."
        >
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Région</th>
                  <th>Identifiant</th>
                  <th>État</th>
                  <th>Mot de passe</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {delegues.map(c => (
                  <tr key={c.identifiant}>
                    <td>
                      <strong>{c.region}</strong>
                    </td>
                    <td className="mono">{c.identifiant}</td>
                    <td>
                      <Pill tone={ETAT[c.etat].ton}>{ETAT[c.etat].libelle}</Pill>
                    </td>
                    <td>{c.doit_changer_mot_de_passe ? <Pill tone="warn">Temporaire</Pill> : 'Personnel'}</td>
                    <td>
                      <div className="acces-actions">
                        {c.etat !== 'REVOQUE' && (
                          <button
                            type="button"
                            className="row-action"
                            disabled={action.isPending}
                            onClick={() => {
                              if (window.confirm(`Remettre un mot de passe temporaire à ${c.identifiant} ?`)) {
                                agir('reinitialiser', c)
                              }
                            }}
                          >
                            <KeyRound size={13} aria-hidden="true" /> Mot de passe temporaire
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {drh.length > 0 && <p className="hint">Compte national : {drh.map(c => c.identifiant).join(', ')}.</p>}
    </div>
  )
}
