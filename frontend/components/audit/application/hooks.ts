'use client'

/** Cas d'usage du contexte « Audit » : consultation du journal. */

import type { DemandePage, FiltresAudit, IdJeu } from '../../shared/api'
import { useLectureJeu } from '../../shared/requetes'
import { lireEvenementAudit, listerEvenementsAudit } from '../infrastructure/auditApi'

/** Événements du journal, filtrés et paginés. */
export function useJournalAudit(jeu: IdJeu | null, filtres: FiltresAudit & DemandePage = {}) {
  return useLectureJeu(jeu, 'audit', ['liste', filtres], (id, signal) => listerEvenementsAudit(id, filtres, signal))
}

/** Détail d'un événement ; rien n'est demandé sans événement choisi. */
export function useEvenementAudit(jeu: IdJeu | null, evenement: string | null) {
  return useLectureJeu(
    jeu,
    'audit',
    ['fiche', evenement],
    (id, signal) => lireEvenementAudit(id, evenement ?? '', signal),
    { active: evenement !== null },
  )
}
