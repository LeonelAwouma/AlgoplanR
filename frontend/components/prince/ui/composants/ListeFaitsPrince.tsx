'use client'

/**
 * Décisions de la DRH enregistrées, avec leur état au regard des données
 * actuelles. Annuler une décision rend l'enseignant à son école d'origine ;
 * le serveur relance aussitôt les calculs.
 */

import { ArrowRight, Download, Trash2 } from 'lucide-react'

import type { FaitPrinceApplique, IdJeu } from '@shared/api'
import { exporterCSV } from '@shared/exports/export-csv'
import { LIBELLE_STATUT_PRINCE } from '@shared/kernel'
import { DataTable, Panel, Pill, fmt, type Colonne } from '@shared/ui/commun'
import { EtatRequetes, ErreurAction } from '@shared/ui/etats'
import { useJeu } from '@components/donnees'

import { useAnnulerFaitPrince, useFaitsPrince } from '../../application/hooks'

/** Date de décision lisible. */
function dateDecision(fait: FaitPrinceApplique): string {
  return new Date(fait.fait.decideLe).toLocaleDateString('fr-FR')
}

export interface ProprietesListeFaitsPrince {
  jeu: IdJeu
  onOuvrirEcole: (ecole: string) => void
  /** Message de confirmation après une annulation. */
  onAnnule: (message: string) => void
}

/** Panneau « Décisions enregistrées ». */
export function ListeFaitsPrince({ jeu, onOuvrirEcole, onAnnule }: ProprietesListeFaitsPrince) {
  const faits = useFaitsPrince(jeu)
  const meta = useJeu(jeu)
  const annulation = useAnnulerFaitPrince(jeu)

  if (!faits.data) return <EtatRequetes requetes={[faits]} />

  const actifs = faits.data.filter(f => f.statut === 'applique').length

  function exporter(lignes: FaitPrinceApplique[]) {
    exporterCSV(
      `faits-de-prince-${meta.data?.anneeScolaire ?? 'exercice'}.csv`,
      [
        'Matricule',
        'Enseignant',
        'École origine',
        'Commune origine',
        'École destination',
        'Commune destination',
        'Décidé le',
        'Référence',
        'État',
      ],
      lignes.map(a => [
        a.fait.teacherId,
        a.fait.enseignant,
        a.fait.origine.nom,
        a.fait.origine.commune,
        a.fait.destination.nom,
        a.fait.destination.commune,
        dateDecision(a),
        a.fait.reference,
        LIBELLE_STATUT_PRINCE[a.statut],
      ]),
    )
  }

  const colonnes: Colonne<FaitPrinceApplique>[] = [
    {
      cle: 'ens',
      entete: 'Enseignant',
      rendu: a => (
        <span>
          <strong>{a.fait.enseignant}</strong>
          <small>{a.fait.teacherId}</small>
        </span>
      ),
      tri: a => a.fait.enseignant,
    },
    {
      cle: 'mouvement',
      entete: 'Redéploiement',
      rendu: a => (
        <span>
          <button type="button" className="row-action" onClick={() => onOuvrirEcole(a.fait.origine.id)}>
            {a.fait.origine.nom}
          </button>
          <small>
            <ArrowRight size={11} aria-hidden="true" /> {a.fait.destination.nom} ({a.fait.destination.commune})
          </small>
        </span>
      ),
      tri: a => a.fait.destination.nom,
    },
    { cle: 'date', entete: 'Décidé le', rendu: dateDecision, tri: a => a.fait.decideLe },
    { cle: 'ref', entete: 'Référence', rendu: a => a.fait.reference || '—', tri: a => a.fait.reference },
    {
      cle: 'statut',
      entete: 'État',
      rendu: a => (
        <span>
          <Pill tone={a.statut === 'applique' ? 'ok' : 'warn'}>{LIBELLE_STATUT_PRINCE[a.statut]}</Pill>
          {a.statut !== 'applique' && <small className="motif-etroit">{a.motif}</small>}
        </span>
      ),
      tri: a => a.statut,
    },
    {
      cle: 'annuler',
      entete: '',
      rendu: a => (
        <button
          type="button"
          className="row-action row-action-danger"
          disabled={annulation.isPending}
          onClick={() =>
            annulation.mutate(a.fait.id, {
              onSuccess: () => onAnnule(`Décision annulée : ${a.fait.enseignant} retrouve son école d’origine.`),
            })
          }
        >
          <Trash2 size={12} aria-hidden="true" /> Annuler
        </button>
      ),
    },
  ]

  return (
    <Panel
      kicker="Décisions enregistrées"
      title={`${fmt(actifs)} redéploiement(s) en vigueur`}
      hint="Annuler une décision rend l’enseignant à son école d’origine et relance immédiatement les calculs."
      actions={
        faits.data.length > 0 ? (
          <button type="button" className="btn btn-sm" onClick={() => exporter(faits.data)}>
            <Download size={13} aria-hidden="true" /> Exporter (CSV)
          </button>
        ) : undefined
      }
      flush
    >
      <ErreurAction erreur={annulation.error} />
      <DataTable
        lignes={faits.data}
        colonnes={colonnes}
        cle={a => a.fait.id}
        taillePage={15}
        legende="Redéploiements décidés par la DRH"
        messageVide="Aucun redéploiement n’a encore été décidé. Les chiffres de l’application reflètent uniquement les données importées."
      />
    </Panel>
  )
}
