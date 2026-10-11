'use client'

/** Carte d'envoi d'un classeur : description, colonnes attendues, état de lecture par le serveur. */

import { Check, RefreshCw, Upload, X } from 'lucide-react'

import type { FichierImporte, TypeFichier } from '@shared/api'
import { Notice, Pill, fmt } from '@shared/ui/commun'

import { DESCRIPTION_FICHIER, FORMATS_ACCEPTES, nombreDeColonnesReconnues } from '../../domain/correspondances'
import { ColonnesAttendues } from './ColonnesAttendues'

export interface ProprietesCarteFichier {
  type: TypeFichier
  /** Fichier déjà lu par le serveur, `null` tant qu'aucun n'a été envoyé. */
  fichier: FichierImporte | null
  /** Message d'erreur de la dernière lecture. */
  erreur: string | null
  /** Vrai pendant l'envoi et la lecture du classeur. */
  enLecture: boolean
  /** Désactive le choix d'un fichier (analyse en cours). */
  desactive: boolean
  onFichier: (fichier: File) => void
}

/** Carte d'un des deux classeurs à fournir. */
export function CarteFichier({ type, fichier, erreur, enLecture, desactive, onFichier }: ProprietesCarteFichier) {
  const etat = erreur ? 'error' : fichier ? 'ready' : 'vide'
  const description = DESCRIPTION_FICHIER[type]

  return (
    <div className="upload-card" data-state={etat}>
      <div className="upload-card-entete">
        <div>
          <p className="eyebrow">Fichier requis</p>
          <h2>{description.titre}</h2>
        </div>
        {etat === 'ready' && (
          <Pill tone="ok">
            <Check size={12} aria-hidden="true" /> Lu
          </Pill>
        )}
        {etat === 'error' && (
          <Pill tone="alert">
            <X size={12} aria-hidden="true" /> Illisible
          </Pill>
        )}
        {etat === 'vide' && <Pill tone="warn">À fournir</Pill>}
      </div>

      <p className="hint">{description.texte}</p>

      <ColonnesAttendues type={type} />

      {erreur && (
        <Notice tone="alert" title="Lecture impossible.">
          {erreur}
        </Notice>
      )}

      {fichier && (
        <div className="upload-meta">
          <span>
            <strong className="texte-fort">{fichier.nomFichier}</strong>
          </span>
          <span>
            Feuille « {fichier.feuilleLue} » · {fmt(fichier.lignes)} lignes de données ·{' '}
            {nombreDeColonnesReconnues(fichier.correspondances)} informations reconnues sur{' '}
            {fichier.correspondances.matches.length}
          </span>
        </div>
      )}

      <label className="upload-drop" aria-disabled={desactive}>
        {enLecture ? (
          <>
            <RefreshCw size={18} className="spin" aria-hidden="true" /> Lecture du classeur…
          </>
        ) : (
          <>
            <Upload size={18} aria-hidden="true" />
            <span>
              <strong>{fichier ? 'Remplacer le fichier' : 'Choisir un fichier Excel'}</strong>
              <br />
              Formats acceptés : .xlsx, .xls, .xlsm, .csv
            </span>
          </>
        )}
        <input
          type="file"
          accept={FORMATS_ACCEPTES}
          disabled={desactive || enLecture}
          onChange={e => {
            const choisi = e.target.files?.[0]
            if (choisi) onFichier(choisi)
            // Permet de renvoyer le même fichier après l'avoir corrigé sur le disque.
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
