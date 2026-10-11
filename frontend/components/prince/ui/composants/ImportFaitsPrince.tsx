'use client'

/**
 * Import d'un lot de décisions depuis un classeur ou un fichier CSV. Le
 * serveur lit le fichier et contrôle chaque ligne comme une saisie manuelle.
 */

import { useRef } from 'react'
import { RefreshCw, Upload } from 'lucide-react'

import { messageErreur, type IdJeu } from '@shared/api'
import { Notice, Panel, fmt } from '@shared/ui/commun'

import { useImporterFaitsPrince } from '../../application/hooks'

/** Nombre de refus détaillés dans le bilan. */
const REFUS_DETAILLES = 6

/** Panneau « Importer un lot de décisions ». */
export function ImportFaitsPrince({ jeu }: { jeu: IdJeu }) {
  const champFichier = useRef<HTMLInputElement>(null)
  const importation = useImporterFaitsPrince(jeu)
  const bilan = importation.data

  return (
    <Panel
      kicker="Import"
      title="Importer un lot de décisions"
      hint="Une ligne par décision : matricule de l’enseignant (« id_ens » ou « Matricule_Enseignant »), école de destination (« id_etab » ou « Identifiant_Ecole ») et, facultativement, le motif ou la référence de la décision."
      actions={
        <button
          type="button"
          className="btn btn-sm"
          disabled={importation.isPending}
          onClick={() => champFichier.current?.click()}
        >
          {importation.isPending ? (
            <RefreshCw size={13} className="spin" aria-hidden="true" />
          ) : (
            <Upload size={13} aria-hidden="true" />
          )}{' '}
          Importer un fichier
        </button>
      }
    >
      <input
        ref={champFichier}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="champ-fichier-cache"
        aria-label="Fichier de décisions à importer"
        onChange={e => {
          const fichier = e.target.files?.[0]
          if (fichier) importation.mutate({ fichier })
          e.target.value = ''
        }}
      />

      {importation.error && <Notice tone="alert">{messageErreur(importation.error)}</Notice>}

      {bilan && bilan.manquantes.length > 0 && (
        <Notice tone="alert">Colonnes introuvables : {bilan.manquantes.join(', ')}.</Notice>
      )}

      {bilan && bilan.manquantes.length === 0 && (
        <Notice
          tone={bilan.refus.length ? 'warn' : 'info'}
          title={`${fmt(bilan.acceptees)} décision(s) enregistrée(s).`}
        >
          {bilan.refus.length > 0
            ? `${fmt(bilan.refus.length)} ligne(s) écartée(s) : ${bilan.refus.slice(0, REFUS_DETAILLES).join(' ; ')}${bilan.refus.length > REFUS_DETAILLES ? '…' : ''}`
            : 'Toutes les lignes ont été appliquées.'}
        </Notice>
      )}

      {!bilan && !importation.error && (
        <p className="hint">
          Chaque décision est contrôlée comme une saisie manuelle : enseignant et école connus, pas de double
          redéploiement.
        </p>
      )}
    </Panel>
  )
}
