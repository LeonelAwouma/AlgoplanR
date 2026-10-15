'use client'

/**
 * Liste des établissements du périmètre filtré (§9). Un clic ouvre la fiche
 * détaillée de l'école.
 */

import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'

import { SANS_PAGINATION, type SchoolDiagnostic } from '@shared/api'
import { exporterCSV } from '@shared/exports/export-csv'
import {
  LIBELLE_SEVERITE,
  LIBELLE_ZONE,
  classesDe,
  correspondRecherche,
  libelleZoneSecurite,
  rangZoneSecurite,
  triClasses,
} from '@shared/kernel'
import { useSession } from '@shared/session'
import { useEffetsScenario, useScenarioAffiche } from '@components/simulation'
import { DataTable, Notice, Panel, SearchField, ZoneSecuritePill, fmt, fmtDec, type Colonne } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { SeveritePill } from '@shared/ui/pastilles'

import { useEtablissements } from '../application/hooks'
import { FicheEcole } from './FicheEcole'

/** Exporte la liste affichée en CSV. */
function exporterListe(lignes: SchoolDiagnostic[]) {
  exporterCSV(
    'etablissements.csv',
    [
      'Code',
      'Établissement',
      'Région',
      'Département',
      'Commune',
      'Zone',
      'Zone de sécurité',
      'Classes',
      'Élèves',
      'Enseignants État',
      'Dotation D',
      'Déficit',
      'Excédent',
      'Postes déclarés',
      'Élèves par enseignant État',
      'Situation',
    ],
    lignes.map(d => [
      d.school.id,
      d.school.nom,
      d.school.region,
      d.school.departement,
      d.school.commune,
      LIBELLE_ZONE[d.school.zone],
      libelleZoneSecurite(d.school.zoneSecurite),
      classesDe(d),
      d.school.effectifTotalEleves,
      d.enseignantsEtat,
      d.enseignantsMinimumAConserver,
      d.besoinTheorique,
      d.excedentTheorique,
      d.postesDeclares,
      d.elevesParEnseignantEtat,
      LIBELLE_SEVERITE[d.severite],
    ]),
  )
}

