'use client'

/**
 * Synthèse territoriale (lot 4) : navigation Cameroun → Région → Département → Arrondissement → École, taux
 * d'encadrement, couverture des besoins (deux indicateurs distincts), couverture des écoles de plus de 100
 * élèves, attrition (modèle M1) et degré d'aléa — tout est calculé par le serveur Django, pour le périmètre,
 * le scénario et l'année affichés. Les exports Excel et Word proviennent des mêmes fonctions : mêmes chiffres
 * que ce tableau de bord, pour les mêmes paramètres.
 *
 * « Arrondissement » est le niveau `commune` du jeu (décision du lot 4) ; l'export national complet,
 * exhaustif, est réservé au DRH et peut prendre plusieurs minutes sur un jeu national — aucun délai n'est
 * imposé côté client, l'écran l'annonce.
 */

import { useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'

import { useUtilisateur } from '@components/acces'
import type {
  AleaParSituation,
  AnneeAttrition,
  EnfantTerritoire,
  FiltresRapportTerritorial,
  FormatExport,
  IndicateursTerritoire,
  TerritorySelection,
  ValeurIndicateur,
} from '@shared/api'
import { telechargerFichier } from '@shared/exports/export-csv'
import { descendre, SELECTION_NATIONALE } from '@shared/kernel'
import { useSession } from '@shared/session'
import { DataTable, KpiCard, Notice, Panel, fmt, fmtDec, type Colonne } from '@shared/ui/commun'
import { TerritoryBreadcrumb } from '@shared/ui/coquille'
import { EtatRequetes } from '@shared/ui/etats'

import { useExporterRapportTerritorial, useRapportTerritorial } from '../application/hooks'

/** Sélection territoriale → filtres de la synthèse (`null`/absent n'envoie pas le paramètre). */
function filtresDe(selection: TerritorySelection): FiltresRapportTerritorial {
  return {
    region: selection.region ?? undefined,
    departement: selection.departement ?? undefined,
    commune: selection.commune ?? undefined,
  }
}

/** Taux d'un indicateur de couverture/encadrement, « — » ou « Sans objet » quand il n'est pas calculable. */
function celluleTaux(v: ValeurIndicateur | undefined, decimales = 1): string {
  if (!v) return '—'
  if (v.statut === 'sansObjet') return 'Sans objet'
  return v.taux === null ? '—' : `${fmtDec(v.taux, decimales)} %`
}

function celluleAlea(bloc: AleaParSituation | undefined): string {
  const v = bloc?.apresSimulation
  if (!v || v.valeur === null) return v?.raison ?? 'Non calculable'
  return v.statut === 'indicatif' ? `${fmtDec(v.valeur, 2)} (indicatif)` : fmtDec(v.valeur, 2)
}

function celluleAttritionN1(annee: AnneeAttrition | undefined): string {
  if (!annee || annee.tauxPct === null) return '—'
  return `${fmtDec(annee.tauxPct, 2)} %`
}

const LIBELLE_NIVEAU_ENFANTS: Record<string, string> = {
  region: 'Région',
  departement: 'Département',
  commune: 'Arrondissement',
  ecole: 'École',
  iaeb: 'IAEB',
}

/** Panneau de statistiques du territoire courant (le « nœud »). */
function StatsNoeud({ noeud }: { noeud: IndicateursTerritoire }) {
  const cartes: { libelle: string; valeur: string; hint: string }[] = [
    {
      libelle: "Taux d'encadrement",
      valeur: noeud.encadrement.apresSimulation.taux === null ? '—' : fmtDec(noeud.encadrement.apresSimulation.taux, 1),
      hint: 'Élèves par enseignant, après simulation (Σ élèves ÷ Σ enseignants).',
    },
    {
      libelle: 'Couverture globale des besoins',
      valeur: celluleTaux(noeud.couvertureGlobale.apresSimulation),
      hint: "Part des postes manquants à l'import résorbés à ce jour (base constante).",
    },
    {
      libelle: 'Couverture opérationnelle',
      valeur: celluleTaux(noeud.couvertureOperationnelle.apresSimulation),
      hint: 'Part des postes restants après le Prince couverts par les affectations ordinaires.',
    },
    {
      libelle: 'Couverture PAREC',
      valeur: celluleTaux(noeud.couvertureParec.apresSimulation),
      hint: 'Écoles de plus de 100 élèves avec au moins 3 enseignants déclarés.',
    },
    { libelle: "Degré d'aléa", valeur: celluleAlea(noeud.alea), hint: '1 − R² (enseignants ~ élèves), après simulation.' },
    {
      libelle: 'Attrition N+1',
      valeur: celluleAttritionN1(noeud.attrition.annees.n1),
      hint: noeud.attrition.referenceM1
        ? `Modèle M1 : ${fmtDec(noeud.attrition.referenceM1.attritionTotalePct, 2)} % ± ${noeud.attrition.referenceM1.intervalleConfiancePoints} pt au national (hypothèse, pas un taux observé).`
        : (noeud.attrition.note ?? 'Hypothèse héritée de la région.'),
    },
  ]
  return (
    <div className="kpi-row">
      {cartes.map(c => (
        <KpiCard key={c.libelle} label={c.libelle} value={c.valeur} hint={c.hint} />
      ))}
    </div>
  )
}

/** Panneau de déclenchement des exports Excel / Word. */
function PanneauExport({ filtres, estDrh }: { filtres: FiltresRapportTerritorial; estDrh: boolean }) {
  const { jeu } = useSession()
  const [format, setFormat] = useState<FormatExport>('xlsx')
  const telechargement = useExporterRapportTerritorial(jeu)

  function exporter(national: boolean) {
    telechargement.mutate(
      { filtres, options: { format, type: national ? 'nationalComplet' : 'perimetre' } },
      { onSuccess: f => telechargerFichier(f.contenu, f.nomFichier, f.contenu.type) },
    )
  }

  return (
    <Panel
      kicker="Export"
      title="Exporter ce périmètre"
      hint="Le fichier reprend exactement les chiffres affichés ci-dessus : même périmètre, même scénario, mêmes valeurs."
    >
      <div className="filter-bar">
        <div className="field">
          <label htmlFor="format-export-territorial">Format</label>
          <select
            id="format-export-territorial"
            value={format}
            onChange={e => setFormat(e.target.value as FormatExport)}
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="docx">Word (.docx)</option>
          </select>
        </div>
        <div className="filter-bar-actions">
          <button type="button" className="btn btn-sm" disabled={telechargement.isPending} onClick={() => exporter(false)}>
            {telechargement.isPending ? (
              <RefreshCw size={13} className="spin" aria-hidden="true" />
            ) : (
              <Download size={13} aria-hidden="true" />
            )}{' '}
            Exporter ce périmètre
          </button>
          {estDrh && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={telechargement.isPending}
              onClick={() => exporter(true)}
            >
              {telechargement.isPending ? (
                <RefreshCw size={13} className="spin" aria-hidden="true" />
              ) : (
                <Download size={13} aria-hidden="true" />
              )}{' '}
              Export national complet
            </button>
          )}
        </div>
      </div>
      {telechargement.isPending && (
        <p className="hint">
          Génération en cours… Un export national complet (toutes les régions, tous les départements, tous les
          arrondissements et toutes les écoles) peut prendre plusieurs minutes sur un jeu national : ne fermez pas
          cette page.
        </p>
      )}
      {telechargement.isError && (
        <Notice tone="alert" title="L'export a échoué.">
          {telechargement.error instanceof Error ? telechargement.error.message : 'Réessayez dans un instant.'}
        </Notice>
      )}
    </Panel>
  )
}

