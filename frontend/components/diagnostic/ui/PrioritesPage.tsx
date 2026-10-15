'use client'

/** Établissements en déficit, classés par priorité par le serveur. */

import { useMemo, useState } from 'react'

import type { SchoolDiagnostic } from '@shared/api'
import { classesDe, correspondRecherche, rangZoneSecurite, triClasses } from '@shared/kernel'
import { useSession } from '@shared/session'
import { useEffetsScenario, useScenarioAffiche } from '@components/simulation'
import { DataTable, Notice, Panel, SearchField, ZoneSecuritePill, fmt, fmtDec, type Colonne } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { usePriorites } from '../application/hooks'

/** Page « Écoles prioritaires ». */
export function PrioritesPage() {
  const { jeu, filtres, ouvrirEcole } = useSession()
  const priorites = usePriorites(jeu, filtres)
  const { scenario, detail } = useScenarioAffiche()
  const { effetDe, erreur } = useEffetsScenario(jeu, scenario)
  const [recherche, setRecherche] = useState('')

  const lignes = useMemo(
    () =>
      (priorites.data?.ecoles ?? []).filter(d =>
        correspondRecherche(recherche, d.school.id, d.school.nom, d.school.commune, d.school.departement),
      ),
    [priorites.data, recherche],
  )

  if (!priorites.data) return <EtatRequetes requetes={[priorites]} />

  const colonnes: Colonne<SchoolDiagnostic>[] = [
    {
      cle: 'nom',
      entete: 'Établissement',
      rendu: d => (
        <button type="button" className="row-action" onClick={() => ouvrirEcole(d.school.id)}>
          <strong>{d.school.nom || d.school.id}</strong>
          <small>
            {d.school.commune} · {d.school.departement} · {d.school.region}
          </small>
        </button>
      ),
      tri: d => d.school.nom,
    },
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
      cle: 'ens',
      entete: 'Enseignants État',
      numerique: true,
      rendu: d => fmt(d.enseignantsEtat),
      tri: d => d.enseignantsEtat,
    },
    {
      cle: 'besoin',
      entete: 'Postes manquants',
      numerique: true,
      rendu: d => <strong>{fmt(d.besoinTheorique)}</strong>,
      tri: d => d.besoinTheorique,
    },
    {
      cle: 'eleves',
      entete: 'Élèves',
      numerique: true,
      rendu: d => fmt(d.school.effectifTotalEleves),
      tri: d => d.school.effectifTotalEleves ?? -1,
    },
    {
      cle: 'pression',
      entete: 'Élèves / ens. État',
      numerique: true,
      rendu: d => fmtDec(d.elevesParEnseignantEtat, 1),
      tri: d => d.elevesParEnseignantEtat ?? -1,
    },
    {
      cle: 'multigrade',
      entete: 'Multigrades',
      numerique: true,
      rendu: d => fmt(d.school.classesMultigrades),
      tri: d => d.school.classesMultigrades,
    },
    {
      cle: 'raison',
      entete: 'Pourquoi cette école ?',
      rendu: d => (
        <span className="raison-priorite">
          {d.raisons.length === 0 ? '—' : d.raisons[0].texte}
          {d.raisons.length > 1 && <small>+ {d.raisons.length - 1} autre(s) raison(s)</small>}
        </span>
      ),
    },
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
      {scenario && detail && (
        <Notice tone="info" title={`Scénario affiché : ${detail.scenario.nom}.`}>
          {erreur
            ? 'Les effets du scénario n’ont pas pu être chargés ; seul le besoin de départ est affiché.'
            : 'Le classement décrit le besoin de départ ; les colonnes « scénario » montrent ce que le scénario affiché apporte à chaque école.'}
        </Notice>
      )}
      <Notice tone="neutral" title="Classement descriptif.">
        Les établissements sont ordonnés par nombre de postes manquants, puis par pression élèves par enseignant. Ce
        classement décrit les données : il ne constitue pas un ordre de traitement administratif.
      </Notice>

      <div className="filter-bar">
        <SearchField
          value={recherche}
          onChange={setRecherche}
          label="Rechercher un établissement"
          placeholder="Nom, code, commune…"
        />
      </div>

      <Panel kicker="Priorités" title={`${fmt(lignes.length)} établissements en déficit`} flush>
        <DataTable
          lignes={lignes}
          colonnes={colonnes}
          cle={d => d.school.id}
          legende="Établissements en déficit, classés par priorité"
          messageVide="Aucun établissement en déficit sur ce périmètre."
        />
      </Panel>
    </div>
  )
}
