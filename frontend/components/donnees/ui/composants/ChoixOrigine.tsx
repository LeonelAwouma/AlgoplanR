'use client'

/**
 * Origine des classeurs d'un délégué : fichiers de sa seule région, ou fichier
 * de la base nationale (toutes régions) dont le serveur ne retient que sa région.
 * L'origine est fixée à l'envoi : en changer oblige à redéposer les classeurs.
 */

/** `regionale` : toutes les lignes doivent être de la région ; `nationale` : la région est extraite. */
export type OrigineFichiers = 'regionale' | 'nationale'

export interface ProprietesChoixOrigine {
  region: string
  origine: OrigineFichiers
  desactive: boolean
  onChange: (origine: OrigineFichiers) => void
}

export function ChoixOrigine({ region, origine, desactive, onChange }: ProprietesChoixOrigine) {
  return (
    <div className="origine-fichiers">
      <span className="texte-fort">Origine des classeurs</span>
      <div className="mode-switch" role="group" aria-label="Origine des classeurs">
        <button
          type="button"
          aria-pressed={origine === 'regionale'}
          disabled={desactive}
          onClick={() => onChange('regionale')}
        >
          Fichiers de ma région
        </button>
        <button
          type="button"
          aria-pressed={origine === 'nationale'}
          disabled={desactive}
          onClick={() => onChange('nationale')}
        >
          Base nationale
        </button>
      </div>
      <p className="hint">
        {origine === 'nationale'
          ? `Seules les écoles de la région ${region} et les enseignants qui y sont attachés seront retenus ; les autres régions sont écartées.`
          : `Toutes les lignes doivent appartenir à la région ${region} : une seule ligne d’une autre région fait refuser le fichier.`}
      </p>
    </div>
  )
}
