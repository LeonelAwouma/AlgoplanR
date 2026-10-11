'use client'

/**
 * Liste des enseignants.
 *
 * La colonne « Mobilisable » explique, enseignant par enseignant, pourquoi il
 * entre ou non dans le vivier de redéploiement du scénario affiché : c'est la
 * traduction lisible de la règle d'excédent, appliquée par le serveur.
 */

import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'

import { SANS_PAGINATION, type EnseignantResume } from '@shared/api'
import { exporterCSV } from '@shared/exports/export-csv'
import { correspondRecherche } from '@shared/kernel'
import { useSession } from '@shared/session'
import { DataTable, Notice, Panel, Pill, SearchField, fmt, fmtDec, type Colonne } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { useScenarioAffiche } from '@components/simulation'

import { useEnseignants } from '../application/hooks'
import { DetailBareme } from './composants/DetailBareme'

type FiltreMobilisable = 'tous' | 'oui' | 'non'

/** Âge en années révolues, `null` si inconnu. */
function ageRevolu(ligne: EnseignantResume): number | null {
  return ligne.teacher.age == null ? null : Math.floor(ligne.teacher.age)
}

/** Explication des points de situation familiale. */
function commentairePointsSituation(ligne: EnseignantResume): string {
  const { situation, teacher } = ligne
  if (situation.points > 0) return `${situation.points} point(s) au barème`
  if (situation.reconnue) return 'aucun point paramétré'
  return teacher.situationFamiliale.trim() ? 'valeur non reconnue : 0 point' : 'non renseignée : 0 point'
}

/** Exporte la liste affichée en CSV. */
function exporterListe(lignes: EnseignantResume[]) {
  exporterCSV(
    'enseignants.csv',
    [
      'Matricule',
      'Nom',
      'Prénom',
      'École',
      'Commune',
      'Département',
      'Âge',
      'Ancienneté carrière',
      'Ancienneté poste',
      'Situation familiale (déclarée)',
      'Situation familiale (retenue)',
      'Points situation',
      'Nombre d’enfants',
      'Formations continues',
      'Statut',
      'Barème',
      'Mobilisable',
      'Motif',
    ],
    lignes.map(l => [
      l.teacher.id,
      l.teacher.nom,
      l.teacher.prenom,
      l.nomEtab,
      l.teacher.communeAttache,
      l.teacher.departementAttache,
      ageRevolu(l),
      l.teacher.ancienneteCarriereAns,
      l.teacher.anciennetePosteAns,
      l.teacher.situationFamiliale,
      l.situation.libelle,
      l.situation.points,
      l.teacher.nbEnfants,
      l.teacher.formationContinue,
      l.teacher.statut,
      l.bareme,
      l.mobilisable ? 'Oui' : 'Non',
      l.motif,
    ]),
  )
}

