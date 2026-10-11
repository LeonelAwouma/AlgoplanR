'use client'

/**
 * Ajout au vivier de personnes issues d'autres sources (retours de
 * disponibilité, fins de détachement…). Utile seulement si la portée retenue
 * pour la nomination depuis le vivier inclut ces sources.
 */

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'

import type { IdJeu, SourceVivier } from '@shared/api'
import { LIBELLE_SOURCE_VIVIER } from '@shared/kernel'
import { Notice, Panel, fmt } from '@shared/ui/commun'
import { ChampAuteur, useAuteur } from '@shared/ui/ChampAuteur'
import { ErreurAction } from '@shared/ui/etats'

import { useImporterVivier } from '../../application/hooks'
import { SOURCES_IMPORTABLES } from '../../domain/sources'

/** Panneau « Ajouter des personnes au vivier ». */
export function ImportVivier({ jeu }: { jeu: IdJeu }) {
  const importation = useImporterVivier(jeu)
  const champFichier = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<SourceVivier>('disponibilite')
  const [auteur, setAuteur] = useAuteur()
  const bilan = importation.data

  return (
    <Panel
      kicker="Autres sources"
      title="Ajouter des personnes au vivier"
      hint="Une ligne par personne : identité, territoire de résidence, sous-système. La source choisie s’applique à tout le fichier."
    >
      <div className="param-grid">
        <div className="field">
          <label htmlFor="iv-source">Source</label>
          <select id="iv-source" value={source} onChange={e => setSource(e.target.value as SourceVivier)}>
            {SOURCES_IMPORTABLES.map(s => (
              <option key={s} value={s}>
                {LIBELLE_SOURCE_VIVIER[s]}
              </option>
            ))}
          </select>
        </div>
        <ChampAuteur auteur={auteur} onChange={setAuteur} />
      </div>
      <input
        ref={champFichier}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="champ-fichier-cache"
        aria-label="Fichier des personnes à ajouter au vivier"
        onChange={e => {
          const fichier = e.target.files?.[0]
          if (fichier) importation.mutate({ fichier, source, auteur: auteur.trim() })
          e.target.value = ''
        }}
      />
      <ErreurAction erreur={importation.error} />
      {bilan && (
        <Notice
          tone={bilan.refus.length > 0 || bilan.manquantes.length > 0 ? 'warn' : 'info'}
          title={`${fmt(bilan.ajoutees)} personne(s) ajoutée(s).`}
        >
          {bilan.manquantes.length > 0 && `Colonnes introuvables : ${bilan.manquantes.join(', ')}. `}
          {bilan.refus.length > 0 &&
            `${fmt(bilan.refus.length)} ligne(s) écartée(s) : ${bilan.refus.slice(0, 5).join(' ; ')}.`}
        </Notice>
      )}
      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-sm"
          disabled={importation.isPending || auteur.trim() === ''}
          onClick={() => champFichier.current?.click()}
        >
          <Upload size={13} aria-hidden="true" /> Importer un fichier
        </button>
      </div>
    </Panel>
  )
}
