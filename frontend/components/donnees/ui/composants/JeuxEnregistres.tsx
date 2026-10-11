'use client'

/**
 * Jeux de données conservés par le serveur. Les données étant désormais
 * persistées, l'utilisateur peut reprendre un exercice déjà importé au lieu de
 * réimporter ses classeurs.
 */

import { FolderOpen, Trash2 } from 'lucide-react'

import type { IdJeu, JeuDeDonnees } from '@shared/api'
import { LIBELLE_STATUT_JEU } from '@shared/kernel'
import { Panel, Pill, fmt } from '@shared/ui/commun'
import { ErreurAction } from '@shared/ui/etats'

import { useJeux, useSupprimerJeu } from '../../application/hooks'

/** Date lisible d'un import. */
function dateImport(jeu: JeuDeDonnees): string {
  return new Date(jeu.importeLe).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export interface ProprietesJeuxEnregistres {
  /** Jeu actuellement ouvert, signalé dans la liste. */
  jeuOuvert: IdJeu | null
  onOuvrir: (jeu: IdJeu) => void
  /** Appelé après la suppression du jeu ouvert. */
  onJeuOuvertSupprime: () => void
}

/** Liste des jeux enregistrés, avec ouverture et suppression. */
export function JeuxEnregistres({ jeuOuvert, onOuvrir, onJeuOuvertSupprime }: ProprietesJeuxEnregistres) {
  const jeux = useJeux()
  const suppression = useSupprimerJeu()

  // Sans jeu enregistré (ou serveur pas encore joignable), la section n'a pas lieu d'être.
  if (!jeux.data || jeux.data.length === 0) return null

  function supprimer(jeu: JeuDeDonnees) {
    const confirme = window.confirm(
      `Supprimer le jeu importé le ${dateImport(jeu)} ?\n\nLes données, les décisions et les résultats calculés seront définitivement supprimés.`,
    )
    if (!confirme) return
    suppression.mutate(jeu.id, {
      onSuccess: () => {
        if (jeu.id === jeuOuvert) onJeuOuvertSupprime()
      },
    })
  }

  return (
    <Panel
      kicker="Reprendre"
      title="Jeux de données enregistrés"
      hint="Les données importées sont conservées sur ce poste par le serveur AlgoPlanR, avec les décisions et les résultats."
    >
      <ErreurAction erreur={suppression.error} />
      <ul className="liste-jeux">
        {jeux.data.map(jeu => (
          <li key={jeu.id}>
            <div>
              <strong>
                {jeu.demonstration ? 'Jeu de démonstration' : (jeu.fichiersSource.etablissements ?? 'Jeu importé')}
              </strong>{' '}
              {jeu.id === jeuOuvert && <Pill tone="info">Ouvert</Pill>}{' '}
              <Pill tone={jeu.statut === 'valide' ? 'ok' : 'neutral'}>{LIBELLE_STATUT_JEU[jeu.statut]}</Pill>
              <p className="hint">
                Importé le {dateImport(jeu)} · année {jeu.anneeScolaire} · {fmt(jeu.nbEtablissements)} établissements ·{' '}
                {fmt(jeu.nbEnseignants)} enseignants
              </p>
            </div>
            <div className="liste-jeux-actions">
              <button type="button" className="btn btn-sm" onClick={() => onOuvrir(jeu.id)}>
                <FolderOpen size={14} aria-hidden="true" /> Ouvrir
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={suppression.isPending}
                onClick={() => supprimer(jeu)}
                aria-label={`Supprimer le jeu importé le ${dateImport(jeu)}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
