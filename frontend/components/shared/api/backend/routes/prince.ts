/**
 * Routes des faits du Prince. Le serveur ne garde que le matricule, l'école de
 * destination et le motif : le nom de l'enseignant et les deux écoles sont
 * relus dans les données du jeu.
 */

import type {
  BilanImportPrince,
  CorpsFaitPrince,
  FaitPrinceApplique,
  ImpactEcolePrince,
  ImpactPrince,
  LieuPrince,
  SchoolDiagnostic,
} from '../../contrat'
import type { Acces } from '../acces'
import type { EnseignantDjango } from '../conversions/enseignants'
import * as source from '../sources'
import type { Conversion } from '../types'

/** Fait du Prince tel que le sert le serveur. */
interface FaitDjango {
  id: number
  id_ens: string
  id_etab: string
  motif: string
  statut: string
  cree_le: string
}

function lieu(id: string, ecoles: Map<string, SchoolDiagnostic>): LieuPrince {
  const s = ecoles.get(id)?.school
  return {
    id,
    nom: s?.nom ?? id,
    commune: s?.commune ?? '',
    departement: s?.departement ?? '',
    region: s?.region ?? '',
  }
}

/** Fiche d'un enseignant, `null` s'il est absent du jeu. */
async function enseignant(acces: Acces, jeu: string, matricule: string): Promise<EnseignantDjango | null> {
  try {
    const d = await acces.lire<{ enseignant: EnseignantDjango }>(
      `jeux/${jeu}/enseignants/${encodeURIComponent(matricule)}/`,
    )
    return d.enseignant
  } catch {
    return null
  }
}

async function versFaitApplique(acces: Acces, jeu: string, f: FaitDjango): Promise<FaitPrinceApplique> {
  const [ecoles, t] = await Promise.all([source.diagnosticsParId(acces, jeu), enseignant(acces, jeu, f.id_ens)])
  const origine = t?.Ecole_Attache_Actuelle ?? ''
  const statut = !t ? 'enseignant_introuvable' : !ecoles.has(f.id_etab) ? 'ecole_introuvable' : 'applique'
  return {
    fait: {
      id: String(f.id),
      teacherId: f.id_ens,
      schoolDestinationId: f.id_etab,
      reference: f.motif,
      decideLe: f.cree_le,
      enseignant: t ? `${t.nom} ${t.prenom}`.trim() : f.id_ens,
      origine: lieu(origine, ecoles),
      destination: lieu(f.id_etab, ecoles),
    },
    statut,
    motif:
      statut === 'applique'
        ? 'Décision appliquée : l’enseignant est rattaché à sa nouvelle école et sorti du vivier.'
        : statut === 'enseignant_introuvable'
          ? 'Matricule absent des données du jeu.'
          : 'École de destination absente des données du jeu.',
  }
}

/** Effet d'un départ (−1) ou d'une arrivée (+1) sur une école, selon les formules du serveur. */
function impactEcole(d: SchoolDiagnostic, variation: number): ImpactEcolePrince {
  const avant = d.calcul.enseignantsRetenus
  const apres = Math.max(0, avant + variation)
  return {
    nom: d.school.nom,
    effectifAvant: avant,
    effectifApres: apres,
    besoinAvant: d.besoinTheorique,
    besoinApres: Math.max(0, d.calcul.cible - apres),
    excedentAvant: d.excedentTheorique,
    excedentApres: Math.max(0, apres - d.calcul.dotation),
  }
}

function corpsServeur(c: CorpsFaitPrince) {
  return { id_ens: c.matricule, id_etab: c.ecoleDestination, motif: c.reference }
}

export const conversionsPrince: Record<string, Conversion> = {
  'GET jeux/{jeu}/faits-prince/': async (_, acces, p) => {
    const faits = (await acces.lire<FaitDjango[]>(`jeux/${p.jeu}/faits-prince/`)).filter(f => f.statut !== 'ANNULE')
    return Promise.all(faits.map(f => versFaitApplique(acces, p.jeu, f)))
  },

  'POST jeux/{jeu}/faits-prince/': async (r, acces, p) => {
    const f = await acces.ecrire<FaitDjango>(
      'POST',
      `jeux/${p.jeu}/faits-prince/`,
      corpsServeur(r.corps as CorpsFaitPrince),
    )
    return versFaitApplique(acces, p.jeu, f)
  },

  'POST jeux/{jeu}/faits-prince/impact/': async (r, acces, p): Promise<ImpactPrince> => {
    const c = r.corps as CorpsFaitPrince
    const [simulation, ecoles, t] = await Promise.all([
      acces.ecrire<{
        scenario: string
        ecart: Record<string, number>
        affectations_modifiees: { id_ens: string; avant: string; apres: string }[]
      }>('POST', `jeux/${p.jeu}/faits-prince/impact/`, corpsServeur(c)),
      source.diagnosticsParId(acces, p.jeu),
      enseignant(acces, p.jeu, c.matricule),
    ])
    const origine = t ? ecoles.get(t.Ecole_Attache_Actuelle) : undefined
    const destination = ecoles.get(c.ecoleDestination)
    const observations: string[] = []
    if (destination && destination.besoinTheorique === 0)
      observations.push(
        "L'école de destination n'avait pas de besoin : l'algorithme n'y aurait pas affecté d'enseignant.",
      )
    if (origine && origine.excedentTheorique === 0)
      observations.push("L'école d'origine n'avait pas d'excédent : ce départ y crée un besoin.")
    const e = simulation.ecart
    if (e.affectes)
      observations.push(`${e.affectes > 0 ? '+' : ''}${e.affectes} affectation(s) dans « ${simulation.scenario} ».`)
    if (e.postes_non_pourvus)
      observations.push(
        `${e.postes_non_pourvus > 0 ? '+' : ''}${e.postes_non_pourvus} poste(s) non pourvu(s) dans « ${simulation.scenario} ».`,
      )
    const deplaces = simulation.affectations_modifiees.filter(m => m.id_ens !== c.matricule && m.avant !== m.apres)
    if (deplaces.length > 0)
      observations.push(`${deplaces.length} autre(s) proposition(s) d'affectation changent d'école.`)
    return {
      origine: origine ? impactEcole(origine, -1) : null,
      destination: destination
        ? impactEcole(destination, +1)
        : {
            nom: c.ecoleDestination,
            effectifAvant: 0,
            effectifApres: 1,
            besoinAvant: 0,
            besoinApres: 0,
            excedentAvant: 0,
            excedentApres: 0,
          },
      observations,
    }
  },

  'POST jeux/{jeu}/faits-prince/import/': async (r, acces, p): Promise<BilanImportPrince> => {
    const bilan = await acces.ecrire<{
      acceptees: unknown[]
      refusees: { id_ens?: string; id_etab?: string; motifs?: string[]; motif?: string }[]
      manquantes: string[]
    }>('POST', `jeux/${p.jeu}/faits-prince/import/`, r.corps, 'multipart')
    const refus = bilan.refusees.map(
      l => `${l.id_ens ?? '?'} → ${l.id_etab ?? '?'} : ${(l.motifs ?? [l.motif ?? 'refusé']).join(', ')}`,
    )
    if (bilan.manquantes.length > 0) refus.push(`Identifiants absents du jeu : ${bilan.manquantes.join(', ')}`)
    return { acceptees: bilan.acceptees.length, refus, manquantes: [] }
  },
}
