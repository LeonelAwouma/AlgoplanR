'use client'

/**
 * Jeux de données conservés par le serveur. Les données étant désormais
 * persistées, l'utilisateur peut reprendre un exercice déjà importé au lieu de
 * réimporter ses classeurs.
 */

import { FolderOpen, Trash2 } from 'lucide-react'

import type { IdJeu, JeuDeDonnees, SensAnneeScolaire } from '@shared/api'
import { LIBELLE_STATUT_JEU } from '@shared/kernel'
import { Panel, Pill, fmt } from '@shared/ui/commun'
import { ErreurAction } from '@shared/ui/etats'

import { useJeux, useModifierJeu, useSupprimerJeu } from '../../application/hooks'

/** Année saisie et son sens : la base des projections en découle (jamais une année réelle inventée). */
function libelleAnnee(jeu: JeuDeDonnees): string {
  if (jeu.sensAnneeScolaire === 'rentree_preparee')
    return `rentrée préparée ${jeu.anneeScolaire} (base ${jeu.anneeDonnees})`
  if (jeu.sensAnneeScolaire === 'non_confirme')
    return `année ${jeu.anneeScolaire} (sens à confirmer ; base de calcul ${jeu.anneeDonnees})`
  return `données ${jeu.anneeScolaire}`
}

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
  const modification = useModifierJeu()

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

  /** Correction du sens d'un jeu dont le sens est établi : la base change d'un an, les projections sont à refaire. */
  function corrigerSens(jeu: JeuDeDonnees) {
    const vers: SensAnneeScolaire = jeu.sensAnneeScolaire === 'donnees' ? 'rentree_preparee' : 'donnees'
    const confirme = window.confirm(
      (vers === 'donnees'
        ? `Lire l’année ${jeu.anneeScolaire} comme l’année des données (base ${jeu.anneeScolaire}) ?`
        : `Lire l’année ${jeu.anneeScolaire} comme la rentrée préparée (base : année précédente) ?`) +
        '\n\nLes années des projections changent et les projections enregistrées sont marquées à recalculer. ' +
        'La correction est inscrite au journal ; l’année saisie n’est pas modifiée.',
    )
    if (!confirme) return
    modification.mutate({ jeu: jeu.id, corps: { sensAnneeScolaire: vers } })
  }

  return (
    <Panel
      kicker="Reprendre"
      title="Jeux de données enregistrés"
      hint="Les données importées sont conservées sur ce poste par le serveur AlgoPlanR, avec les décisions et les résultats."
    >
      <ErreurAction erreur={suppression.error ?? modification.error} />
      <ul className="liste-jeux">
        {jeux.data.map(jeu => (
          <li key={jeu.id}>
            <div>
              <strong>
                {jeu.demonstration ? 'Jeu de démonstration' : (jeu.fichiersSource.etablissements ?? 'Jeu importé')}
              </strong>{' '}
              {jeu.id === jeuOuvert && <Pill tone="info">Ouvert</Pill>}{' '}
              <Pill tone={jeu.statut === 'valide' ? 'ok' : 'neutral'}>{LIBELLE_STATUT_JEU[jeu.statut]}</Pill>{' '}
              {jeu.donneesFictives && <Pill tone="warn">Données fictives</Pill>}
              <p className="hint">
                Importé le {dateImport(jeu)} · {libelleAnnee(jeu)} · {fmt(jeu.nbEtablissements)} établissements ·{' '}
                {jeu.nominatifDisponible
                  ? `${fmt(jeu.nbEnseignants)} enseignants`
                  : 'établissements seuls (sans fichier nominatif)'}
              </p>
              {jeu.sensAnneeScolaire === 'non_confirme' && (
                <p className="hint">
                  Le sens de l’année {jeu.anneeScolaire} n’est pas établi pour ce jeu : le calendrier historique est
                  conservé (base {jeu.anneeDonnees}) en attendant votre confirmation. Elle désigne :{' '}
                  {(
                    [
                      ['donnees', `les données (base ${jeu.anneeScolaire})`],
                      ['rentree_preparee', 'la rentrée préparée (base : année précédente)'],
                    ] as [SensAnneeScolaire, string][]
                  ).map(([sens, libelle]) => (
                    <button
                      key={sens}
                      type="button"
                      className="btn btn-sm"
                      disabled={modification.isPending}
                      onClick={() => modification.mutate({ jeu: jeu.id, corps: { sensAnneeScolaire: sens } })}
                    >
                      {libelle}
                    </button>
                  ))}
                </p>
              )}
            </div>
            <div className="liste-jeux-actions">
              {jeu.sensAnneeScolaire !== 'non_confirme' && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={modification.isPending}
                  title="Corriger le sens de l’année saisie : la base des projections change d’un an, la correction est journalisée."
                  onClick={() => corrigerSens(jeu)}
                >
                  Corriger le sens de l’année
                </button>
              )}
              {!jeu.demonstration && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={modification.isPending}
                  title="Marqueur explicite : un bandeau « Données fictives » s’affiche dans les vues et les exports."
                  onClick={() => modification.mutate({ jeu: jeu.id, corps: { donneesFictives: !jeu.donneesFictives } })}
                >
                  {jeu.donneesFictives ? 'Retirer « fictif »' : 'Déclarer fictif'}
                </button>
              )}
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
