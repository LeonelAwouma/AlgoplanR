/**
 * Routes des recrues. Le serveur classe les candidats par rang (1 = premier)
 * et retient une région souhaitée, sans note ni liste d'écoles : la note du
 * contrat porte le rang, et la région tient lieu de lieu de résidence.
 */

import type { LectureRecrues, Recrue } from '../../contrat'
import { sousSysteme, texte } from '../conversions/referentiel'
import type { Conversion } from '../types'

/** Recrue telle que la sert le serveur. */
export interface RecrueDjango {
  id_recrue: string
  nom: string
  prenom: string
  sous_systeme: string
  region_souhaitee: string
  rang: number | null
}

export function versRecrue(r: RecrueDjango, ligne: number): Recrue {
  return {
    id: r.id_recrue,
    nom: `${texte(r.nom)} ${texte(r.prenom)}`.trim() || r.id_recrue,
    sexe: '',
    sousSysteme: sousSysteme(r.sous_systeme),
    note: r.rang ?? 0,
    communeResidence: texte(r.region_souhaitee),
    choix: [],
    ligneSource: ligne,
  }
}

export const conversionsRecrutement: Record<string, Conversion> = {
  'GET jeux/{jeu}/recrues/': async (_, acces, p) =>
    (await acces.lire<RecrueDjango[]>(`jeux/${p.jeu}/recrues/`)).map((r, i) => versRecrue(r, i + 1)),

  'POST jeux/{jeu}/recrues/import/': async (r, acces, p): Promise<LectureRecrues> => {
    const bilan = await acces.ecrire<{ refusees: { ligne?: number; id_recrue?: string; motif: string }[] }>(
      'POST',
      `jeux/${p.jeu}/recrues/import/`,
      r.corps,
      'multipart',
    )
    const recrues = await acces.lire<RecrueDjango[]>(`jeux/${p.jeu}/recrues/`)
    return {
      recrues: recrues.map((x, i) => versRecrue(x, i + 1)),
      manquantes: [],
      ecartees: bilan.refusees.map(l => ({
        ligne: l.ligne ?? 0,
        motif: l.id_recrue ? `${l.id_recrue} : ${l.motif}` : l.motif,
      })),
    }
  },
}
