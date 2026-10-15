/**
 * Cycle de vie d'une nomination (document des routes, section 5) :
 *
 *   proposée ──valider──► validée ──mettre en œuvre──► mise en œuvre (définitive)
 *      ├──rejeter──► rejetée
 *      └──annuler──► annulée ◄──annuler── validée
 *
 * Le serveur applique ces règles et refuse toute transition invalide (409).
 * Ce module décide seulement quelles actions l'interface propose, et ce que
 * chacune demande de saisir.
 */

import type { Mouvement, StatutNomination } from '../../shared/api'

/** Action possible sur une nomination. */
export type ActionNomination = 'valider' | 'rejeter' | 'mettre-en-oeuvre' | 'annuler'

/** Actions proposées selon le statut ; aucune pour un statut définitif. */
export function actionsPossibles(statut: StatutNomination): ActionNomination[] {
  switch (statut) {
    case 'proposee':
      return ['valider', 'rejeter', 'annuler']
    case 'validee':
      return ['mettre-en-oeuvre', 'annuler']
    case 'mise_en_oeuvre':
    case 'rejetee':
    case 'annulee':
      return []
    default: {
      // Garantit à la compilation que tout nouveau statut est traité ici.
      const nonTraite: never = statut
      return nonTraite
    }
  }
}

/** Libellé du bouton de chaque action. */
export const LIBELLE_ACTION: Record<ActionNomination, string> = {
  valider: 'Valider',
  rejeter: 'Rejeter',
  'mettre-en-oeuvre': 'Mettre en œuvre',
  annuler: 'Annuler',
}

/** Champs à saisir pour chaque action, en plus de l'auteur. */
export const SAISIE_ACTION: Record<ActionNomination, 'reference' | 'motif' | 'acte'> = {
  valider: 'reference',
  rejeter: 'motif',
  annuler: 'motif',
  'mettre-en-oeuvre': 'acte',
}

/** Conséquence de chaque action, rappelée avant confirmation. */
export const CONSEQUENCE_ACTION: Record<ActionNomination, string> = {
  valider:
    'La personne sort du vivier disponible et le poste est réservé : la planification compte la nomination en « prévu ».',
  rejeter: 'La proposition est écartée ; la personne et le poste redeviennent disponibles.',
  'mettre-en-oeuvre':
    'Les effectifs des écoles sont modifiés et la décision devient définitive : une erreur se corrigera par un nouveau mouvement.',
  annuler: 'La nomination est abandonnée ; une nomination validée libère son poste réservé.',
}

/** Vrai si un mouvement peut être marqué comme réalisé depuis le registre. */
export function mouvementRealisable(mouvement: Mouvement): boolean {
  // Les nominations se mettent en œuvre par leur propre cycle ; les faits du Prince sont acquis dès leur enregistrement.
  return mouvement.statut === 'prevu' && (mouvement.type === 'redeploiement' || mouvement.type === 'deploiement_recrue')
}
