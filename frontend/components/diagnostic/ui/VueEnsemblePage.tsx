'use client'

/**
 * Vue d'ensemble — page de pilotage (§6 et §7).
 *
 * Objectif : qu'une personne qui ne connaît ni l'algorithme ni les statistiques
 * comprenne en moins d'une minute combien d'écoles ont besoin d'enseignants,
 * combien d'enseignants peuvent être redéployés, quelles affectations sont
 * recommandées et combien il faudra encore recruter. Chaque indicateur dit à
 * quelle situation il se rapporte et ouvre son détail. Tous les chiffres et
 * toutes les phrases viennent du serveur.
 */

import { ArrowRight, FileText, RefreshCw, Upload } from 'lucide-react'

import type { SchoolDiagnostic, SchoolSeverity } from '@shared/api'
import {
  AVERTISSEMENT_SCENARIO_ETENDU,
  classesDe,
  LIBELLE_SCOPE,
  LIBELLE_SEVERITE,
  MENTION_SIMULATION,
  libelleNiveauSous,
  selectionLevel,
} from '@shared/kernel'
import { useSession } from '@shared/session'
import { DataTable, KpiCard, Notice, Panel, fmt, fmtDec, fmtPct, type Colonne } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { AvantApres, Combo, CouvertureParScenario, Repartition } from '@shared/ui/graphiques'
import { SeveritePill } from '@shared/ui/pastilles'
import { useParametres } from '@components/parametrage'
import { useDegreAlea, useHypotheses, useTableauPlanification } from '@components/planification'
import {
  useCalculerScenariosDeBase,
  useComparaison,
  useResultat,
  useScenarioAffiche,
  useScenarios,
} from '@components/simulation'

import { useDiagnostic, usePriorites, useSynthese } from '../application/hooks'
import { LIBELLE_ETAPE, construireKpis, type Kpi } from '../application/kpis'
import { EnoncesSynthese } from './composants/EnoncesSynthese'
import { NuageEcoles } from './composants/NuageEcoles'
import { PointsAttention } from './composants/PointsAttention'
import { ZonesSecuritePanel } from './composants/ZonesSecuritePanel'

/** Nombre d'écoles prioritaires montrées sur la vue d'ensemble. */
const NB_PRIORITAIRES = 8

/** Présentation des segments de la répartition par sévérité. */
const SEGMENTS: {
  severite: SchoolSeverity
  couleur: string
  motif?: 'points' | 'hachures'
  definition: (seuils: { faible: string; important: string }) => string
}[] = [
  { severite: 'satisfaisant', couleur: 'var(--serie-3)', definition: () => 'aucun poste manquant' },
  {
    severite: 'excedent',
    couleur: 'var(--serie-2)',
    motif: 'points',
    definition: () => 'plus de maîtres que la dotation théorique D (ce dont les élèves ont besoin)',
  },
  { severite: 'deficit_faible', couleur: 'var(--serie-4)', definition: s => `jusqu’à ${s.faible} du besoin` },
  {
    severite: 'deficit_important',
    couleur: 'var(--sev-important)',
    motif: 'hachures',
    definition: s => `jusqu’à ${s.important} du besoin`,
  },
  {
    severite: 'deficit_critique',
    couleur: 'var(--sev-critique)',
    definition: s => `au-delà de ${s.important} du besoin`,
  },
]

