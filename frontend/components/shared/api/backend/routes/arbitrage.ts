/**
 * Routes des arbitrages des commissions. Le serveur enregistre une décision
 * comme « tel enseignant du vivier va dans telle école » : valider reprend
 * l'école proposée par le scénario, modifier en désigne une autre. Le rejet
 * d'une proposition n'existe pas côté serveur.
 */

import type {
  CorpsDecisionArbitrage,
  DecisionArbitrage,
  DecisionArbitrageAppliquee,
  SchoolDiagnostic,
} from '../../contrat'
import { ApiError } from '../../erreurs'
import type { Acces } from '../acces'
import type { EnseignantDjango } from '../conversions/enseignants'
import { normaliser } from '../conversions/referentiel'
import * as source from '../sources'
import type { Conversion } from '../types'

/** Décision telle que la sert le serveur. */
interface ArbitrageDjango {
  id: number
  id_ens: string
  id_etab: string
  motif: string
  commission: string
  cree_le: string
}

async function nomEnseignant(acces: Acces, jeu: string, matricule: string): Promise<string> {
  try {
    const d = await acces.lire<{ enseignant: EnseignantDjango }>(
      `jeux/${jeu}/enseignants/${encodeURIComponent(matricule)}/`,
    )
    return `${d.enseignant.nom} ${d.enseignant.prenom}`.trim() || matricule
  } catch {
    return matricule
  }
}

function versDecision(
  a: ArbitrageDjango,
  nom: string,
  ecoles: Map<string, SchoolDiagnostic>,
  proposition: DecisionArbitrage['propositionInitiale'],
  decision: DecisionArbitrage['decision'] = 'modifier',
): DecisionArbitrage {
  return {
    id: String(a.id),
    teacherId: a.id_ens,
    nomEnseignant: nom,
    propositionInitiale: proposition,
    decision,
    schoolDestinationId: a.id_etab,
    nomEtabDestination: ecoles.get(a.id_etab)?.school.nom ?? a.id_etab,
    changementSousSysteme: false,
    motif: a.motif,
    instance: normaliser(a.commission).includes('central') ? 'centrale' : 'regionale',
    decideLe: a.cree_le,
  }
}

export const conversionsArbitrage: Record<string, Conversion> = {
  'GET jeux/{jeu}/arbitrages/': async (_, acces, p): Promise<DecisionArbitrageAppliquee[]> => {
    const [liste, ecoles] = await Promise.all([
      acces.lire<ArbitrageDjango[]>(`jeux/${p.jeu}/arbitrages/`),
      source.diagnosticsParId(acces, p.jeu),
    ])
    return Promise.all(
      liste.map(async a => ({
        decision: versDecision(a, await nomEnseignant(acces, p.jeu, a.id_ens), ecoles, null),
        appliquee: ecoles.has(a.id_etab),
        motif: ecoles.has(a.id_etab) ? '' : 'École de destination absente des données du jeu.',
      })),
    )
  },

  'POST jeux/{jeu}/arbitrages/': async (r, acces, p): Promise<DecisionArbitrage> => {
    const c = r.corps as CorpsDecisionArbitrage
    if (c.decision === 'rejeter') {
      throw new ApiError(
        422,
        'regle_metier',
        "Le serveur n'enregistre pas le rejet d'une proposition : choisissez « modifier » pour désigner une autre école.",
      )
    }
    const [ecoles, affectations] = await Promise.all([
      source.diagnosticsParId(acces, p.jeu),
      source.affectations(acces, p.jeu, c.scenario),
    ])
    const proposee = affectations.find(a => a.id_ens === c.teacherId)
    const ecole = c.decision === 'valider' ? proposee?.id_etab : c.schoolDestinationId
    if (!ecole) {
      throw new ApiError(
        422,
        'regle_metier',
        "Aucune école à retenir : le scénario ne propose pas d'affectation pour cet enseignant.",
      )
    }
    const a = await acces.ecrire<ArbitrageDjango>('POST', `jeux/${p.jeu}/arbitrages/`, {
      id_ens: c.teacherId,
      id_etab: ecole,
      motif: c.motif,
      commission: c.instance,
    })
    const proposition = proposee ? { schoolId: proposee.id_etab, nomEtab: proposee.nom_etab, nature: null } : null
    return versDecision(a, await nomEnseignant(acces, p.jeu, a.id_ens), ecoles, proposition, c.decision)
  },
}