/** Page « Synthèse territoriale ». */
export function SyntheseTerritorialePage() {
  const { jeu } = useSession()
  const utilisateur = useUtilisateur()
  const estDrh = utilisateur?.role === 'drh'
  const [selection, setSelection] = useState<TerritorySelection>(SELECTION_NATIONALE)
  const filtres = filtresDe(selection)

  const requete = useRapportTerritorial(jeu, filtres)

  if (!requete.data) return <EtatRequetes requetes={[requete]} />
  const r = requete.data

  const estEcole = r.niveauEnfants === 'ecole'
  const colonnes: Colonne<EnfantTerritoire>[] = [
    {
      cle: 'nom',
      entete: LIBELLE_NIVEAU_ENFANTS[r.niveauEnfants] ?? 'Territoire',
      rendu: e =>
        estEcole ? (
          <strong>{e.territoire.nom}</strong>
        ) : (
          <button type="button" className="row-action" onClick={() => setSelection(descendre(selection, e.territoire.nom))}>
            <strong>{e.territoire.nom}</strong>
          </button>
        ),
      tri: e => e.territoire.nom,
    },
    { cle: 'ecoles', entete: 'Écoles', numerique: true, rendu: e => fmt(e.nbEcoles), tri: e => e.nbEcoles },
    {
      cle: 'encadrement',
      entete: "Taux d'encadrement",
      numerique: true,
      rendu: e => celluleTaux(e.encadrement.apresSimulation),
      tri: e => e.encadrement.apresSimulation.taux ?? -1,
    },
    {
      cle: 'couverture-globale',
      entete: 'Couverture globale',
      numerique: true,
      rendu: e => celluleTaux(e.couvertureGlobale.apresSimulation),
      tri: e => e.couvertureGlobale.apresSimulation.taux ?? -1,
    },
    {
      cle: 'couverture-operationnelle',
      entete: 'Couverture opérationnelle',
      numerique: true,
      rendu: e => celluleTaux(e.couvertureOperationnelle.apresSimulation),
      tri: e => e.couvertureOperationnelle.apresSimulation.taux ?? -1,
    },
    {
      cle: 'parec',
      entete: 'Couverture PAREC',
      numerique: true,
      rendu: e => celluleTaux(e.couvertureParec.apresSimulation),
      tri: e => e.couvertureParec.apresSimulation.taux ?? -1,
    },
    {
      cle: 'alea',
      entete: "Degré d'aléa",
      numerique: true,
      rendu: e => celluleAlea(e.alea),
      tri: e => e.alea.apresSimulation.valeur ?? -1,
    },
    {
      cle: 'attrition',
      entete: 'Attrition N+1',
      numerique: true,
      rendu: e => celluleAttritionN1(e.attrition.annees.n1),
      tri: e => e.attrition.annees.n1.tauxPct ?? -1,
    },
  ]

  return (
    <div className="stack">
      <Notice tone="info" title="Comment lire cette page.">
        Tous les chiffres viennent du serveur AlgoPlanR : aucun calcul ne se fait dans le navigateur. « Après
        simulation » tient compte des faits du Prince et du scénario retenu. Une valeur « Sans objet » ou « Non
        calculable » n'est jamais inventée : la raison est donnée au survol.
      </Notice>

      <TerritoryBreadcrumb selection={selection} onSelect={setSelection} />

      <Panel kicker={r.libelleNiveau} title={r.titre} hint={`Scénario ${r.scenarioId}.`}>
        <StatsNoeud noeud={r.noeud} />
      </Panel>

      <Panel
        kicker="Exploration"
        title={`${LIBELLE_NIVEAU_ENFANTS[r.niveauEnfants] ?? 'Territoires'}s`}
        hint={estEcole ? 'Détail des établissements de cet arrondissement.' : 'Cliquez sur un territoire pour l’explorer.'}
        flush
      >
        <DataTable
          lignes={r.enfants}
          colonnes={colonnes}
          cle={e => e.territoire.code}
          taillePage={25}
          legende="Indicateurs par territoire"
          messageVide="Aucun territoire ne correspond à ce périmètre."
        />
      </Panel>

      <PanneauExport filtres={filtres} estDrh={estDrh} />
    </div>
  )
}
