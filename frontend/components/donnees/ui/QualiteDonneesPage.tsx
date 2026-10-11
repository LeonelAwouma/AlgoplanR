'use client'

/**
 * Qualité des données (vue analyste) : fichiers analysés, rapport de qualité et
 * correspondance des colonnes, tels que le serveur les a conservés avec le jeu.
 */

import type { ColumnMatch, TypeFichier } from '@shared/api'
import { useSession } from '@shared/session'
import { DataTable, Notice, Panel, Pill, fmt, type Colonne } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useJeu, useQualite } from '../application/hooks'
import { TYPES_FICHIER } from '../domain/correspondances'
import { DataQualityPanel } from './composants/DataQualityPanel'

/** Colonnes de la table de correspondance. */
const COLONNES_CORRESPONDANCE: Colonne<ColumnMatch>[] = [
  { cle: 'champ', entete: 'Champ interne', rendu: m => <span className="mono">{m.champ}</span>, tri: m => m.champ },
  { cle: 'label', entete: 'Information métier', rendu: m => m.label, tri: m => m.label },
  { cle: 'entete', entete: 'Colonne du fichier', rendu: m => m.enTete ?? '—', tri: m => m.enTete ?? '' },
  { cle: 'methode', entete: 'Reconnaissance', rendu: m => m.methode, tri: m => m.methode },
  {
    cle: 'confiance',
    entete: 'Confiance',
    numerique: true,
    rendu: m => (m.confiance === 0 ? '—' : m.confiance.toFixed(2)),
    tri: m => m.confiance,
  },
  {
    cle: 'requis',
    entete: 'Requis',
    rendu: m => (m.requis ? <Pill tone={m.enTete ? 'ok' : 'alert'}>Requis</Pill> : '—'),
  },
]

/** Libellé d'un type de fichier. */
const LIBELLE_TYPE: Record<TypeFichier, string> = { etablissements: 'Établissements', enseignants: 'Enseignants' }

/** Page « Qualité des données ». */
export function QualiteDonneesPage() {
  const { jeu } = useSession()
  const meta = useJeu(jeu)
  const qualite = useQualite(jeu)

  if (!meta.data || !qualite.data) return <EtatRequetes requetes={[meta, qualite]} />

  const j = meta.data
  const { rapport, correspondances } = qualite.data

  return (
    <div className="stack">
      <Panel kicker="Source" title="Fichiers analysés">
        <dl className="def-grid">
          <div>
            <dt>Fichier établissements</dt>
            <dd className="dd-texte">{j.fichiersSource.etablissements ?? '—'}</dd>
          </div>
          <div>
            <dt>Fichier enseignants</dt>
            <dd className="dd-texte">{j.fichiersSource.enseignants ?? '—'}</dd>
          </div>
          <div>
            <dt>Établissements lus</dt>
            <dd>{fmt(j.nbEtablissements)}</dd>
          </div>
          <div>
            <dt>Enseignants lus</dt>
            <dd>{fmt(j.nbEnseignants)}</dd>
          </div>
          <div>
            <dt>Établissements retenus au diagnostic</dt>
            <dd>{fmt(j.nbUnitesCalcul)}</dd>
          </div>
          <div>
            <dt>Importé le</dt>
            <dd className="dd-texte">{new Date(j.importeLe).toLocaleString('fr-FR')}</dd>
          </div>
        </dl>
        {j.demonstration && (
          <Notice tone="warn" title="Jeu de démonstration.">
            Les valeurs sont fictives et générées de façon déterministe par l’application.
          </Notice>
        )}
      </Panel>

      {rapport ? (
        <Panel kicker="Contrôle" title="Qualité des données">
          <DataQualityPanel rapport={rapport} />
        </Panel>
      ) : (
        <Notice tone="neutral" title="Pas de rapport qualité.">
          Le jeu de démonstration n’est pas soumis au contrôle qualité : il est produit par l’application elle-même.
        </Notice>
      )}

      {TYPES_FICHIER.map(type => {
        const correspondance = correspondances[type]
        if (!correspondance) return null
        return (
          <Panel
            key={type}
            kicker={LIBELLE_TYPE[type]}
            title={`Colonnes reconnues — ${j.fichiersSource[type] ?? LIBELLE_TYPE[type]}`}
            flush
          >
            <DataTable
              lignes={correspondance.matches}
              colonnes={COLONNES_CORRESPONDANCE}
              cle={m => `${type}-${m.champ}`}
              taillePage={30}
              legende={`Table de correspondance du fichier ${type}`}
            />
          </Panel>
        )
      })}
    </div>
  )
}
