/**
 * Messages d'un export en cours ou en échec : l'utilisateur sait toujours si la génération avance, a échoué, a expiré
 * ou a été annulée — jamais un bouton figé sans explication.
 */

import { ApiError } from '../../shared/api'

/** Durée écoulée lisible : « 7 s », « 1 min 05 s ». */
export function dureeEcoulee(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes))
  if (s < 60) return `${s} s`
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

/** Phrase affichée pendant la génération. */
export function messageGeneration(national: boolean, secondes: number): string {
  const attente = national
    ? 'Un export national complet (toutes les régions, tous les départements, tous les arrondissements et toutes les écoles) dure environ une minute sur un jeu national, davantage sur un poste lent.'
    : 'La génération prend quelques secondes.'
  return `Génération en cours — ${dureeEcoulee(secondes)} écoulées. ${attente} Ne fermez pas cette page.`
}

/** Message d'échec d'un export, selon sa cause. */
export function messageEchecExport(erreur: unknown): { titre: string; detail: string } {
  if (erreur instanceof ApiError) {
    if (erreur.code === 'delai_depasse') return { titre: 'L’export a dépassé le délai.', detail: erreur.motif }
    if (erreur.code === 'annule') return { titre: 'Export annulé.', detail: erreur.motif }
    if (erreur.code === 'serveur_injoignable') {
      return { titre: 'Le serveur ne répond plus.', detail: `${erreur.motif} Vos données ne sont pas perdues.` }
    }
    if (erreur.statut === 403) return { titre: 'Export refusé.', detail: erreur.motif }
    return { titre: 'L’export a échoué.', detail: erreur.motif }
  }
  return {
    titre: 'L’export a échoué.',
    detail: erreur instanceof Error ? erreur.message : 'Réessayez dans un instant.',
  }
}