/** Page « Enseignants ». */
export function EnseignantsPage() {
  const { jeu, filtres, ouvrirEcole } = useSession()
  const { scenario } = useScenarioAffiche()
  const enseignants = useEnseignants(jeu, filtres, { ...SANS_PAGINATION, scenario })

  const [recherche, setRecherche] = useState('')
  const [filtreMobilisable, setFiltreMobilisable] = useState<FiltreMobilisable>('tous')
  const [matriculeDetaille, setMatriculeDetaille] = useState<string | null>(null)

  const lignes = useMemo(
    () =>
      (enseignants.data?.elements ?? []).filter(l => {
        if (filtreMobilisable === 'oui' && !l.mobilisable) return false
        if (filtreMobilisable === 'non' && l.mobilisable) return false
        return correspondRecherche(
          recherche,
          l.teacher.id,
          l.teacher.nom,
          l.teacher.prenom,
          l.nomEtab,
          l.teacher.communeAttache,
        )
      }),
    [enseignants.data, recherche, filtreMobilisable],
  )

  if (!jeu || !enseignants.data) return <EtatRequetes requetes={[enseignants]} />

  const colonnes: Colonne<EnseignantResume>[] = [
    {
      cle: 'nom',
      entete: 'Enseignant',
      rendu: l => (
        <span>
          <strong>
            {l.teacher.nom} {l.teacher.prenom}
          </strong>
          <small>{l.teacher.id}</small>
          {l.teacher.faitPrinceId && <Pill tone="info">Fait de Prince</Pill>}
        </span>
      ),
      tri: l => `${l.teacher.nom} ${l.teacher.prenom}`,
    },
    {
      cle: 'ecole',
      entete: 'École de rattachement',
      rendu: l => (
        <button type="button" className="row-action" onClick={() => ouvrirEcole(l.teacher.idEtabAttache)}>
          <strong>{l.nomEtab}</strong>
          <small>
            {l.teacher.communeAttache} · {l.teacher.departementAttache}
          </small>
        </button>
      ),
      tri: l => l.nomEtab,
    },
    {
      cle: 'age',
      entete: 'Âge',
      numerique: true,
      rendu: l => {
        const age = ageRevolu(l)
        return age == null ? '—' : fmt(age)
      },
      tri: l => l.teacher.age ?? -1,
    },
    {
      cle: 'carriere',
      entete: 'Ancienneté carrière',
      numerique: true,
      rendu: l => fmtDec(l.teacher.ancienneteCarriereAns, 0),
      tri: l => l.teacher.ancienneteCarriereAns,
    },
    {
      cle: 'poste',
      entete: 'Ancienneté poste',
      numerique: true,
      rendu: l => fmtDec(l.teacher.anciennetePosteAns, 0),
      tri: l => l.teacher.anciennetePosteAns,
    },
    {
      cle: 'situation',
      entete: 'Situation familiale',
      rendu: l => (
        <span>
          <strong>{l.situation.libelle}</strong>
          <small>{commentairePointsSituation(l)}</small>
        </span>
      ),
      tri: l => l.situation.libelle,
    },
    {
      cle: 'enfants',
      entete: 'Enfants',
      numerique: true,
      rendu: l => fmt(l.teacher.nbEnfants),
      tri: l => l.teacher.nbEnfants,
    },
    {
      cle: 'formation',
      entete: 'Formations',
      numerique: true,
      rendu: l => fmt(l.teacher.formationContinue),
      tri: l => l.teacher.formationContinue,
    },
    {
      cle: 'bareme',
      entete: 'Barème',
      numerique: true,
      rendu: l => (
        <button
          type="button"
          className="row-action"
          onClick={() => setMatriculeDetaille(l.teacher.id)}
          title="Voir le détail du barème"
        >
          {fmtDec(l.bareme, 2)}
        </button>
      ),
      tri: l => l.bareme,
    },
    {
      cle: 'mobilisable',
      entete: 'Mobilisable',
      rendu: l => (
        <span>
          <Pill tone={l.mobilisable ? 'ok' : 'neutral'}>{l.mobilisable ? '✓ Oui' : '— Non'}</Pill>
          <small className="motif-mobilite">{l.motif}</small>
        </span>
      ),
      tri: l => (l.mobilisable ? 1 : 0),
    },
  ]

  return (
    <div className="stack">
      <Notice tone="neutral" title="Mobilisable ne veut pas dire muté.">
        Un enseignant n’est considéré comme mobilisable que si son départ ne crée pas de déficit dans son établissement
        d’origine. Cette information décrit une possibilité arithmétique, pas une décision.
      </Notice>

      <div className="filter-bar">
        <SearchField
          value={recherche}
          onChange={setRecherche}
          label="Rechercher un enseignant"
          placeholder="Nom, matricule, école, commune…"
        />
        <div className="field">
          <label htmlFor="f-mobilisable">Mobilisable</label>
          <select
            id="f-mobilisable"
            value={filtreMobilisable}
            onChange={e => setFiltreMobilisable(e.target.value as FiltreMobilisable)}
          >
            <option value="tous">Tous les enseignants</option>
            <option value="oui">Uniquement les mobilisables</option>
            <option value="non">Uniquement les non mobilisables</option>
          </select>
        </div>
        <div className="filter-bar-actions">
          <button type="button" className="btn btn-sm" onClick={() => exporterListe(lignes)}>
            <Download size={13} aria-hidden="true" /> Exporter (CSV)
          </button>
        </div>
      </div>

      {matriculeDetaille && (
        <DetailBareme jeu={jeu} matricule={matriculeDetaille} onFermer={() => setMatriculeDetaille(null)} />
      )}

      <Panel kicker="Personnel" title={`${fmt(lignes.length)} enseignants`} flush>
        <DataTable
          lignes={lignes}
          colonnes={colonnes}
          cle={l => `${l.teacher.id}-${l.teacher.ligneSource}`}
          legende="Liste des enseignants et éligibilité au redéploiement"
          messageVide="Aucun enseignant ne correspond à cette recherche."
        />
      </Panel>
    </div>
  )
}
