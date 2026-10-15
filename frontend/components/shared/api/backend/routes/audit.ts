/**
 * Routes du journal d'audit. Le serveur journalise chaque décision et chaque
 * recalcul ; il ajoute à chaque événement l'identifiant du compte connecté
 * (`compte`), que le contrat ne porte pas.
 */

import type { EvenementAudit, EvenementAuditDetail } from '../../contrat'
import { paginer } from '../liste'
import type { Conversion } from '../types'

type EvenementDjango = EvenementAudit & { compte?: string | null; avant?: unknown; apres?: unknown }

function versEvenement(e: EvenementDjango): EvenementAudit {
  return { id: e.id, type: e.type, action: e.action, objet: e.objet, resume: e.resume, auteur: e.auteur, le: e.le }
}

export const conversionsAudit: Record<string, Conversion> = {
  'GET jeux/{jeu}/journal-audit/': async (r, acces, p) => {
    const { page: _page, taille: _taille, tri: _tri, ...filtres } = r.query
    const { lignes } = await acces.toutes<EvenementDjango>(`jeux/${p.jeu}/journal-audit/`, filtres)
    return paginer(lignes.map(versEvenement), r.query)
  },
  'GET jeux/{jeu}/journal-audit/{evenement}/': async (_, acces, p): Promise<EvenementAuditDetail> => {
    const e = await acces.lire<EvenementDjango>(`jeux/${p.jeu}/journal-audit/${encodeURIComponent(p.evenement)}/`)
    return { ...versEvenement(e), avant: e.avant ?? null, apres: e.apres ?? null }
  },
}
