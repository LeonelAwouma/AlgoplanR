'use client'

/**
 * Choix d'un dossier entier : ses classeurs sont rangés d'eux-mêmes dans le
 * bon compartiment (établissements, enseignants), puis envoyés au serveur. Le
 * bilan dit quel fichier va où et pourquoi les autres sont laissés de côté.
 */

import { ArrowRight, FolderOpen, RefreshCw } from 'lucide-react'

import type { TypeFichier } from '@shared/api'
import { Notice } from '@shared/ui/commun'

import { DESCRIPTION_FICHIER, TYPES_FICHIER } from '../../domain/correspondances'

/** Bilan du tri d'un dossier. */
export interface BilanDossier {
  /** Chemin du classeur retenu pour chaque compartiment. */
  retenus: Partial<Record<TypeFichier, string>>
  /** Classeurs laissés de côté, avec leur motif. */
  ignores: { chemin: string; motif: string }[]
  /** Fichiers du dossier qui ne sont pas des classeurs. */
  autresFichiers: number
}

/**
 * Sélection d'un dossier : `webkitdirectory` est reconnu par Chromium (donc par
 * l'application de bureau), Firefox et Safari, mais absent des types de React.
 */
const CHOIX_DOSSIER = { webkitdirectory: '', directory: '' } as Record<string, string>

export interface ProprietesChoixDossier {
  desactive: boolean
  enCours: boolean
  bilan: BilanDossier | null
  /** Erreur qui empêche le tri (liste des colonnes attendues indisponible…). */
  erreur: string | null
  onDossier: (fichiers: File[]) => void
}

export function ChoixDossier({ desactive, enCours, bilan, erreur, onDossier }: ProprietesChoixDossier) {
  return (
    <div className="upload-dossier">
      <label className="upload-drop upload-drop-dossier" aria-disabled={desactive || enCours}>
        {enCours ? (
          <>
            <RefreshCw size={18} className="spin" aria-hidden="true" /> Tri des classeurs du dossier…
          </>
        ) : (
          <>
            <FolderOpen size={18} aria-hidden="true" />
            <span>
              <strong>Choisir un dossier</strong>
              <br />
              Chaque classeur Excel est rangé dans son compartiment d’après ses colonnes.
            </span>
          </>
        )}
        <input
          type="file"
          multiple
          {...CHOIX_DOSSIER}
          disabled={desactive || enCours}
          onChange={e => {
            const fichiers = Array.from(e.target.files ?? [])
            if (fichiers.length > 0) onDossier(fichiers)
            // Permet de choisir à nouveau le même dossier après l'avoir modifié.
            e.target.value = ''
          }}
        />
      </label>

      {erreur && (
        <Notice tone="alert" title="Tri impossible.">
          {erreur}
        </Notice>
      )}

      {bilan && (
        <div className="upload-meta" aria-live="polite">
          {TYPES_FICHIER.map(type => {
            const chemin = bilan.retenus[type]
            return (
              <span key={type}>
                <strong className="texte-fort">{DESCRIPTION_FICHIER[type].titre}</strong>{' '}
                <ArrowRight size={12} aria-hidden="true" />{' '}
                {chemin ? <span className="mono">{chemin}</span> : 'aucun classeur reconnu dans ce dossier'}
              </span>
            )
          })}
          {bilan.ignores.map(i => (
            <span key={i.chemin}>
              Ignoré : <span className="mono">{i.chemin}</span> — {i.motif}
            </span>
          ))}
          {bilan.autresFichiers > 0 && (
            <span>
              {bilan.autresFichiers} fichier(s) qui ne sont pas des classeurs Excel ou CSV, non pris en compte.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