/** Page « Écoles ». */
export function EcolesPage() {
  const { jeu, filtres, ecoleSelectionnee, setEcoleSelectionnee, ouvrirEcole } = useSession()
  const etablissements = useEtablissements(jeu, filtres, SANS_PAGINATION)
  const { scenario, detail } = useScenarioAffiche()
  const { effetDe, erreur } = useEffetsScenario(jeu, scenario)
  const [recherche, setRecherche] = useState('')

  const lignes = useMemo(
    () =>
      (etablissements.data?.elements ?? []).filter(d =>
        correspondRecherche(
          recherche,
          d.school.id,
          d.school.nom,
          d.school.commune,
          d.school.departement,
          d.school.region,
        ),
      ),
    [etablissements.data, recherche],
  )

  if (ecoleSelectionnee) return <FicheEcole ecole={ecoleSelectionnee} onRetour={() => setEcoleSelectionnee(null)} />
  if (!etablissements.data) return <EtatRequetes requetes={[etablissements]} />

  const colonnes: Colonne<SchoolDiagnostic>[] = [
    {
      cle: 'nom',
      entete: 'Établissement',
      rendu: d => (
        <button type="button" className="row-action" onClick={() => ouvrirEcole(d.school.id)}>
          <strong>{d.school.nom || d.school.id}</strong>
          <small>
            {d.school.id} · {d.school.commune}
          </small>
        </button>
      ),
      tri: d => d.school.nom,
    },
    {
      cle: 'territoire',
      entete: 'Territoire',
      rendu: d => (
        <span>
          {d.school.departement}
          <small>{d.school.region}</small>
        </span>
      ),
      tri: d => d.school.region,
    },
    { cle: 'zone', entete: 'Milieu', rendu: d => LIBELLE_ZONE[d.school.zone], tri: d => d.school.zone },
    {
      cle: 'securite',
      entete: 'Sécurité',
      rendu: d => <ZoneSecuritePill zone={d.school.zoneSecurite} points={d.priorite.pointsSecurite} court />,
      tri: d => rangZoneSecurite(d.school.zoneSecurite),
    },
    {
      cle: 'classes',
      entete: 'Classes',
      numerique: true,
      rendu: d => fmt(classesDe(d)),
      tri: triClasses,
    },
    {
      cle: 'eleves',
      entete: 'Élèves',
      numerique: true,
      rendu: d => fmt(d.school.effectifTotalEleves),
      tri: d => d.school.effectifTotalEleves ?? -1,
    },
    {
      cle: 'ens',
      entete: 'Enseignants État',
      numerique: true,
      rendu: d => fmt(d.enseignantsEtat),
      tri: d => d.enseignantsEtat,
    },
    {
      cle: 'besoin',
      entete: 'Déficit',
      numerique: true,
      rendu: d => fmt(d.besoinTheorique),
      tri: d => d.besoinTheorique,
    },
    {
      cle: 'excedent',
      entete: 'Excédent',
      numerique: true,
      rendu: d => fmt(d.excedentTheorique),
      tri: d => d.excedentTheorique,
    },
    {
      cle: 'pression',
      entete: 'Élèves / ens. État',
      numerique: true,
      rendu: d => fmtDec(d.elevesParEnseignantEtat, 1),
      tri: d => d.elevesParEnseignantEtat ?? -1,
    },
    { cle: 'situation', entete: 'Situation', rendu: d => <SeveritePill severite={d.severite} /> },
    ...(scenario
      ? ([
          {
            cle: 'sc-recus',
            entete: 'Reçus (scénario)',
            numerique: true,
            rendu: d => fmt(effetDe(d.school.id).recus),
            tri: d => effetDe(d.school.id).recus,
          },
          {
            cle: 'sc-sortants',
            entete: 'Sortants (scénario)',
            numerique: true,
            rendu: d => fmt(effetDe(d.school.id).sortants),
            tri: d => effetDe(d.school.id).sortants,
          },
          {
            cle: 'sc-restants',
            entete: 'Reste à pourvoir',
            numerique: true,
            rendu: d => <strong>{fmt(effetDe(d.school.id).restants)}</strong>,
            tri: d => effetDe(d.school.id).restants,
          },
        ] satisfies Colonne<SchoolDiagnostic>[])
      : []),
  ]

  return (
    <div className="stack">
      {scenario && detail ? (
        <Notice tone="info" title={`Scénario affiché : ${detail.scenario.nom}.`}>
          {erreur
            ? 'Les effets du scénario n’ont pas pu être chargés ; seul le besoin de départ est affiché.'
            : 'Le besoin de départ ne change pas : les colonnes « scénario » indiquent, école par école, les enseignants que le scénario y envoie, en retire, et les postes qui restent à pourvoir.'}
        </Notice>
      ) : (
        <Notice tone="neutral" title="Situation actuelle.">
          Aucun scénario n’est affiché : choisissez-en un dans « Scénario affiché » pour voir ses effets école par
          école.
        </Notice>
      )}
      <div className="filter-bar">
        <SearchField
          value={recherche}
          onChange={setRecherche}
          label="Rechercher un établissement"
          placeholder="Nom, code, commune, département…"
        />
        <div className="filter-bar-actions">
          <button type="button" className="btn btn-sm" onClick={() => exporterListe(lignes)}>
            <Download size={13} aria-hidden="true" /> Exporter la liste (CSV)
          </button>
        </div>
      </div>

      <Panel kicker="Établissements" title={`${fmt(lignes.length)} établissements`} flush>
        <DataTable
          lignes={lignes}
          colonnes={colonnes}
          cle={d => d.school.id}
          legende="Liste des établissements du périmètre"
          messageVide="Aucun établissement ne correspond à cette recherche."
        />
      </Panel>
    </div>
  )
}
