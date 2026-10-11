/**
 * Décision de commission en cours de saisie, avant son envoi au serveur.
 */

import type { DecisionArbitrage, ProposedAssignment } from '../../shared/api'

/** Décision en cours de saisie. */
export interface BrouillonDecision {
  teacherId: string
  nomEnseignant: string
  /** Proposition examinée, `null` pour une décision prise hors proposition (changement de sous-système). */
  proposition: ProposedAssignment | null
  decision: DecisionArbitrage['decision']
  /** École retenue pour une décision « modifier », vide tant qu'elle n'est pas choisie. */
  schoolDestinationId: string
  changementSousSysteme: boolean
  motif: string
  instance: DecisionArbitrage['instance']
}

/** Brouillon ouvert sur une proposition du moteur. */
export function brouillonSurProposition(
  proposition: ProposedAssignment,
  decision: DecisionArbitrage['decision'],
): BrouillonDecision {
  return {
    teacherId: proposition.teacherId,
    nomEnseignant: `${proposition.nomEns} ${proposition.prenomEns}`.trim(),
    proposition,
    decision,
    schoolDestinationId: '',
    changementSousSysteme: false,
    motif: '',
    instance: 'regionale',
  }
}

/** Le brouillon peut être envoyé : motif renseigné, école choisie pour une correction. */
export function brouillonComplet(brouillon: BrouillonDecision): boolean {
  return brouillon.motif.trim() !== '' && (brouillon.decision !== 'modifier' || brouillon.schoolDestinationId !== '')
}

/** Titre du panneau de saisie. */
export function titreBrouillon(brouillon: BrouillonDecision): string {
  const action =
    brouillon.decision === 'valider'
      ? 'Valider'
      : brouillon.decision === 'rejeter'
        ? 'Rejeter'
        : brouillon.changementSousSysteme
          ? 'Changer de sous-système'
          : 'Corriger'
  return `${action} — ${brouillon.nomEnseignant}`
}

/** Phrase de traçabilité d'une décision enregistrée. */
export function resumeDecision(d: DecisionArbitrage): string {
  const effet =
    d.decision === 'valider'
      ? 'proposition validée'
      : d.decision === 'rejeter'
        ? 'proposition rejetée'
        : `affecté à ${d.nomEtabDestination}`
  const initiale = d.propositionInitiale ? ` (proposition initiale : ${d.propositionInitiale.nomEtab})` : ''
  const sousSysteme = d.changementSousSysteme ? ', avec changement de sous-système' : ''
  const instance = d.instance === 'centrale' ? 'centrale' : 'régionale'
  const date = new Date(d.decideLe).toLocaleDateString('fr-FR')
  return `${effet}${initiale}${sousSysteme}. Commission ${instance}, le ${date} — motif : ${d.motif}.`
}
