'use client'

/**
 * Vœux des enseignants (référentiel §3.2 et §3.3) : demandes, recevabilité,
 * scores et issue, dans l'ordre du classement unique établi par le serveur.
 */

import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'

import { SANS_PAGINATION, SELECTION_NATIONALE, type Candidature, type IssueCandidature } from '@shared/api'
import { exporterCSV } from '@shared/exports/export-csv'
import { LIBELLE_ISSUE, LIBELLE_MOTIF, LIBELLE_STATUT_VOEU, correspondRecherche } from '@shared/kernel'
import { useSession } from '@shared/session'
import { DataTable, KpiCard, Notice, Panel, Pill, SearchField, fmt, type Colonne, type Tone } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useCandidatures, useResultat } from '../application/hooks'
import { useScenarioAffiche } from '../application/scenarioAffiche'
import { SansScenario } from './composants/SansScenario'

/** Ton de la pastille d'issue d'une demande. */
const TON_ISSUE: Record<IssueCandidature, Tone> = {
  affecte_voeu: 'ok',
  hors_voeux: 'info',
  projete_n2: 'info',
  sans_solution: 'warn',
  irrecevable: 'neutral',
  depart_non_valide: 'warn',
  arbitrage: 'ok',
}

/** Nom complet du demandeur. */
const nomDe = (c: Candidature) => `${c.teacher.nom} ${c.teacher.prenom}`.trim()

/** Exporte la synthèse des vœux en CSV, dans l'ordre du classement. */
function exporterSynthese(candidatures: Candidature[]) {
  exporterCSV(
    'synthese-des-voeux.csv',
    [
      'Rang',
      'Matricule',
      'Nom',
      "École d'attache",
      'Recevable',
      'A',
      'Z',
      'Vœu 1',
      'Vœu 2',
      'Vœu 3',
      'Issue',
      'Détail',
    ],
    candidatures.map(x => [
      x.rangClassement,
      x.teacher.id,
      nomDe(x),
      x.ecoleOrigine.nom,
      x.recevable ? 'oui' : 'non',
      x.pointsAnciennete,
      x.pointsZoneDifficile,
      ...[0, 1, 2].map(i => {
        const voeu = x.voeux[i]
        return voeu ? `${voeu.nomEtab} (${LIBELLE_STATUT_VOEU[voeu.statut]})` : ''
      }),
      LIBELLE_ISSUE[x.issue],
      x.detailIssue,
    ]),
  )
}

