/**
 * Rapport de décision : le rapport structuré du serveur, mis en sections.
 */

import type { DecisionReport, DecisionReportSection } from '../../contrat'
import * as source from '../sources'
import { libellePhase, type SyntheseDjango } from '../conversions/simulation'
import { valeur } from '../liste'
import type { Conversion } from '../types'

/** Rapport tel que le sert le serveur (`domaine/rapport/rapport.py`). */
interface RapportDjango {
  titre: string
  jeu?: {
    statut?: string
    valide_par?: string | null
    valide_le?: string | null
    reserve_drh?: { motif: string; auteur: string; le: string; controles: { libelle: string; detail: string }[] } | null
  }
  genere_le: string
  scenario: { nom: string; description: string }
  perimetre: { titre: string }
  synthese: SyntheseDjango
  narratif: string
  couverture: number
  points_attention: { code: string; gravite: string; message: string }[]
  repartition_phases: Record<string, number>
  departements_en_tension: { departement: string; postes_non_pourvus: number }[]
  flux_regionaux: { territoire: string; recus: number; sortants: number; internes: number; solde: number }[]
  faits_prince: { nombre: number; details: { id_ens: string; id_etab: string; motif?: string }[] }
  arbitrages: { nombre: number; details: { id_ens: string; id_etab: string; motif?: string }[] }
  invariants: { tous_respectes: boolean; controles: { libelle: string; ok: boolean; details: string }[] }
  projections: { quota_recrutement_n2: number; quota_recrutement_n3: number; departs_retraite_n1: number }
  recommandations: string[]
}

const n = (v: number) => new Intl.NumberFormat('fr-FR').format(Math.round(v))

/** Statut de validation du jeu, dit sans ambiguïté, réserve DRH comprise. */
export function statutDonnees(jeu: RapportDjango['jeu']): string[] {
  if (jeu?.statut !== 'valide') {
    return [
      'Jeu de données non validé (brouillon) : les chiffres de ce rapport ne reposent pas sur une référence validée.',
    ]
  }
  const par = jeu.valide_par ? ` par ${jeu.valide_par}` : ''
  const le = jeu.valide_le ? ` le ${new Date(jeu.valide_le).toLocaleDateString('fr-FR')}` : ''
  if (!jeu.reserve_drh) return [`Jeu de données validé${par}${le}, sans réserve.`]
  return [
    `Jeu de données validé AVEC RÉSERVE DE LA DRH${par}${le}.`,
    `Motif de la réserve : ${jeu.reserve_drh.motif}`,
    `Contrôle(s) en réserve : ${jeu.reserve_drh.controles.map(c => c.libelle).join(' ; ')}. Les calculs partent des effectifs déclarés des établissements ; la liste nominative des enseignants peut être incomplète pour les écoles concernées.`,
  ]
}

function sections(r: RapportDjango): DecisionReportSection[] {
  const s = r.synthese
  const liste: DecisionReportSection[] = [
    {
      titre: 'Statut des données de référence',
      paragraphes: statutDonnees(r.jeu),
    },
    {
      titre: 'Synthèse',
      paragraphes: [`Scénario : ${r.scenario.nom}. ${r.scenario.description}`, r.narratif],
      tableau: {
        entetes: ['Indicateur', 'Valeur'],
        lignes: [
          ['Postes à pourvoir', s.besoin_total],
          ['Enseignants mobilisables', s.disponibles],
          ['Affectations proposées', s.affectes + s.effet_de_prince],
          ['dont faits du Prince', s.effet_de_prince],
          ['Postes non pourvus', s.postes_non_pourvus],
          ['dont en zone rouge', s.postes_rouge_non_pourvus],
          ['Recrutements à prévoir', s.a_recruter],
          ['Taux de couverture', `${Math.round(r.couverture * 100)} %`],
        ],
      },
    },
    {
      titre: "Points d'attention",
      paragraphes: r.points_attention.length === 0 ? ["Aucun point d'attention."] : [],
      points: r.points_attention.map(p => p.message),
    },
    {
      titre: 'Affectations par étape',
      paragraphes: [],
      tableau: {
        entetes: ['Étape', 'Affectations'],
        lignes: Object.entries(r.repartition_phases).map(([phase, nombre]) => [libellePhase(phase), nombre]),
      },
    },
    {
      titre: 'Départements en tension',
      paragraphes: [],
      tableau: {
        entetes: ['Département', 'Postes non pourvus'],
        lignes: r.departements_en_tension.map(d => [d.departement, d.postes_non_pourvus]),
      },
    },
    {
      titre: 'Flux entre régions',
      paragraphes: [],
      tableau: {
        entetes: ['Région', 'Reçus', 'Sortants', 'Internes', 'Solde'],
        lignes: r.flux_regionaux.map(f => [f.territoire, f.recus, f.sortants, f.internes, f.solde]),
      },
    },
    {
      titre: 'Décisions hors algorithme',
      paragraphes: [
        `${n(r.faits_prince.nombre)} fait(s) du Prince et ${n(r.arbitrages.nombre)} arbitrage(s) de commission appliqués.`,
      ],
      points: [
        ...r.faits_prince.details.map(
          f => `Fait du Prince : ${f.id_ens} → ${f.id_etab}${f.motif ? ` (${f.motif})` : ''}`,
        ),
        ...r.arbitrages.details.map(a => `Arbitrage : ${a.id_ens} → ${a.id_etab}${a.motif ? ` (${a.motif})` : ''}`),
      ],
    },
    {
      titre: 'Contrôles de cohérence',
      paragraphes: [
        r.invariants.tous_respectes
          ? 'Tous les contrôles sont respectés.'
          : 'Certains contrôles ne sont pas respectés.',
      ],
      tableau: {
        entetes: ['Contrôle', 'Résultat', 'Détail'],
        lignes: r.invariants.controles.map(c => [c.libelle, c.ok ? 'Respecté' : 'En écart', c.details]),
      },
    },
    {
      titre: 'Projections',
      paragraphes: [
        `Départs à la retraite attendus en N+1 : ${n(r.projections.departs_retraite_n1)}.`,
        `Quota de recrutement estimé : ${n(r.projections.quota_recrutement_n2)} en N+2, ${n(r.projections.quota_recrutement_n3)} en N+3.`,
      ],
    },
    { titre: 'Recommandations', paragraphes: [], points: r.recommandations },
  ]
  return liste
}

export const conversionsRapports: Record<string, Conversion> = {
  'GET jeux/{jeu}/rapport/': async (req, acces, p): Promise<DecisionReport> => {
    const q = req.query
    const r = await acces.lire<RapportDjango>(`jeux/${p.jeu}/rapport/`, {
      region: valeur(q.region),
      departement: valeur(q.departement),
      commune: valeur(q.commune),
      scenario: valeur(q.scenario),
    })
    const { anneeScolaire } = await source.parametres(acces, p.jeu)
    return { genereLe: r.genere_le, anneeScolaire, perimetre: r.perimetre.titre, sections: sections(r) }
  },
}
