'use client'

/**
 * Bases générées après application des faits du Prince, consultables directement : établissements, enseignants et
 * journal des décisions. Ce sont les trois livrables exportables, lus à l'écran. Chaque ligne est celle du classeur
 * correspondant ; ce sont des bases dérivées pour simulation, non des décisions administratives mises en œuvre.
 */

import { useState } from 'react'
import { ArrowRight, Download, RefreshCw } from 'lucide-react'

import {
  messageErreur,
  type BaseApresPrince,
  type IdJeu,
  type LigneEnseignantApresPrince,
  type LigneEtablissementApresPrince,
  type LigneJournalPrince,
} from '@shared/api'
import { telechargerFichier } from '@shared/exports/export-csv'
import { DataTable, Notice, Panel, Pill, SearchField, fmt, fmtDec, type Colonne } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { Onglets } from '@shared/ui/Onglets'
import { Pagination } from '@shared/ui/Pagination'

import { useBaseApresPrince, useTelechargerBaseApresPrince } from '../../application/hooks'

const TAILLE_PAGE = 50
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const ONGLETS = [
  { cle: 'etablissements', libelle: 'Établissements après Prince' },
  { cle: 'enseignants', libelle: 'Enseignants après Prince' },
  { cle: 'journal', libelle: 'Journal des décisions' },
] as const

/** « avant → après » ; une valeur identique n'est écrite qu'une fois. */
function avantApres(avant: number | null, apres: number | null, decimales = 0): string {
  const f = (v: number | null) => (decimales ? fmtDec(v, decimales) : fmt(v))
  return avant === apres ? f(apres) : `${f(avant)} → ${f(apres)}`
}

function colonnesEtablissements(onOuvrirEcole: (id: string) => void): Colonne<LigneEtablissementApresPrince>[] {
  return [
    {
      cle: 'ecole',
      entete: 'Établissement',
      tri: l => l.nom_etab,
      rendu: l => (
        <button type="button" className="row-action" onClick={() => onOuvrirEcole(l.Identifiant_Ecole)}>
          <strong>{l.nom_etab || l.Identifiant_Ecole}</strong>
          <small>
            {l.Commune} · {l.Identifiant_Ecole}
          </small>
        </button>
      ),
    },
    { cle: 'eleves', entete: 'Élèves', numerique: true, rendu: l => fmt(l.Effectif_Eleves_Attendus) },
    {
      cle: 'ens',
      entete: 'Enseignants',
      numerique: true,
      tri: l => l.Enseignants_Apres_Prince,
      rendu: l => <strong>{avantApres(l.Enseignants_Avant_Prince, l.Enseignants_Apres_Prince)}</strong>,
    },
    {
      cle: 'rem',
      entete: 'Encadrement',
      numerique: true,
      rendu: l => avantApres(l.REM_Avant, l.REM_Apres, 1),
    },
    {
      cle: 'besoin',
      entete: 'Besoin',
      numerique: true,
      tri: l => l.Besoin_Apres,
      rendu: l => avantApres(l.Besoin_Avant, l.Besoin_Apres),
    },
    {
      cle: 'prince',
      entete: 'Prince',
      tri: l => l.Touche_Par_Prince,
      rendu: l => (l.Touche_Par_Prince === 'OUI' ? <Pill tone="info">Touchée</Pill> : <span>—</span>),
    },
  ]
}

