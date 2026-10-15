'use client'

/**
 * Propositions d'affectation du scénario affiché, filtrables par niveau de
 * proximité, avec leur justification détaillée (§15).
 */

import { useMemo, useState } from 'react'

import type { IdJeu, ProposedAssignment, ProximityLevel, SimulationResult } from '@shared/api'
import {
  LIBELLE_NATURE,
  LIBELLE_PROXIMITE,
  LIBELLE_SCOPE,
  LIBELLE_STATUT_PROPOSITION,
  rangZoneSecurite,
} from '@shared/kernel'
import { DataTable, Panel, Pill, ZoneSecuritePill, fmt, type Colonne, type Tone } from '@shared/ui/commun'

import { EXPLICATION_PERIMETRE, NIVEAUX_PROXIMITE } from '../../domain/explications'
import { ExplicationProposition } from './ExplicationProposition'

/** Ton de la pastille de nature du mouvement. */
const TON_NATURE: Record<ProposedAssignment['nature'], Tone> = {
  voeu: 'ok',
  obligatoire: 'warn',
  hors_voeux: 'info',
  arbitrage: 'info',
}

/** Ton de la pastille de proximité. */
function tonProximite(niveau: ProximityLevel): Tone {
  if (niveau === 'meme_commune') return 'ok'
  if (niveau === 'meme_departement') return 'info'
  return 'warn'
}

export interface ProprietesPropositionsPanel {
  jeu: IdJeu
  resultat: SimulationResult
  /** Vue analyste : affiche l'étape de l'algorithme qui a produit chaque proposition. */
  analyste: boolean
}

/** Liste des propositions et panneau d'explication. */
export function PropositionsPanel({ jeu, resultat, analyste }: ProprietesPropositionsPanel) {
  const [selection, setSelection] = useState<ProposedAssignment | null>(null)
  const [filtre, setFiltre] = useState<ProximityLevel | 'toutes'>('toutes')

  const parNiveau = useMemo(
    () => new Map(resultat.mouvementsParPerimetre.map(m => [m.niveau, m.nombre])),
    [resultat.mouvementsParPerimetre],
  )
  const niveauxPresents = NIVEAUX_PROXIMITE.filter(n => (parNiveau.get(n) ?? 0) > 0)
  const lignes = useMemo(
    () => (filtre === 'toutes' ? resultat.assignments : resultat.assignments.filter(a => a.niveauProximite === filtre)),
    [resultat.assignments, filtre],
  )

  /** Zone de sécurité de l'école de destination, portée par le poste pourvu. */
  const zonesParPoste = useMemo(
    () => new Map(resultat.postes.map(p => [p.id, p.priorite.zoneSecurite])),
    [resultat.postes],
  )
  const zoneDestination = (a: ProposedAssignment) => zonesParPoste.get(a.postId) ?? null

  const colonnes: Colonne<ProposedAssignment>[] = [
    {
      cle: 'ens',
      entete: 'Enseignant',
      rendu: a => (
        <span>
          <strong>
            {a.nomEns} {a.prenomEns}
          </strong>
          <small>{a.teacherId}</small>
        </span>
      ),
      tri: a => a.nomEns,
    },
    {
      cle: 'origine',
      entete: 'Origine',
      rendu: a => (
        <span>
          {a.nomEtabOrigine}
          <small>{a.communeOrigine}</small>
        </span>
      ),
      tri: a => a.nomEtabOrigine,
    },
    {
      cle: 'destination',
      entete: 'Destination',
      rendu: a => (
        <span>
          <strong>{a.nomEtabDestination}</strong>
          <small>
            {a.communeDestination} · {a.departementDestination}
          </small>
        </span>
      ),
      tri: a => a.nomEtabDestination,
    },
    {
      cle: 'securite',
      entete: 'Sécurité (destination)',
      rendu: a => <ZoneSecuritePill zone={zoneDestination(a)} court />,
      tri: a => rangZoneSecurite(zoneDestination(a)),
    },
    {
      cle: 'nature',
      entete: 'Nature',
      rendu: a => (
        <span>
          <Pill tone={TON_NATURE[a.nature]}>{LIBELLE_NATURE[a.nature]}</Pill>
          {a.rangVoeu != null && <small>vœu {a.rangVoeu}</small>}
        </span>
      ),
      tri: a => a.nature,
    },
    {
      cle: 'perimetre',
      entete: 'Périmètre',
      rendu: a => <Pill tone={tonProximite(a.niveauProximite)}>{LIBELLE_PROXIMITE[a.niveauProximite]}</Pill>,
      tri: a => a.niveauProximite,
    },
    { cle: 'statut', entete: 'Statut', rendu: a => LIBELLE_STATUT_PROPOSITION[a.statut], tri: a => a.statut },
    { cle: 'score', entete: 'Score', numerique: true, rendu: a => fmt(a.score), tri: a => a.score },
    {
      cle: 'explication',
      entete: '',
      rendu: a => (
        <button type="button" className="row-action" onClick={() => setSelection(a)}>
          Pourquoi ?
        </button>
      ),
    },
  ]

  // En vue analyste, l'étape de l'algorithme s'insère avant le statut.
  if (analyste) colonnes.splice(6, 0, { cle: 'phase', entete: 'Étape', rendu: a => a.phase, tri: a => a.phase })

  return (
    <>
      <Panel
        kicker="Propositions"
        title={`${fmt(resultat.assignments.length)} propositions d’affectation — ${resultat.scenarioNom}`}
        hint={`Périmètre du scénario : ${LIBELLE_SCOPE[resultat.scope].toLowerCase()}. ${EXPLICATION_PERIMETRE[resultat.scope]} Ces propositions proviennent d’une simulation et nécessitent une validation administrative.`}
        flush
      >
        {niveauxPresents.length > 1 && (
          <div className="filtre-proximite no-print">
            <span id="filtre-proximite-label">Afficher</span>
            <div className="mode-switch" role="group" aria-labelledby="filtre-proximite-label">
              <button type="button" aria-pressed={filtre === 'toutes'} onClick={() => setFiltre('toutes')}>
                Toutes ({fmt(resultat.assignments.length)})
              </button>
              {niveauxPresents.map(n => (
                <button key={n} type="button" aria-pressed={filtre === n} onClick={() => setFiltre(n)}>
                  {LIBELLE_PROXIMITE[n]} ({fmt(parNiveau.get(n) ?? 0)})
                </button>
              ))}
            </div>
          </div>
        )}
        <DataTable
          key={filtre}
          lignes={lignes}
          colonnes={colonnes}
          cle={a => a.postId}
          legende="Propositions d’affectation issues de la simulation"
          messageVide="Aucune proposition n’a pu être formulée dans ce scénario."
        />
      </Panel>

      {selection && (
        <ExplicationProposition
          jeu={jeu}
          scenario={resultat.scenarioId}
          proposition={selection}
          onFermer={() => setSelection(null)}
        />
      )}
    </>
  )
}
