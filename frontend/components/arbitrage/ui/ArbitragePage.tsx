'use client'

/**
 * Commission d'arbitrage (§3.10) : le moteur propose, la commission décide.
 *
 * La commission valide, rejette ou corrige les propositions du scénario
 * affiché, et peut décider un changement de sous-système. Chaque décision est
 * enregistrée par le serveur, qui relance l'algorithme sur les postes et les
 * candidats restants, pour tous les scénarios.
 */

import { useMemo, useState } from 'react'
import { Ban, Check, PencilLine } from 'lucide-react'

import { SELECTION_NATIONALE, type ProposedAssignment } from '@shared/api'
import { LIBELLE_NATURE, LIBELLE_STATUT_PROPOSITION, correspondRecherche } from '@shared/kernel'
import { useSession } from '@shared/session'
import { DataTable, Notice, Panel, Pill, SearchField, fmt, type Colonne } from '@shared/ui/commun'
import { EtatRequetes, ErreurAction } from '@shared/ui/etats'
import { SansScenario, usePostesNonCouverts, useResultat, useScenarioAffiche } from '@components/simulation'

import { useAnnulerArbitrage, useArbitrages, useEnregistrerArbitrage } from '../application/hooks'
import { brouillonSurProposition, type BrouillonDecision } from '../domain/brouillon'
import { EcolesNonCouvertes } from './composants/EcolesNonCouvertes'
import { FormulaireDecision } from './composants/FormulaireDecision'
import { HistoriqueArbitrages } from './composants/HistoriqueArbitrages'
import { VoeuxAutreSousSysteme } from './composants/VoeuxAutreSousSysteme'

/** Page « Commission d'arbitrage ». */
export function ArbitragePage() {
  const { jeu } = useSession()
  const { scenario } = useScenarioAffiche()
  const resultat = useResultat(jeu, scenario, SELECTION_NATIONALE)
  const nonCouvertes = usePostesNonCouverts(jeu, scenario)
  const arbitrages = useArbitrages(jeu)
  const enregistrement = useEnregistrerArbitrage(jeu)
  const annulation = useAnnulerArbitrage(jeu)

  const [brouillon, setBrouillon] = useState<BrouillonDecision | null>(null)
  const [recherche, setRecherche] = useState('')

  const propositions = useMemo(
    () =>
      (resultat.data?.assignments ?? []).filter(a =>
        correspondRecherche(recherche, a.nomEns, a.prenomEns, a.teacherId, a.nomEtabDestination, a.nomEtabOrigine),
      ),
    [resultat.data, recherche],
  )

  if (!scenario) return <SansScenario texte="La commission examine les propositions d’un scénario calculé." />
  if (!resultat.data || !nonCouvertes.data || !arbitrages.data) {
    return <EtatRequetes requetes={[resultat, nonCouvertes, arbitrages]} />
  }

  function enregistrer() {
    if (!brouillon || !scenario) return
    enregistrement.mutate(
      {
        scenario,
        teacherId: brouillon.teacherId,
        decision: brouillon.decision,
        schoolDestinationId: brouillon.decision === 'modifier' ? brouillon.schoolDestinationId : null,
        changementSousSysteme: brouillon.changementSousSysteme,
        motif: brouillon.motif.trim(),
        instance: brouillon.instance,
      },
      { onSuccess: () => setBrouillon(null) },
    )
  }

  const ouvrir = (a: ProposedAssignment, decision: BrouillonDecision['decision']) => {
    enregistrement.reset()
    setBrouillon(brouillonSurProposition(a, decision))
  }

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
      cle: 'mouvement',
      entete: 'Mouvement proposé',
      rendu: a => (
        <span>
          {a.nomEtabOrigine} → <strong>{a.nomEtabDestination}</strong>
          <small>{a.communeDestination}</small>
        </span>
      ),
      tri: a => a.nomEtabDestination,
    },
    {
      cle: 'nature',
      entete: 'Nature',
      rendu: a => `${LIBELLE_NATURE[a.nature]}${a.rangVoeu ? ` (vœu ${a.rangVoeu})` : ''}`,
      tri: a => a.nature,
    },
    {
      cle: 'statut',
      entete: 'Statut',
      rendu: a => <Pill tone={a.statut === 'propose' ? 'neutral' : 'ok'}>{LIBELLE_STATUT_PROPOSITION[a.statut]}</Pill>,
      tri: a => a.statut,
    },
    {
      cle: 'actions',
      entete: 'Décision',
      rendu: a =>
        a.statut === 'propose' ? (
          <span className="acces-actions">
            <button type="button" className="row-action" onClick={() => ouvrir(a, 'valider')}>
              <Check size={12} aria-hidden="true" /> Valider
            </button>
            <button type="button" className="row-action" onClick={() => ouvrir(a, 'modifier')}>
              <PencilLine size={12} aria-hidden="true" /> Corriger
            </button>
            <button type="button" className="row-action row-action-danger" onClick={() => ouvrir(a, 'rejeter')}>
              <Ban size={12} aria-hidden="true" /> Rejeter
            </button>
          </span>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <div className="stack">
      <Notice tone="info" title="Le moteur propose, la commission décide (§3.10).">
        Chaque décision conserve la proposition initiale, son motif et l’instance qui l’a prise. Après chaque décision,
        les besoins sont recalculés et l’algorithme est relancé sur les postes et les candidats restants, pour tous les
        scénarios.
      </Notice>

      {brouillon && (
        <FormulaireDecision
          brouillon={brouillon}
          onChange={setBrouillon}
          ecolesOuvertes={nonCouvertes.data}
          enregistrement={enregistrement.isPending}
          erreur={enregistrement.error}
          onEnregistrer={enregistrer}
          onAnnuler={() => setBrouillon(null)}
        />
      )}

      <EcolesNonCouvertes ecoles={nonCouvertes.data} />

      <VoeuxAutreSousSysteme
        voeux={resultat.data.voeuxAutreSousSysteme}
        onDecider={v =>
          setBrouillon({
            teacherId: v.teacherId,
            nomEnseignant: v.nom,
            proposition: null,
            decision: 'modifier',
            schoolDestinationId: v.schoolId,
            changementSousSysteme: true,
            motif: '',
            instance: 'regionale',
          })
        }
      />

      <Panel kicker="Propositions" title={`${fmt(propositions.length)} proposition(s) du plan`} flush>
        <div className="filter-bar filter-bar-integree">
          <SearchField
            value={recherche}
            onChange={setRecherche}
            label="Rechercher"
            placeholder="Nom, matricule ou école"
          />
        </div>
        <DataTable
          lignes={propositions}
          colonnes={colonnes}
          cle={a => a.postId}
          legende="Propositions soumises à la commission"
        />
      </Panel>

      <ErreurAction erreur={annulation.error} />
      <HistoriqueArbitrages
        decisions={arbitrages.data}
        annulation={annulation.isPending}
        onAnnuler={decision => annulation.mutate(decision)}
      />
    </div>
  )
}
