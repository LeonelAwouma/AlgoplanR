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
import { useScenarioAffiche } from '@components/simulation'
import type {
  AleaParSituation,
  AnneeAttrition,
  AnneeExport,
  DefinitionIndicateur,
  EnfantTerritoire,
  FiltresRapportTerritorial,
  FormatExport,
  IndicateursTerritoire,
  TerritorySelection,
  ValeurIndicateur,
} from '@shared/api'
import { telechargerFichier } from '@shared/exports/export-csv'
import { descendre, selectionLevel } from '@shared/kernel'
import { useSession } from '@shared/session'
import { DataTable, KpiCard, Notice, Panel, fmt, fmtDec, type Colonne } from '@shared/ui/commun'
import { TerritoryBreadcrumb } from '@shared/ui/coquille'
import { EtatRequetes } from '@shared/ui/etats'

import { useExporterRapportTerritorial, useRapportTerritorial } from '../application/hooks'

/**
 * Sélection territoriale des filtres globaux et scénario affiché → filtres de la synthèse (`null`/absent
 * n'envoie pas le paramètre). Le même objet sert à l'affichage et aux exports : mêmes chiffres.
 */
function filtresDe(selection: TerritorySelection, scenario: string | null): FiltresRapportTerritorial {
  return {
    region: selection.region ?? undefined,
    departement: selection.departement ?? undefined,
    commune: selection.commune ?? undefined,
    scenario: scenario ?? undefined,
  }
}

/** Taux d'encadrement : des élèves par enseignant, jamais un pourcentage. */
function celluleEncadrement(v: ValeurIndicateur | undefined): string {
  if (!v) return '—'
  if (v.statut === 'sans_objet') return 'Sans objet'
  if (v.statut === 'non_disponible') return 'Non disponible'
  return v.taux === null ? '—' : fmtDec(v.taux, 1)
}

const UNITE_ENCADREMENT = 'élèves par enseignant'

