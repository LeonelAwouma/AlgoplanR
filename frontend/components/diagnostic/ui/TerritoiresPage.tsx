'use client'

/**
 * Exploration territoriale : carte, bilan des mouvements du territoire et
 * territoires enfants, jusqu'aux établissements d'une commune.
 *
 * Les simulations portent sur l'ensemble des données ; les filtres
 * territoriaux ne font que choisir la portion observée. Les mouvements de
 * chaque territoire enfant (reçus, cédés, solde) sont comptés par le serveur.
 */

import { useMemo, useState } from 'react'

import { classesDe, descendre, rangZoneSecurite, selectionLabel, selectionLevel, triClasses } from '@shared/kernel'
import type { SchoolDiagnostic, TerritorialSummary } from '@shared/api'
import { useSession } from '@shared/session'
import { DataTable, Notice, Panel, ZoneSecuritePill, fmt, fmtDec, type Colonne } from '@shared/ui/commun'
import { CameroonMap, type IndicateurCarte, type StatsTerritoire } from '@shared/ui/carte/CameroonMap'
import { EtatRequetes } from '@shared/ui/etats'
import { SeveritePill } from '@shared/ui/pastilles'
import { FluxPanel, scenarioDeReference, useFlux, useScenarioAffiche } from '@components/simulation'

import { useDiagnostic, useVueTerritoriale } from '../application/hooks'

/** Solde de mouvements, signé et coloré, avec un symbole pour ne pas dépendre de la couleur. */
function Solde({ valeur }: { valeur: number }) {
  const sens = valeur > 0 ? 'positif' : valeur < 0 ? 'negatif' : 'nul'
  return (
    <span className="solde" data-sens={sens}>
      <span aria-hidden="true">{valeur > 0 ? '▲ ' : valeur < 0 ? '▼ ' : ''}</span>
      {valeur > 0 ? '+' : ''}
      {fmt(valeur)}
    </span>
  )
}

