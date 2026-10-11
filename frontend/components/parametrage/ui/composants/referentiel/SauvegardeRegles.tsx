'use client'

/**
 * Sauvegarde et réutilisation d'un jeu de règles : export en fichier JSON,
 * import (fusionné par le serveur avec les valeurs par défaut), retour aux
 * valeurs du référentiel, relance des simulations.
 */

import { useRef, useState } from 'react'
import { Download, RefreshCw, RotateCcw, Upload } from 'lucide-react'

import { messageErreur, type EngineSettings, type IdJeu } from '@shared/api'
import { exporterJSON } from '@shared/exports/export-csv'
import { Notice, Panel } from '@shared/ui/commun'
import { useCalculerScenariosDeBase } from '@components/simulation'

import { useImporterParametres } from '../../../application/hooks'

export interface ProprietesSauvegardeRegles {
  jeu: IdJeu
  parametres: EngineSettings
  onRetablirDefaut: () => void
}

/** Panneau « Sauvegarde ». */
export function SauvegardeRegles({ jeu, parametres, onRetablirDefaut }: ProprietesSauvegardeRegles) {
  const champFichier = useRef<HTMLInputElement>(null)
  const importation = useImporterParametres(jeu)
  const calculBase = useCalculerScenariosDeBase(jeu)
  const [erreurLecture, setErreurLecture] = useState<string | null>(null)

  /** Lit le fichier JSON choisi et l'envoie au serveur, qui le fusionne avec les règles par défaut. */
  async function charger(fichier: File) {
    setErreurLecture(null)
    try {
      importation.mutate(JSON.parse(await fichier.text()) as unknown)
    } catch {
      setErreurLecture('Le fichier n’est pas un document JSON lisible.')
    }
  }

  const erreur = erreurLecture ?? (importation.error ? messageErreur(importation.error) : null)

  return (
    <Panel kicker="Sauvegarde" title="Conserver ou réutiliser ce jeu de règles">
      {erreur && (
        <Notice tone="alert" title="Fichier de règles illisible.">
          {erreur}
        </Notice>
      )}
      <div className="topbar-actions actions-formulaire">
        <button type="button" className="btn" onClick={() => exporterJSON('regles-analyse-algoplanr.json', parametres)}>
          <Download size={14} aria-hidden="true" /> Enregistrer ces règles dans un fichier
        </button>
        <button
          type="button"
          className="btn"
          disabled={importation.isPending}
          onClick={() => champFichier.current?.click()}
        >
          <Upload size={14} aria-hidden="true" /> Charger des règles enregistrées
        </button>
        <input
          ref={champFichier}
          type="file"
          accept=".json"
          className="champ-fichier-cache"
          aria-label="Fichier de règles à charger"
          onChange={e => {
            const fichier = e.target.files?.[0]
            if (fichier) void charger(fichier)
            e.target.value = ''
          }}
        />
        <button type="button" className="btn btn-danger" onClick={onRetablirDefaut}>
          <RotateCcw size={14} aria-hidden="true" /> Rétablir les valeurs du référentiel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={calculBase.isPending}
          onClick={() => calculBase.mutate()}
        >
          <RefreshCw size={14} className={calculBase.isPending ? 'spin' : undefined} aria-hidden="true" /> Mettre à jour
          les simulations
        </button>
      </div>
      <p className="hint">
        Ces règles sont conservées par le serveur avec le jeu de données. Le fichier exporté ne contient aucune donnée
        d’établissement, d’enseignant ni d’élève.
      </p>
    </Panel>
  )
}