/** Taux d'un indicateur de couverture/encadrement, « — » ou « Sans objet » quand il n'est pas calculable. */
function celluleTaux(v: ValeurIndicateur | undefined, decimales = 1): string {
  if (!v) return '—'
  if (v.statut === 'sans_objet') return 'Sans objet'
  if (v.statut === 'non_disponible') return 'Non disponible'
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
      valeur: celluleEncadrement(noeud.encadrement.apresSimulation),
      hint: `${UNITE_ENCADREMENT}, après simulation (Σ élèves ÷ Σ enseignants).`,
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
    {
      libelle: "Degré d'aléa",
      valeur: celluleAlea(noeud.alea),
      hint: '1 − R² (enseignants ~ élèves), après simulation.',
    },
    {
      libelle: 'Attrition N+1',
      valeur: celluleAttritionN1(noeud.attrition.annees.n1),
      hint: noeud.attrition.referenceM1
        ? `Modèle M1 : ${fmtDec(noeud.attrition.referenceM1.attritionTotalePct, 2)} % ± ${fmtDec(noeud.attrition.referenceM1.intervalleConfiancePoints, 2)} pt au national (hypothèse, pas un taux observé).`
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

type Ventilation = NonNullable<FiltresRapportTerritorial['niveau']> | 'auto'

const LIBELLE_VENTILATION: Record<Exclude<Ventilation, 'auto'>, string> = {
  region: 'Par région',
  departement: 'Par département',
  commune: 'Par arrondissement',
  ecole: 'Par école',
  iaeb: 'Par IAEB',
}

/** Ventilations possibles : seulement les niveaux situés sous le périmètre choisi. */
function ventilationsPossibles(niveau: ReturnType<typeof selectionLevel>): Exclude<Ventilation, 'auto'>[] {
  const ordre: Exclude<Ventilation, 'auto'>[] = ['region', 'departement', 'commune', 'ecole']
  const rang = { national: 0, region: 1, departement: 2, commune: 3, ecole: 4 }[niveau]
  return ordre.slice(rang)
}

const ANNEES_EXPORT: { valeur: AnneeExport | ''; libelle: string }[] = [
  { valeur: '', libelle: 'Toutes les années (N+1 à N+5)' },
  { valeur: 'n1', libelle: 'N+1' },
  { valeur: 'n2', libelle: 'N+2' },
  { valeur: 'n3', libelle: 'N+3' },
  { valeur: 'n4', libelle: 'N+4' },
  { valeur: 'n5', libelle: 'N+5' },
]

/**
 * Panneau « Exporter ce périmètre » : périmètre (filtres globaux), ventilation, indicateur, scénario affiché,
 * année et format. Le fichier est produit par le serveur à partir des mêmes fonctions que l'affichage.
 */
function PanneauExport({
  filtres,
  titre,
  niveau,
  scenarioId,
  registre,
  estDrh,
}: {
  filtres: FiltresRapportTerritorial
  titre: string
  niveau: ReturnType<typeof selectionLevel>
  scenarioId: string
  registre: DefinitionIndicateur[]
  estDrh: boolean
}) {
  const { jeu } = useSession()
  const [format, setFormat] = useState<FormatExport>('xlsx')
  const [ventilation, setVentilation] = useState<Ventilation>('auto')
  const [indicateur, setIndicateur] = useState('')
  const [annee, setAnnee] = useState<AnneeExport | ''>('')
  const telechargement = useExporterRapportTerritorial(jeu)
  const ventilations = ventilationsPossibles(niveau)
  const ventilationEffective = ventilation !== 'auto' && ventilations.includes(ventilation) ? ventilation : 'auto'

  function exporter(national: boolean) {
    telechargement.mutate(
      {
        filtres: { ...filtres, niveau: ventilationEffective === 'auto' ? undefined : ventilationEffective },
        options: {
          format,
          type: national ? 'nationalComplet' : 'perimetre',
          indicateur: indicateur || undefined,
          annee: annee || undefined,
        },
      },
      { onSuccess: f => telechargerFichier(f.contenu, f.nomFichier, f.contenu.type) },
    )
  }

  const icone = telechargement.isPending ? (
    <RefreshCw size={13} className="spin" aria-hidden="true" />
  ) : (
    <Download size={13} aria-hidden="true" />
  )

  return (
    <Panel
      kicker="Export"
      title="Exporter ce périmètre"
      hint={`Le fichier reprend exactement les chiffres affichés : périmètre « ${titre} », scénario ${scenarioId}. Les écoles sont toutes incluses (aucune pagination).`}
    >
      <div className="filter-bar">
        <div className="field">
          <label htmlFor="export-ventilation">Type de rapport</label>
          <select
            id="export-ventilation"
            value={ventilationEffective}
            onChange={e => setVentilation(e.target.value as Ventilation)}
          >
            <option value="auto">Niveau inférieur du périmètre</option>
            {ventilations.map(v => (
              <option key={v} value={v}>
                {LIBELLE_VENTILATION[v]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="export-indicateur">Indicateur</label>
          <select id="export-indicateur" value={indicateur} onChange={e => setIndicateur(e.target.value)}>
            <option value="">Tous les indicateurs</option>
            {registre.map(d => (
              <option key={d.code} value={d.code}>
                {d.intitule}
                {d.unite ? ` (${d.unite})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="export-annee">Année de projection</label>
          <select id="export-annee" value={annee} onChange={e => setAnnee(e.target.value as AnneeExport | '')}>
            {ANNEES_EXPORT.map(a => (
              <option key={a.valeur} value={a.valeur}>
                {a.libelle}
              </option>
            ))}
          </select>
        </div>
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
          <button
            type="button"
            className="btn btn-sm"
            disabled={telechargement.isPending}
            onClick={() => exporter(false)}
          >
            {icone} Exporter ce périmètre
          </button>
          {estDrh && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={telechargement.isPending}
              onClick={() => exporter(true)}
            >
              {icone} Export national complet
            </button>
          )}
        </div>
      </div>
      {telechargement.isPending && (
        <p className="hint">
          Génération en cours… Un export national complet (toutes les régions, tous les départements, tous les
          arrondissements et toutes les écoles) peut prendre plusieurs minutes sur un jeu national : ne fermez pas cette
          page.
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
  // Navigation = filtres globaux de l'application : changer de territoire ici met à jour la barre de filtres, et
  // inversement. Aucune sélection locale qui pourrait diverger.
  const { filtres: filtresGlobaux, setFiltres } = useSession()
  const selection = filtresGlobaux.territoire
  const setSelection = (territoire: TerritorySelection) => setFiltres({ ...filtresGlobaux, territoire })
  const { scenario } = useScenarioAffiche()
  const filtres = filtresDe(selection, scenario)

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
          <button
            type="button"
            className="row-action"
            onClick={() => setSelection(descendre(selection, e.territoire.nom))}
          >
            <strong>{e.territoire.nom}</strong>
          </button>
        ),
      tri: e => e.territoire.nom,
    },
    { cle: 'ecoles', entete: 'Écoles', numerique: true, rendu: e => fmt(e.nbEcoles), tri: e => e.nbEcoles },
    {
      cle: 'encadrement',
      entete: 'Encadrement (élèves/enseignant)',
      numerique: true,
      rendu: e => celluleEncadrement(e.encadrement.apresSimulation),
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
        Tous les chiffres viennent du serveur AlgoPlanR : aucun calcul ne se fait dans le navigateur. « Après simulation
        » tient compte des faits du Prince et du scénario retenu. Une valeur « Sans objet » ou « Non calculable » n’est
        jamais inventée : quand elle existe, la raison est indiquée à la place de la valeur.
      </Notice>

      <TerritoryBreadcrumb selection={selection} onSelect={setSelection} />

      <Panel kicker={r.libelleNiveau} title={r.titre} hint={`Scénario ${r.scenarioId}.`}>
        <StatsNoeud noeud={r.noeud} />
      </Panel>

      <Panel
        kicker="Exploration"
        title={`${LIBELLE_NIVEAU_ENFANTS[r.niveauEnfants] ?? 'Territoires'}s`}
        hint={`${
          estEcole ? 'Détail des établissements de cet arrondissement.' : 'Cliquez sur un territoire pour l’explorer.'
        } Encadrement en ${UNITE_ENCADREMENT} ; couvertures en %.`}
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

      <PanneauExport
        filtres={filtres}
        titre={r.titre}
        niveau={selectionLevel(selection)}
        scenarioId={r.scenarioId}
        registre={r.registreIndicateurs}
        estDrh={estDrh}
      />
    </div>
  )
}