/** Page « Vœux des enseignants ». */
export function VoeuxPage() {
  const { jeu } = useSession()
  const { scenario } = useScenarioAffiche()
  // Liste complète, triée par rang côté serveur : la recherche et le filtre d'issue restent instantanés.
  const candidatures = useCandidatures(jeu, scenario, { ...SANS_PAGINATION, tri: 'rangClassement' })
  const resultat = useResultat(jeu, scenario, SELECTION_NATIONALE)

  const [recherche, setRecherche] = useState('')
  const [issue, setIssue] = useState<IssueCandidature | 'toutes'>('toutes')

  const toutes = useMemo(() => candidatures.data?.elements ?? [], [candidatures.data])
  const lignes = useMemo(
    () =>
      toutes.filter(
        c =>
          (issue === 'toutes' || c.issue === issue) &&
          correspondRecherche(recherche, nomDe(c), c.teacher.id, c.ecoleOrigine.nom),
      ),
    [toutes, recherche, issue],
  )

  if (!scenario) return <SansScenario texte="La synthèse des vœux est établie à l’exécution d’un scénario." />
  if (!candidatures.data) return <EtatRequetes requetes={[candidatures]} />

  if (toutes.length === 0) {
    return (
      <Notice tone="info" title="Aucune demande de mutation dans les données.">
        Les vœux se renseignent dans le fichier des enseignants (colonnes « voeu_1 », « voeu_2 », « voeu_3 », avec le
        code des écoles sollicitées, et facultativement « motif_demande », « ecole_motif », « annees_zone_niveau_1 », «
        annees_zone_niveau_2 », « rang_tirage »). Sans vœux, seul le redéploiement obligatoire peut proposer des
        mouvements.
      </Notice>
    )
  }

  const compte = (i: IssueCandidature) => toutes.filter(x => x.issue === i).length

  const colonnes: Colonne<Candidature>[] = [
    { cle: 'rang', entete: 'Rang', numerique: true, rendu: x => fmt(x.rangClassement), tri: x => x.rangClassement },
    {
      cle: 'nom',
      entete: 'Enseignant',
      rendu: x => (
        <span>
          <strong>{nomDe(x)}</strong>
          <small>
            {x.teacher.id}
            {x.teacher.motifDemande ? ` · ${LIBELLE_MOTIF[x.teacher.motifDemande]}` : ''}
          </small>
        </span>
      ),
      tri: x => x.teacher.nom,
    },
    {
      cle: 'ecole',
      entete: 'École d’attache',
      rendu: x => (
        <span>
          {x.ecoleOrigine.nom}
          <small>
            excédent {fmt(x.ecoleOrigine.excedent)} · {fmt(x.teacher.anciennetePosteAns)} an(s) au poste
          </small>
        </span>
      ),
      tri: x => x.ecoleOrigine.nom,
    },
    { cle: 'a', entete: 'A', numerique: true, rendu: x => fmt(x.pointsAnciennete), tri: x => x.pointsAnciennete },
    { cle: 'z', entete: 'Z', numerique: true, rendu: x => fmt(x.pointsZoneDifficile), tri: x => x.pointsZoneDifficile },
    {
      cle: 'voeux',
      entete: 'Vœux (score S)',
      rendu: x => (
        <span>
          {x.voeux.map(v => (
            <small key={v.rang} className="bloc">
              {v.rang}. {v.nomEtab} —{' '}
              {v.statut === 'examine'
                ? `S = ${fmt(v.score)}${v.bonification ? ` (dont ${fmt(v.bonification)} de bonification)` : ''}`
                : LIBELLE_STATUT_VOEU[v.statut]}
            </small>
          ))}
        </span>
      ),
    },
    {
      cle: 'issue',
      entete: 'Issue',
      rendu: x => (
        <span>
          <Pill tone={TON_ISSUE[x.issue]}>{LIBELLE_ISSUE[x.issue]}</Pill>
          <small>{x.detailIssue}</small>
        </span>
      ),
      tri: x => x.issue,
    },
  ]

  return (
    <div className="stack">
      <Notice tone="info" title="Synthèse des vœux (§3.2 et §3.3).">
        Une demande est recevable si l’enseignant compte la stabilité minimale au poste et si son école d’attache est
        excédentaire. Le rang suit le classement unique : score A + Z décroissant, puis ancienneté générale, âge et rang
        de tirage. Une école retient ensuite les candidats de plus fort score S = A + Z + B.
      </Notice>

      <div className="kpi-row">
        <KpiCard
          label="Demandes de mutation"
          value={fmt(toutes.length)}
          hint={`${fmt(toutes.filter(x => x.recevable).length)} recevables`}
        />
        <KpiCard
          label="Vœux satisfaits"
          value={fmt(compte('affecte_voeu'))}
          hint="Par acceptation différée"
          tone="ok"
        />
        <KpiCard
          label="Propositions hors vœux"
          value={fmt(compte('hors_voeux'))}
          hint="Solution la plus proche, soumise à accord"
          tone="info"
        />
        <KpiCard
          label="Possibilités en N+2"
          value={fmt(compte('projete_n2'))}
          hint={
            resultat.data
              ? `${fmt(resultat.data.postesProjetesN2)} poste(s) projeté(s) après les départs prévisibles`
              : 'Postes projetés en cours de lecture'
          }
          tone="info"
        />
      </div>

      <Panel
        kicker="Demandes"
        title={`${fmt(lignes.length)} demande(s)`}
        flush
        actions={
          <button type="button" className="btn btn-sm" onClick={() => exporterSynthese(toutes)}>
            <Download size={13} aria-hidden="true" /> Exporter (CSV)
          </button>
        }
      >
        <div className="filter-bar filter-bar-integree">
          <SearchField
            value={recherche}
            onChange={setRecherche}
            label="Rechercher"
            placeholder="Nom, matricule ou école"
          />
          <div className="field">
            <label htmlFor="v-issue">Issue</label>
            <select id="v-issue" value={issue} onChange={e => setIssue(e.target.value as typeof issue)}>
              <option value="toutes">Toutes</option>
              {(Object.keys(LIBELLE_ISSUE) as IssueCandidature[]).map(i => (
                <option key={i} value={i}>
                  {LIBELLE_ISSUE[i]} ({fmt(compte(i))})
                </option>
              ))}
            </select>
          </div>
        </div>
        <DataTable
          lignes={lignes}
          colonnes={colonnes}
          cle={x => x.teacher.id}
          legende="Synthèse des vœux des enseignants"
        />
      </Panel>
    </div>
  )
}
