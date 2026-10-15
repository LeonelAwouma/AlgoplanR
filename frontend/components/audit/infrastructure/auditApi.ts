/**
 * Accès à l'API du contexte « Audit » : journal de toutes les décisions et de
 * tous les recalculs.
 *
 * Routes : GET jeux/{jeu}/journal-audit/   GET jeux/{jeu}/journal-audit/{evenement}/
 */

import {
  appeler,
  queryPage,
  route,
  type DemandePage,
  type EvenementAudit,
  type EvenementAuditDetail,
  type FiltresAudit,
  type IdJeu,
  type Page,
} from '../../shared/api'

const ROUTES = {
  journal: route<Page<EvenementAudit>>()('GET', 'jeux/{jeu}/journal-audit/'),
  evenement: route<EvenementAuditDetail>()('GET', 'jeux/{jeu}/journal-audit/{evenement}/'),
}

/** Événements du journal, du plus récent au plus ancien. */
export function listerEvenementsAudit(
  jeu: IdJeu,
  filtres: FiltresAudit & DemandePage = {},
  signal?: AbortSignal,
): Promise<Page<EvenementAudit>> {
  return appeler(ROUTES.journal, {
    params: { jeu },
    query: {
      ...queryPage(filtres),
      type: filtres.type,
      objet: filtres.objet,
      auteur: filtres.auteur,
      du: filtres.du,
      au: filtres.au,
    },
    signal,
  })
}

/** Détail d'un événement : état de l'objet avant et après. */
export function lireEvenementAudit(jeu: IdJeu, evenement: string, signal?: AbortSignal): Promise<EvenementAuditDetail> {
  return appeler(ROUTES.evenement, { params: { jeu, evenement }, signal })
}