/** Page « Vue d'ensemble ». */
export function VueEnsemblePage() {
  const { jeu, filtres, setFiltres, setPage, mode, ouvrirEcole, explorerTerritoire } = useSession()
  const { scenario, detail, calcules } = useScenarioAffiche()
  const analyste = mode === 'analyste'

  const diagnostic = useDiagnostic(jeu, filtres)
  const synthese = useSynthese(jeu, filtres, scenario)
  const priorites = usePriorites(jeu, filtres, NB_PRIORITAIRES)
  const resultat = useResultat(jeu, scenario, filtres.territoire)
  const comparaison = useComparaison(jeu, filtres.territoire)
  const parametres = useParametres(jeu)
  const scenarios = useScenarios(jeu)
  const calculBase = useCalculerScenariosDeBase(jeu)
  const hypotheses = useHypotheses(jeu)
  // L'aléa et le quota N+1 reposent sur un scénario calculé : sans lui, ils s'affichent « — ».
  const requetePlan = {
    niveau: selectionLevel(filtres.territoire),
    region: filtres.territoire.region,
    departement: filtres.territoire.departement,
    commune: filtres.territoire.commune,
    scenario: scenario ?? undefined,
  }
  const alea = useDegreAlea(calcules.length > 0 ? jeu : null, requetePlan)
  const planification = useTableauPlanification(calcules.length > 0 ? jeu : null, requetePlan)

  if (!diagnostic.data || !synthese.data) return <EtatRequetes requetes={[diagnostic, synthese]} />

  const { totals } = diagnostic.data
  const s = synthese.data
  const affiche = scenario ? (resultat.data ?? null) : null
  const resultatsComparaison = comparaison.data?.resultats ?? []
  const obsolete = (scenarios.data ?? []).some(sc => sc.obsolete)
  const niveauEnfants = libelleNiveauSous(selectionLevel(filtres.territoire))
  const seuils = parametres.data
    ? {
        faible: fmtPct(parametres.data.seuilsSeverite.faible),
        important: fmtPct(parametres.data.seuilsSeverite.important),
      }
    : { faible: '…', important: '…' }

  const voirEcoles = (patch: Partial<typeof filtres>) => {
    setFiltres({ ...filtres, ...patch })
    setPage('schools')
  }

  const colonnes: Colonne<SchoolDiagnostic>[] = [
    {
      cle: 'nom',
      entete: 'Établissement',
      rendu: d => (
        <button type="button" className="row-action" onClick={() => ouvrirEcole(d.school.id)}>
          <strong>{d.school.nom || d.school.id}</strong>
          <small>
            {d.school.commune} · {d.school.departement}
          </small>
        </button>
      ),
    },
    { cle: 'classes', entete: 'Classes', numerique: true, rendu: d => fmt(classesDe(d)) },
    { cle: 'ens', entete: 'Enseignants État', numerique: true, rendu: d => fmt(d.enseignantsEtat) },
    {
      cle: 'deficit',
      entete: 'Postes manquants',
      numerique: true,
      rendu: d => <strong>{fmt(d.besoinTheorique)}</strong>,
    },
    {
      cle: 'pression',
      entete: 'Élèves / enseignant',
      numerique: true,
      rendu: d => fmtDec(d.elevesParEnseignantEtat, 1),
    },
    { cle: 'severite', entete: 'Situation', rendu: d => <SeveritePill severite={d.severite} /> },
  ]

  const { principaux, secondaires } = construireKpis({
    totals,
    ecolesDuJeu: diagnostic.data.ecolesDuJeu,
    resultat: affiche,
    hypotheses: hypotheses.data ?? null,
    alea: alea.data ?? null,
    anneePlan: planification.data?.annees[0] ?? null,
    raisonSansResultat: affiche
      ? null
      : scenarios.isPending || (scenario !== null && resultat.isPending)
        ? 'chargement'
        : calcules.length === 0
          ? 'aucun_scenario'
          : 'situation_actuelle',
  })

  const carte = (k: Kpi) => (
    <KpiCard
      key={k.cle}
      label={k.label}
      value={k.valeur}
      hint={`${k.hint} (${LIBELLE_ETAPE[k.etape]})`}
      lien={k.disponible ? 'Voir le détail' : undefined}
      tone={k.ton}
      onClick={k.disponible ? () => setPage(k.cible) : undefined}
    />
  )

  return (
    <div className="stack">
      <Notice tone="info" title="Simulation d’aide à la décision.">
        {MENTION_SIMULATION}
      </Notice>

      {obsolete && (
        <Notice tone="warn" title="Les règles de l’analyse ont changé.">
          Les résultats affichés ont été calculés avec les anciennes règles.{' '}
          <button
            type="button"
            className="btn-link"
            disabled={calculBase.isPending}
            onClick={() => calculBase.mutate()}
          >
            Mettre à jour les simulations
          </button>
        </Notice>
      )}

      <div className="action-bar">
        <p className="hint">
          Scénario affiché : <strong>{detail?.scenario.nom ?? 'Situation actuelle'}</strong>. Les indicateurs « Après
          effets du Prince » décrivent la situation effective ; ceux « Après simulation » dépendent du scénario affiché.
        </p>
        <div className="action-bar-boutons">
          <button type="button" className="btn" onClick={() => setPage('import')}>
            <Upload size={15} aria-hidden="true" /> Importer
          </button>
          {calculBase.isPending ? (
            <span className="busy">
              <RefreshCw size={15} className="spin" aria-hidden="true" /> Calcul des scénarios…
            </span>
          ) : (
            <button
              type="button"
              className={resultatsComparaison.length === 0 ? 'btn btn-primary' : 'btn'}
              onClick={() => calculBase.mutate()}
            >
              Calculer
            </button>
          )}
          <button type="button" className="btn" onClick={() => setPage('reports')}>
            <FileText size={15} aria-hidden="true" /> Rapport
          </button>
        </div>
      </div>

      <div className="kpi-row">{principaux.map(carte)}</div>

      <h2 className="titre-section">Autres indicateurs</h2>
      <div className="kpi-row">{secondaires.map(carte)}</div>

      <Panel kicker="Synthèse" title="Ce que disent les données" id="synthese">
        <EnoncesSynthese enonces={s.syntheseTableauDeBord} afficherRegles={analyste} />
      </Panel>

      <div className="grid-main">
        <Panel
          kicker="Territoires"
          title={`Besoins par ${niveauEnfants}`}
          hint={`Postes nécessaires, part couverte par le scénario sélectionné et part restante. Cliquez sur ${niveauEnfants === 'commune' ? 'une commune' : `un ${niveauEnfants}`} pour l’explorer.`}
        >
          <Combo
            titre={`Postes nécessaires par ${niveauEnfants}`}
            series={[
              { cle: 'couverts', label: 'Couverts par redéploiement', couleur: 'var(--serie-1)' },
              { cle: 'restant', label: 'Restant à pourvoir', couleur: 'var(--serie-4)', motif: 'hachures' },
            ]}
            courbe={{
              cle: 'taux',
              label: 'Taux de couverture',
              couleur: 'var(--violet)',
              format: v => `${Math.round(v)} %`,
              max: 100,
            }}
            donnees={s.besoinsParEnfant.map(b => ({
              cle: b.territoire.code,
              label: b.territoire.nom,
              valeurs: { necessaires: b.postesNecessaires, couverts: b.couverts, restant: b.restant, taux: b.taux },
              onSelect: () => explorerTerritoire(b.territoire.nom),
            }))}
            vide="Aucun poste nécessaire à détailler sur ce périmètre."
          />
        </Panel>

        <Panel kicker="Simulation" title="Avant / Après" hint="Effet du scénario sélectionné sur le périmètre affiché.">
          {affiche ? (
            <>
              <AvantApres
                lignes={[
                  {
                    label: 'Écoles en déficit',
                    avant: affiche.before.ecolesEnDeficit,
                    apres: affiche.after.ecolesEnDeficit,
                  },
                  {
                    label: 'Postes restant à pourvoir',
                    avant: affiche.before.postesVacants,
                    apres: affiche.after.postesVacants,
                  },
                ]}
              />
              {s.reductionDeficit && <p className="phrase-forte">{s.reductionDeficit.texte}</p>}
            </>
          ) : (
            <p className="hint">
              Sélectionnez un scénario dans la barre de filtres pour comparer la situation avant et après.
            </p>
          )}
        </Panel>
      </div>

      <PointsAttention points={s.pointsAttention} />

      <Panel
        kicker="Priorités"
        title="Établissements nécessitant une attention particulière"
        hint="Classement par nombre de postes manquants, puis par pression élèves par enseignant."
        actions={
          <button type="button" className="btn btn-sm" onClick={() => setPage('priorites')}>
            Voir toutes les écoles prioritaires <ArrowRight size={13} aria-hidden="true" />
          </button>
        }
        flush
      >
        {priorites.data ? (
          <DataTable
            lignes={priorites.data.ecoles}
            colonnes={colonnes}
            cle={d => d.school.id}
            taillePage={NB_PRIORITAIRES}
            legende="Établissements présentant les déficits les plus élevés"
            messageVide="Aucun établissement en déficit sur ce périmètre."
          />
        ) : (
          <EtatRequetes requetes={[priorites]} />
        )}
      </Panel>

      {analyste && (
        <>
          <h2 className="titre-section">Détail technique (Vue analyste)</h2>

          <ZonesSecuritePanel zones={s.parZoneSecurite} onVoirEcoles={zone => voirEcoles({ zonesSecurite: [zone] })} />

          <div className="grid-main">
            <Panel
              kicker="Diagnostic"
              title="Situation des écoles"
              hint="Répartition des établissements selon l’ampleur de leur déficit."
            >
              <Repartition
                titre="Répartition des établissements par situation"
                segments={SEGMENTS.map(seg => ({
                  cle: seg.severite,
                  label: LIBELLE_SEVERITE[seg.severite],
                  valeur: s.parSeverite[seg.severite],
                  couleur: seg.couleur,
                  motif: seg.motif,
                  definition: seg.definition(seuils),
                  onSelect: () => setFiltres({ ...filtres, severites: [seg.severite] }),
                }))}
              />
            </Panel>

            <Panel
              kicker="Scénarios"
              title="Couverture par scénario"
              hint="Ce que chaque périmètre géographique permettrait de couvrir. Aucun scénario n’est présenté comme préférable."
              actions={
                resultatsComparaison.length > 0 ? (
                  <button type="button" className="btn btn-sm" onClick={() => setPage('comparison')}>
                    Tableau comparatif
                  </button>
                ) : undefined
              }
            >
              <CouvertureParScenario
                scenarios={resultatsComparaison.map(r => ({
                  cle: r.scenarioId,
                  label: LIBELLE_SCOPE[r.scope],
                  couverts: r.postesCouverts,
                  residuel: r.besoinResiduel,
                  taux: r.tauxCouverture,
                }))}
              />
              {resultatsComparaison.some(r => r.scope === 'etendu') && (
                <p className="hint">{AVERTISSEMENT_SCENARIO_ETENDU}</p>
              )}
            </Panel>
          </div>

          <NuageEcoles
            ecoles={diagnostic.data.ecoles}
            elevesParMaitre={parametres.data?.besoin.elevesParMaitre ?? null}
            onOuvrirEcole={ouvrirEcole}
          />
        </>
      )}
    </div>
  )
}
