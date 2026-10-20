/**
 * Routes des faits du Prince. Le serveur ne garde que le matricule, l'école de
 * destination et le motif : le nom de l'enseignant et les deux écoles sont
 * relus dans les données du jeu.
 */

import type {
  ApercuImportPrince,
  ApplicationPrince,
  BilanImportPrince,
  CorpsFaitPrince,
  DecisionApplicationPrince,
  StatutFaitPrince,
  FaitPrinceApplique,
  ImpactEcolePrince,
  ImpactPrince,
  LieuPrince,
  SchoolDiagnostic,
} from '../../contrat'
import type { Acces, PageDjango } from '../acces'
import { versBilanPrince, type BilanPrinceDjango } from '../conversions/prince'
import * as source from '../sources'
import type { Conversion } from '../types'

/** Fait du Prince tel que le sert le serveur. */
interface FaitDjango {
  id: number
  id_ens: string
  id_etab: string
  motif: string
  statut: string
  /** Fait devenu impossible après une actualisation (statut INVALIDE). */
  motif_invalidite?: string | null
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

/** Décision de l'application aux bases, telle que la sert le serveur (noms de colonnes des classeurs). */
interface DecisionDjango {
  Ordre: number
  Matricule_Enseignant: string
  Nom_Enseignant: string
  Ecole_Origine: string
  Nom_Ecole_Origine: string
  Ecole_Destination: string
  Nom_Ecole_Destination: string
  Statut: string
  Alertes: string
  Motifs_Rejet: string
  Reference_Decision: string
  Enseignants_Origine_Avant: number | null
  Enseignants_Origine_Apres: number | null
  Besoin_Origine_Avant: number | null
  Besoin_Origine_Apres: number | null
  Enseignants_Destination_Avant: number | null
  Enseignants_Destination_Apres: number | null
  Besoin_Destination_Avant: number | null
  Besoin_Destination_Apres: number | null
  Nouvelle?: boolean
}

interface TotauxDjango {
  ecoles: number
  enseignants: number
  besoin_postes: number
  ecoles_deficitaires: number
}

interface ApplicationDjango {
  resume: { identifiees: number; appliquees: number; avec_alerte: number; rejetees: number }
  avant: TotauxDjango
  apres: TotauxDjango
  decisions: DecisionDjango[]
  ecarts_effectifs: {
    id_ecole: string
    nom_ecole: string
    enseignants_declares: number
    matricules_rattaches: number
    ecart: number
  }[]
}

const liste = (texte: string): string[] => (texte ? texte.split(' ; ') : [])

function versDecision(d: DecisionDjango): DecisionApplicationPrince {
  const rejetee = d.Motifs_Rejet !== ''
  return {
    ordre: d.Ordre,
    matricule: d.Matricule_Enseignant,
    enseignant: d.Nom_Enseignant || d.Matricule_Enseignant,
    ecoleOrigine: d.Ecole_Origine,
    nomEcoleOrigine: d.Nom_Ecole_Origine,
    ecoleDestination: d.Ecole_Destination,
    nomEcoleDestination: d.Nom_Ecole_Destination,
    statut: rejetee ? 'rejetee' : d.Alertes ? 'appliquee_avec_alerte' : 'appliquee',
    alertes: liste(d.Alertes),
    motifsRejet: liste(d.Motifs_Rejet),
    reference: d.Reference_Decision,
    origine: {
      effectifAvant: d.Enseignants_Origine_Avant,
      effectifApres: d.Enseignants_Origine_Apres,
      besoinAvant: d.Besoin_Origine_Avant,
      besoinApres: d.Besoin_Origine_Apres,
    },
    destination: {
      effectifAvant: d.Enseignants_Destination_Avant,
      effectifApres: d.Enseignants_Destination_Apres,
      besoinAvant: d.Besoin_Destination_Avant,
      besoinApres: d.Besoin_Destination_Apres,
    },
    nouvelle: d.Nouvelle === true,
  }
}

const versTotaux = (t: TotauxDjango) => ({
  ecoles: t.ecoles,
  enseignants: t.enseignants,
  besoinPostes: t.besoin_postes,
  ecolesDeficitaires: t.ecoles_deficitaires,
})

function versApplication(a: ApplicationDjango): ApplicationPrince {
  return {
    resume: {
      identifiees: a.resume.identifiees,
      appliquees: a.resume.appliquees,
      avecAlerte: a.resume.avec_alerte,
      rejetees: a.resume.rejetees,
    },
    avant: versTotaux(a.avant),
    apres: versTotaux(a.apres),
    decisions: a.decisions.map(versDecision),
    ecartsEffectifs: a.ecarts_effectifs.map(e => ({
      ecole: e.id_ecole,
      nomEcole: e.nom_ecole,
      enseignantsDeclares: e.enseignants_declares,
      matriculesRattaches: e.matricules_rattaches,
      ecart: e.ecart,
    })),
  }
}

/** Sort d'une décision rejetée, d'après le motif donné par le serveur. */
function statutDeRejet(motifs: string): StatutFaitPrince {
  if (motifs.includes('introuvable dans la base')) return 'enseignant_introuvable'
  if (motifs.includes('destination inconnue')) return 'ecole_introuvable'
  if (motifs.includes('déjà rattaché')) return 'meme_ecole'
  if (motifs.includes('doublon') || motifs.includes('contradictoires')) return 'doublon'
  return 'rejete'
}

function versFaitApplique(
  f: FaitDjango,
  d: DecisionDjango | undefined,
  ecoles: Map<string, SchoolDiagnostic>,
): FaitPrinceApplique {
  const invalide = f.statut === 'INVALIDE'
  const rejetee = !d || d.Motifs_Rejet !== ''
  const statut: StatutFaitPrince = invalide
    ? 'invalide'
    : !d
      ? 'enseignant_introuvable'
      : rejetee
        ? statutDeRejet(d.Motifs_Rejet)
        : d.Alertes
          ? 'applique_avec_alerte'
          : 'applique'
  return {
    fait: {
      id: String(f.id),
      teacherId: f.id_ens,
      schoolDestinationId: f.id_etab,
      reference: f.motif,
      decideLe: f.cree_le,
      enseignant: d?.Nom_Enseignant || f.id_ens,
      origine: lieu(d?.Ecole_Origine ?? '', ecoles),
      destination: lieu(f.id_etab, ecoles),
    },
    statut,
    motif: invalide
      ? `Devenu impossible après l’actualisation des données : ${f.motif_invalidite ?? 'motif non précisé'}. Il n’est pas appliqué.`
      : !d
        ? 'Matricule absent des données du jeu.'
        : rejetee
          ? d.Motifs_Rejet
          : d.Alertes
            ? `Décision appliquée aux bases, avec alerte : ${d.Alertes}`
            : 'Décision appliquée aux bases : l’enseignant est rattaché à sa nouvelle école et sorti du vivier.',
  }
}

/** Sort de chaque fait au regard des bases : l'application des faits actifs, lue une fois pour toutes. */
async function faitsApplique(acces: Acces, jeu: string, faits: FaitDjango[]): Promise<FaitPrinceApplique[]> {
  const [application, ecoles] = await Promise.all([
    acces.lire<ApplicationDjango>(`jeux/${jeu}/faits-prince/application/`),
    source.diagnosticsParId(acces, jeu),
  ])
  const decisions = new Map(application.decisions.map(d => [d.Matricule_Enseignant, d]))
  return faits.map(f => versFaitApplique(f, decisions.get(f.id_ens), ecoles))
}

/** École avant / après le fait, telle que la calcule le serveur (même prétraitement que l'import). */
interface EtatEcoleDjango {
  nom: string
  effectif: number
  besoin: number
  excedent: number
}

interface EcartEcoleDjango {
  id: string
  avant: EtatEcoleDjango
  apres: EtatEcoleDjango
}

const versImpactEcole = (e: EcartEcoleDjango): ImpactEcolePrince => ({
  nom: e.avant.nom,
  effectifAvant: e.avant.effectif,
  effectifApres: e.apres.effectif,
  besoinAvant: e.avant.besoin,
  besoinApres: e.apres.besoin,
  excedentAvant: e.avant.excedent,
  excedentApres: e.apres.excedent,
})

function corpsServeur(c: CorpsFaitPrince) {
  return { id_ens: c.matricule, id_etab: c.ecoleDestination, motif: c.reference }
}

export const conversionsPrince: Record<string, Conversion> = {
  'GET jeux/{jeu}/faits-prince/': async (_, acces, p) => {
    const faits = (await acces.lire<FaitDjango[]>(`jeux/${p.jeu}/faits-prince/`)).filter(f => f.statut !== 'ANNULE')
    return faitsApplique(acces, p.jeu, faits)
  },

  'POST jeux/{jeu}/faits-prince/': async (r, acces, p) => {
    const f = await acces.ecrire<FaitDjango>(
      'POST',
      `jeux/${p.jeu}/faits-prince/`,
      corpsServeur(r.corps as CorpsFaitPrince),
    )
    return (await faitsApplique(acces, p.jeu, [f]))[0]
  },

  'POST jeux/{jeu}/faits-prince/impact/': async (r, acces, p): Promise<ImpactPrince> => {
    const c = r.corps as CorpsFaitPrince
    const simulation = await acces.ecrire<{
      scenario: string
      alertes: string[]
      origine: EcartEcoleDjango
      destination: EcartEcoleDjango
      ecart: Record<string, number>
      affectations_modifiees: { id_ens: string; avant: string | null; apres: string | null }[]
    }>('POST', `jeux/${p.jeu}/faits-prince/impact/`, corpsServeur(c))
    const observations = [...simulation.alertes]
    const e = simulation.ecart
    if (e.affectes)
      observations.push(`${e.affectes > 0 ? '+' : ''}${e.affectes} affectation(s) dans « ${simulation.scenario} ».`)
    if (e.postes_non_pourvus)
      observations.push(
        `${e.postes_non_pourvus > 0 ? '+' : ''}${e.postes_non_pourvus} poste(s) non pourvu(s) dans « ${simulation.scenario} ».`,
      )
    const autres = simulation.affectations_modifiees.filter(m => m.id_ens !== c.matricule && m.avant !== m.apres)
    const perdants = autres.filter(m => m.apres === null)
    const deplaces = autres.filter(m => m.apres !== null)
    if (deplaces.length > 0)
      observations.push(`${deplaces.length} autre(s) proposition(s) d'affectation changent d'école.`)
    if (perdants.length > 0)
      observations.push(
        `${perdants.length} enseignant(s) perdent leur affectation proposée (${perdants
          .slice(0, 5)
          .map(m => m.id_ens)
          .join(', ')}${perdants.length > 5 ? '…' : ''}).`,
      )
    return {
      origine: versImpactEcole(simulation.origine),
      destination: versImpactEcole(simulation.destination),
      observations,
    }
  },

  'GET jeux/{jeu}/faits-prince/application/': async (_, acces, p): Promise<ApplicationPrince> =>
    versApplication(await acces.lire<ApplicationDjango>(`jeux/${p.jeu}/faits-prince/application/`)),

  // Essai à blanc d'un fichier : même route d'import côté serveur, avec `apercu=1` ; rien n'est enregistré.
  'POST jeux/{jeu}/faits-prince/import/apercu/': async (r, acces, p): Promise<ApercuImportPrince> => {
    const d = await acces.ecrire<{ bilan: BilanPrinceDjango; application: ApplicationDjango }>(
      'POST',
      `jeux/${p.jeu}/faits-prince/import/?apercu=1`,
      r.corps,
      'multipart',
    )
    return { bilan: versBilanPrince(d.bilan), application: versApplication(d.application) }
  },

  // Bases après Prince : pagination, tri, recherche et filtre « concernés » sont faits par le serveur.
  'GET jeux/{jeu}/faits-prince/bases/{base}/': async (r, acces, p) => {
    const page = await acces.lire<PageDjango<unknown>>(`jeux/${p.jeu}/faits-prince/bases/${p.base}/`, r.query)
    return { elements: page.resultats, total: page.count, page: page.page, taille: page.taille }
  },

  'POST jeux/{jeu}/faits-prince/import/': async (r, acces, p): Promise<BilanImportPrince> => {
    return versBilanPrince(
      await acces.ecrire<BilanPrinceDjango>('POST', `jeux/${p.jeu}/faits-prince/import/`, r.corps, 'multipart'),
    )
  },
}