/** Page « Territoires ». */
export function TerritoiresPage() {
  const { jeu, filtres, setFiltres, ouvrirEcole } = useSession()
  const { scenario, detail, calcules } = useScenarioAffiche()
  const [indicateur, setIndicateur] = useState<IndicateurCarte>('postesNecessaires')

  // Même sans scénario affiché, la carte montre les mouvements du scénario
  // départemental (à défaut, du premier calculé) pour rester informative.
  const scenarioCarte = scenario ?? scenarioDeReference(calcules, 'departement') ?? calcules[0]?.scenario.id ?? null

  const niveau = selectionLevel(filtres.territoire)
  const vue = useVueTerritoriale(jeu, filtres, scenarioCarte)
  const flux = useFlux(jeu, scenario, filtres.territoire)
  const ecolesCommune = useDiagnostic(jeu, filtres)

  /** Mouvements par territoire, sous la forme attendue par la carte. */
  const stats = useMemo(() => {
    const carte = new Map<string, StatsTerritoire>()
    for (const m of vue.data?.mouvementsEnfants ?? []) {
      carte.set(m.territoire, {
        besoin: m.besoin,
        couverts: m.couverts,
        residuel: m.residuel,
        recus: m.recus,
        sortants: m.sortants,
        solde: m.solde,
      })
    }
    return carte
  }, [vue.data])

  if (!vue.data) return <EtatRequetes requetes={[vue]} />

  const explorer = (nom: string) => setFiltres({ ...filtres, territoire: descendre(filtres.territoire, nom) })
  const enfants = vue.data.enfants
  const libelleEnfants = niveau === 'national' ? 'Région' : niveau === 'region' ? 'Département' : 'Commune'

  const colonnes: Colonne<TerritorialSummary>[] = [
    {
      cle: 'nom',
      entete: libelleEnfants,
      rendu: t => (
        <button type="button" className="row-action" onClick={() => explorer(t.territory.nom)}>
          <strong>{t.territory.nom}</strong>
        </button>
      ),
      tri: t => t.territory.nom,
    },
    {
      cle: 'ecoles',
      entete: 'Écoles',
      numerique: true,
      rendu: t => fmt(t.totals.ecolesAnalysees),
      tri: t => t.totals.ecolesAnalysees,
    },
    {
      cle: 'deficit',
      entete: 'En déficit',
      numerique: true,
      rendu: t => fmt(t.totals.ecolesEnDeficit),
      tri: t => t.totals.ecolesEnDeficit,
    },
    {
      cle: 'postes',
      entete: 'Postes nécessaires',
      numerique: true,
      rendu: t => <strong>{fmt(t.totals.postesNecessaires)}</strong>,
      tri: t => t.totals.postesNecessaires,
    },
    {
      cle: 'excedent',
      entete: 'Redéployables',
      numerique: true,
      rendu: t => fmt(t.totals.excedentMobilisable),
      tri: t => t.totals.excedentMobilisable,
    },
    {
      cle: 'ratio',
      entete: 'Élèves / ens. État',
      numerique: true,
      rendu: t => fmtDec(t.totals.elevesParEnseignantEtat, 1),
      tri: t => t.totals.elevesParEnseignantEtat ?? -1,
    },
  ]

  // Les colonnes de mouvements n'ont de sens qu'une fois une simulation calculée.
  if (stats.size > 0) {
    const valeur = (t: TerritorialSummary, cle: keyof StatsTerritoire) => stats.get(t.territory.nom)?.[cle] ?? 0
    colonnes.push(
      {
        cle: 'recus',
        entete: 'Reçus',
        numerique: true,
        rendu: t => fmt(valeur(t, 'recus')),
        tri: t => valeur(t, 'recus'),
      },
      {
        cle: 'cedes',
        entete: 'Cédés',
        numerique: true,
        rendu: t => fmt(valeur(t, 'sortants')),
        tri: t => valeur(t, 'sortants'),
      },
      {
        cle: 'solde',
        entete: 'Solde',
        numerique: true,
        rendu: t => <Solde valeur={valeur(t, 'solde')} />,
        tri: t => valeur(t, 'solde'),
      },
    )
  }

  const colonnesEcoles: Colonne<SchoolDiagnostic>[] = [
    {
      cle: 'nom',
      entete: 'Établissement',
      rendu: d => (
        <button type="button" className="row-action" onClick={() => ouvrirEcole(d.school.id)}>
          <strong>{d.school.nom || d.school.id}</strong>
          <small>{d.school.id}</small>
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
    { cle: 'situation', entete: 'Situation', rendu: d => <SeveritePill severite={d.severite} /> },
  ]

  const titreCarte =
    niveau === 'national'
      ? 'Répartition géographique par région'
      : niveau === 'region'
        ? `Départements — ${filtres.territoire.region}`
        : `Communes — ${filtres.territoire.departement}`

  return (
    <div className="stack">
      <Notice tone="info" title="Comment lire cette page.">
        Les simulations sont calculées sur l’ensemble des données. Les filtres territoriaux vous permettent ensuite
        d’observer les résultats pour une région, un département ou une commune.
      </Notice>

      {niveau !== 'commune' && (
        <Panel
          kicker="Carte"
          title={titreCarte}
          hint="Choisissez l’indicateur représenté, puis cliquez sur un territoire pour l’explorer."
        >
          <CameroonMap
            niveau={niveau === 'national' ? 'region' : niveau === 'region' ? 'departement' : 'commune'}
            territoires={enfants}
            indicateur={indicateur}
            onIndicateurChange={setIndicateur}
            stats={stats}
            onExplorer={explorer}
            selection={
              niveau === 'national'
                ? filtres.territoire.region
                : niveau === 'region'
                  ? filtres.territoire.departement
                  : filtres.territoire.commune
            }
          />
        </Panel>
      )}

      {scenario && detail && flux.data && (
        <FluxPanel
          flux={flux.data}
          perimetre={selectionLabel(filtres.territoire)}
          scenarioNom={detail.scenario.nom}
          onOuvrirEcole={ouvrirEcole}
        />
      )}

      {niveau !== 'commune' ? (
        <Panel
          kicker="Exploration"
          title={`${libelleEnfants}s`}
          hint="Cliquez sur un territoire pour descendre d’un niveau."
          flush
        >
          <DataTable
            lignes={enfants}
            colonnes={colonnes}
            cle={t => t.territory.code}
            taillePage={25}
            legende="Indicateurs par territoire"
            messageVide="Aucun territoire ne correspond aux filtres."
          />
        </Panel>
      ) : (
        <Panel kicker="Exploration" title="Établissements de la commune" flush>
          {ecolesCommune.data ? (
            <DataTable
              lignes={ecolesCommune.data.ecoles}
              colonnes={colonnesEcoles}
              cle={d => d.school.id}
              legende="Établissements de la commune sélectionnée"
            />
          ) : (
            <EtatRequetes requetes={[ecolesCommune]} />
          )}
        </Panel>
      )}
    </div>
  )
}