const colonnesEnseignants: Colonne<LigneEnseignantApresPrince>[] = [
  {
    cle: 'ens',
    entete: 'Enseignant',
    tri: l => l.nom,
    rendu: l => (
      <span>
        <strong>{`${l.nom ?? ''} ${l.prenom ?? ''}`.trim() || l.Matricule_Enseignant}</strong>
        <small>{l.Matricule_Enseignant}</small>
      </span>
    ),
  },
  {
    cle: 'mouvement',
    entete: 'École',
    tri: l => l.Ecole_Attache_Actuelle,
    rendu: l =>
      l.Ecole_Origine_Prince && l.Ecole_Origine_Prince !== l.Ecole_Attache_Actuelle ? (
        <span>
          {l.Ecole_Origine_Prince} <ArrowRight size={11} aria-hidden="true" />{' '}
          <strong>{l.Ecole_Attache_Actuelle}</strong>
        </span>
      ) : (
        l.Ecole_Attache_Actuelle
      ),
  },
  {
    cle: 'region',
    entete: 'Région',
    tri: l => l.Region_Apres_Decision ?? '',
    rendu: l =>
      l.Region_Initiale && l.Region_Apres_Decision && l.Region_Initiale !== l.Region_Apres_Decision ? (
        <span>
          {l.Region_Initiale} <ArrowRight size={11} aria-hidden="true" /> <strong>{l.Region_Apres_Decision}</strong>
          <small>initiale → après décision</small>
        </span>
      ) : (
        (l.Region_Apres_Decision ?? '—')
      ),
  },
  { cle: 'ss', entete: 'Sous-système', rendu: l => l.Sous_Systeme_Formation || '—' },
  {
    cle: 'statut',
    entete: 'Décision',
    tri: l => l.Statut_Prince,
    rendu: l =>
      l.Statut_Prince ? (
        <Pill tone={l.Statut_Prince.startsWith('Rejet') ? 'warn' : l.Statut_Prince.includes('alerte') ? 'info' : 'ok'}>
          {l.Statut_Prince}
        </Pill>
      ) : (
        '—'
      ),
  },
  { cle: 'ref', entete: 'Référence', rendu: l => l.Reference_Decision || '—' },
]

const colonnesJournal: Colonne<LigneJournalPrince>[] = [
  { cle: 'ordre', entete: '#', numerique: true, tri: l => l.Ordre, rendu: l => fmt(l.Ordre) },
  {
    cle: 'ens',
    entete: 'Enseignant',
    tri: l => l.Nom_Enseignant,
    rendu: l => (
      <span>
        <strong>{l.Nom_Enseignant || l.Matricule_Enseignant}</strong>
        <small>{l.Matricule_Enseignant}</small>
      </span>
    ),
  },
  {
    cle: 'mouvement',
    entete: 'Redéploiement',
    rendu: l => (
      <span>
        {l.Nom_Ecole_Origine || l.Ecole_Origine || '—'} <ArrowRight size={11} aria-hidden="true" />{' '}
        {l.Nom_Ecole_Destination || l.Ecole_Destination}
      </span>
    ),
  },
  {
    cle: 'statut',
    entete: 'Statut',
    tri: l => l.Statut,
    rendu: l => (
      <Pill tone={l.Statut.startsWith('Rejet') ? 'alert' : l.Statut.includes('alerte') ? 'warn' : 'ok'}>
        {l.Statut}
      </Pill>
    ),
  },
  {
    cle: 'motifs',
    entete: 'Alertes et motifs',
    rendu: l => <small className="motif-etroit">{l.Motifs_Rejet || l.Alertes || '—'}</small>,
  },
]

