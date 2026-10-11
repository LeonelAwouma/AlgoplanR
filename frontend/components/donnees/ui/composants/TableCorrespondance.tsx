'use client'

/**
 * Correspondance des colonnes d'un classeur : l'utilisateur confirme ou corrige
 * les rapprochements du serveur. Chaque correction est envoyée au serveur, qui
 * renvoie la table à jour.
 */

import { useState } from 'react'
import { AlertTriangle, FileSpreadsheet } from 'lucide-react'

import type { FichierImporte } from '@shared/api'
import { Notice, Panel, Pill } from '@shared/ui/commun'

import { SEUIL_CONFIRMATION, colonnesAConfirmer } from '../../domain/correspondances'

export interface ProprietesTableCorrespondance {
  fichier: FichierImporte
  /** Vrai pendant l'envoi d'une correction : les listes sont figées. */
  enregistrement: boolean
  onChange: (champ: string, enTete: string | null) => void
}

/** Table des rapprochements d'un fichier, réduite par défaut aux points à vérifier. */
export function TableCorrespondance({ fichier, enregistrement, onChange }: ProprietesTableCorrespondance) {
  const [toutAfficher, setToutAfficher] = useState(false)
  const { matches, enTetes, enTetesInconnus } = fichier.correspondances
  const aConfirmer = colonnesAConfirmer(fichier.correspondances)
  const manquants = matches.filter(m => m.enTete === null)
  const visibles = toutAfficher ? matches : [...aConfirmer, ...manquants]

  return (
    <Panel
      kicker={fichier.type === 'etablissements' ? 'Établissements' : 'Enseignants'}
      title={fichier.nomFichier}
      hint={
        visibles.length === 0
          ? 'Toutes les colonnes attendues ont été reconnues avec certitude.'
          : 'Vérifiez les rapprochements ci-dessous, puis corrigez-les si nécessaire.'
      }
      actions={
        <button type="button" className="btn btn-sm" onClick={() => setToutAfficher(v => !v)}>
          {toutAfficher ? 'Afficher seulement les points à vérifier' : 'Afficher toutes les colonnes'}
        </button>
      }
    >
      {aConfirmer.length > 0 && (
        <Notice tone="warn" title="Rapprochements à confirmer.">
          {aConfirmer.length} colonne(s) ont été rapprochées par ressemblance et méritent une vérification humaine.
        </Notice>
      )}

      <div className="mapping-liste">
        {visibles.length === 0 && <p className="hint">Rien à corriger dans ce fichier.</p>}
        {visibles.map(m => {
          const idChamp = `map-${fichier.type}-${m.champ}`
          return (
            <div className="mapping-row" key={m.champ}>
              <div>
                <strong className="mapping-libelle">{m.label}</strong>
                {m.requis && (
                  <Pill tone={m.enTete ? 'neutral' : 'alert'}>{m.enTete ? 'Requis' : 'Requis — manquant'}</Pill>
                )}
              </div>
              <div>
                <label className="sr-only" htmlFor={idChamp}>
                  Colonne du fichier correspondant à « {m.label} »
                </label>
                <select
                  id={idChamp}
                  value={m.enTete ?? ''}
                  disabled={enregistrement}
                  onChange={e => onChange(m.champ, e.target.value || null)}
                >
                  <option value="">— Aucune colonne —</option>
                  {enTetes
                    .filter(h => h !== '')
                    .map(h => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                {m.enTete === null ? (
                  <Pill tone={m.requis ? 'alert' : 'warn'}>Non trouvée</Pill>
                ) : m.confiance >= SEUIL_CONFIRMATION ? (
                  <Pill tone="ok">Reconnue</Pill>
                ) : (
                  <Pill tone="warn">
                    <AlertTriangle size={11} aria-hidden="true" /> À confirmer
                  </Pill>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <details className="advanced">
        <summary>Détail technique — noms de colonnes et méthode de reconnaissance</summary>
        <div className="table-scroll table-scroll-court">
          <table className="data">
            <thead>
              <tr>
                <th>Champ interne</th>
                <th>En-tête retenu</th>
                <th>Méthode</th>
                <th className="num">Confiance</th>
              </tr>
            </thead>
            <tbody>
              {matches.map(m => (
                <tr key={m.champ}>
                  <td className="mono">{m.champ}</td>
                  <td>{m.enTete ?? '—'}</td>
                  <td>{m.methode}</td>
                  <td className="num">{m.confiance === 0 ? '—' : m.confiance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {enTetesInconnus.length > 0 && (
          <p className="hint">
            <FileSpreadsheet size={14} aria-hidden="true" /> Colonnes du fichier non utilisées :{' '}
            <span className="mono">{enTetesInconnus.join(', ')}</span>
          </p>
        )}
      </details>
    </Panel>
  )
}
