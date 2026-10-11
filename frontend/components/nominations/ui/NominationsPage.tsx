'use client'

/**
 * Nominations depuis le vivier (mémo de synthèse, §2.2) : les décisions
 * proposées, validées et effectivement mises en œuvre sont distinguées, et
 * chaque changement de statut est tracé. Une nomination validée compte en
 * « prévu » dans la planification, une nomination mise en œuvre en « réalisé ».
 */

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'

import type { Nomination, StatutNomination } from '@shared/api'
import { LIBELLE_STATUT_NOMINATION } from '@shared/kernel'
import { useSession } from '@shared/session'
import { KpiCard, Notice, Panel, fmt } from '@shared/ui/commun'
import { ChampAuteur, useAuteur } from '@shared/ui/ChampAuteur'
import { ChargementEnCours, ErreurAction } from '@shared/ui/etats'

import { useImporterNominations, useSyntheseNominations } from '../application/hooks'
import type { ActionNomination as Action } from '../domain/cycleDeVie'
import { STATUTS_NOMINATION } from '../domain/sources'
import { ActionNomination } from './composants/ActionNomination'
import { DetailNomination } from './composants/DetailNomination'
import { GenerationNominations } from './composants/GenerationNominations'
import { ListeNominations } from './composants/ListeNominations'
import { LotNominations } from './composants/LotNominations'

/** Ce que chaque statut représente pour la planification. */
const EFFET_STATUT: Record<StatutNomination, string> = {
  proposee: 'En attente de décision, comptées nulle part',
  validee: 'Postes réservés, comptées en « prévu »',
  mise_en_oeuvre: 'Effectifs modifiés, comptées en « réalisé »',
  rejetee: 'Sans effet, conservées dans l’historique',
  annulee: 'Sans effet, conservées dans l’historique',
}

/** Page « Nominations ». */
export function NominationsPage() {
  const { jeu } = useSession()
  const synthese = useSyntheseNominations(jeu)
  const importation = useImporterNominations(jeu)
  const [auteur, setAuteur] = useAuteur()
  const champFichier = useRef<HTMLInputElement>(null)

  const [cochees, setCochees] = useState<Set<string>>(new Set())
  const [action, setAction] = useState<{ nomination: Nomination; action: Action } | null>(null)
  const [detail, setDetail] = useState<string | null>(null)

  if (!jeu) return <ChargementEnCours />

  const cocher = (id: string, cochee: boolean) =>
    setCochees(courantes => {
      const suivantes = new Set(courantes)
      if (cochee) suivantes.add(id)
      else suivantes.delete(id)
      return suivantes
    })

  const parStatut: Partial<Record<StatutNomination, number>> = synthese.data?.parStatut ?? {}

  return (
    <div className="stack">
      <Notice tone="info" title="Proposée, validée, mise en œuvre.">
        Une nomination proposée n’est comptée nulle part. Validée, elle réserve le poste et compte en « prévu ». Mise en
        œuvre, elle modifie les effectifs et devient définitive. Le serveur refuse toute double nomination d’une
        personne ou d’un poste.
      </Notice>

      <div className="kpi-row">
        {STATUTS_NOMINATION.map(s => (
          <KpiCard key={s} label={LIBELLE_STATUT_NOMINATION[s]} value={fmt(parStatut[s] ?? 0)} hint={EFFET_STATUT[s]} />
        ))}
      </div>

      <GenerationNominations jeu={jeu} />

      {action && (
        <ActionNomination
          key={`${action.nomination.id}-${action.action}`}
          jeu={jeu}
          nomination={action.nomination}
          action={action.action}
          onTermine={() => setAction(null)}
          onAnnuler={() => setAction(null)}
        />
      )}

      <LotNominations jeu={jeu} cochees={cochees} onTraite={() => setCochees(new Set())} />

      <Panel kicker="Nominations" title="Suivi des nominations" flush>
        <div className="onglet-contenu">
          <ListeNominations
            jeu={jeu}
            cochees={cochees}
            onCocher={cocher}
            onAction={(nomination, choix) => setAction({ nomination, action: choix })}
            onDetail={n => setDetail(n.id)}
          />
        </div>
      </Panel>

      {detail && <DetailNomination key={detail} jeu={jeu} nomination={detail} onFermer={() => setDetail(null)} />}

      <Panel
        kicker="Import"
        title="Importer des nominations décidées hors de l’application"
        hint="Une ligne par nomination : personne, poste, statut (validée ou mise en œuvre), références. Chaque ligne est contrôlée comme une saisie."
      >
        <div className="param-grid">
          <ChampAuteur auteur={auteur} onChange={setAuteur} />
        </div>
        <input
          ref={champFichier}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="champ-fichier-cache"
          aria-label="Fichier de nominations à importer"
          onChange={e => {
            const fichier = e.target.files?.[0]
            if (fichier) importation.mutate({ fichier, auteur: auteur.trim() })
            e.target.value = ''
          }}
        />
        <ErreurAction erreur={importation.error} />
        {importation.data && (
          <Notice
            tone={importation.data.refus.length > 0 ? 'warn' : 'info'}
            title={`${fmt(importation.data.importees)} nomination(s) importée(s).`}
          >
            {importation.data.manquantes.length > 0 &&
              `Colonnes introuvables : ${importation.data.manquantes.join(', ')}. `}
            {importation.data.refus.slice(0, 5).join(' ; ')}
          </Notice>
        )}
        <div className="topbar-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={importation.isPending || auteur.trim() === ''}
            onClick={() => champFichier.current?.click()}
          >
            <Upload size={13} aria-hidden="true" /> Importer un fichier
          </button>
        </div>
      </Panel>
    </div>
  )
}