/** Contenu d'un onglet : filtres, tableau paginé par le serveur et export. */
function TableauBase({
  jeu,
  base,
  onOuvrirEcole,
}: {
  jeu: IdJeu
  base: BaseApresPrince
  onOuvrirEcole: (id: string) => void
}) {
  const [concernes, setConcernes] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [page, setPage] = useState(1)
  const filtres = { concernes: base !== 'journal' && concernes, recherche }
  const demande = { page, taille: TAILLE_PAGE }
  const donnees = useBaseApresPrince(jeu, base, filtres, demande)
  const telechargement = useTelechargerBaseApresPrince(jeu)

  function exporter() {
    // L'export est toujours celui de la base complète, comme le fichier à réimporter.
    telechargement.mutate(
      { base, filtres: {} },
      { onSuccess: f => telechargerFichier(f.contenu, f.nomFichier, MIME_XLSX) },
    )
  }

  return (
    <div className="stack">
      <div className="filter-bar">
        <SearchField
          label="Rechercher"
          value={recherche}
          onChange={v => {
            setRecherche(v)
            setPage(1)
          }}
          placeholder={base === 'etablissements' ? 'Code, nom ou commune' : 'Matricule, nom ou école'}
        />
        {base !== 'journal' && (
          <div className="field">
            <label htmlFor={`concernes-${base}`}>Afficher</label>
            <select
              id={`concernes-${base}`}
              value={concernes ? 'concernes' : 'tout'}
              onChange={e => {
                setConcernes(e.target.value === 'concernes')
                setPage(1)
              }}
            >
              <option value="concernes">Seulement les éléments concernés par le Prince</option>
              <option value="tout">Toute la base</option>
            </select>
          </div>
        )}
        <div className="filter-bar-actions">
          <button type="button" className="btn btn-sm" disabled={telechargement.isPending} onClick={exporter}>
            {telechargement.isPending ? (
              <RefreshCw size={13} className="spin" aria-hidden="true" />
            ) : (
              <Download size={13} aria-hidden="true" />
            )}{' '}
            Exporter (Excel)
          </button>
        </div>
      </div>

      {telechargement.error && <Notice tone="alert">{messageErreur(telechargement.error)}</Notice>}

      {!donnees.data ? (
        <EtatRequetes requetes={[donnees]} />
      ) : base === 'etablissements' ? (
        <DataTable
          lignes={donnees.data.elements as LigneEtablissementApresPrince[]}
          colonnes={colonnesEtablissements(onOuvrirEcole)}
          cle={l => l.Identifiant_Ecole}
          taillePage={TAILLE_PAGE}
          legende="Établissements après application des faits du Prince"
          messageVide={
            concernes
              ? 'Aucun établissement n’est touché par un fait du Prince.'
              : 'Aucun établissement ne correspond à cette recherche.'
          }
        />
      ) : base === 'enseignants' ? (
        <DataTable
          lignes={donnees.data.elements as LigneEnseignantApresPrince[]}
          colonnes={colonnesEnseignants}
          cle={l => l.Matricule_Enseignant}
          taillePage={TAILLE_PAGE}
          legende="Enseignants après application des faits du Prince"
          messageVide={
            concernes
              ? 'Aucun enseignant n’est visé par un fait du Prince.'
              : 'Aucun enseignant ne correspond à cette recherche.'
          }
        />
      ) : (
        <DataTable
          lignes={donnees.data.elements as LigneJournalPrince[]}
          colonnes={colonnesJournal}
          cle={l => String(l.Ordre)}
          taillePage={TAILLE_PAGE}
          legende="Journal des décisions du Prince"
          messageVide="Aucune décision à afficher."
        />
      )}
      {donnees.data && <Pagination page={donnees.data} onPage={setPage} />}
    </div>
  )
}

/** Panneau « Bases après Prince ». */
export function BasesApresPrince({ jeu, onOuvrirEcole }: { jeu: IdJeu; onOuvrirEcole: (id: string) => void }) {
  const [onglet, setOnglet] = useState<BaseApresPrince>('etablissements')
  return (
    <Panel
      kicker="Bases générées"
      title="Bases après application des faits du Prince"
      hint="Base dérivée pour simulation : les décisions du Prince y sont appliquées aux données importées. Ce n’est pas une décision administrative mise en œuvre. Chaque tableau est exportable en Excel."
    >
      <Onglets onglets={ONGLETS} actif={onglet} onChange={setOnglet} libelle="Bases après Prince">
        <TableauBase key={onglet} jeu={jeu} base={onglet} onOuvrirEcole={onOuvrirEcole} />
      </Onglets>
    </Panel>
  )
}
