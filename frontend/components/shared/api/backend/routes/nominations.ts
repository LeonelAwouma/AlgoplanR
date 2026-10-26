/**
 * Routes des nominations : vivier consolidé, postes ouverts, cycle de vie et
 * registre des mouvements. Le serveur lit le vivier et les postes dans le
 * scénario retenu (à défaut, le scénario par défaut du jeu), garde les
 * nominations et applique les règles contre les doubles comptages (409).
 *
 * Les listes sont relues en entier puis paginées ici, pour trier sur les champs
 * du contrat.
 */

import type {
  CorpsLotNominations,
  CorpsValidationNomination,
  AnneePlan,
  BilanGenerationNominations,
  BilanImportNominations,
  BilanImportVivier,
  BilanLot,
  CandidatPoste,
  ControleMouvements,
  CorpsGenerationNominations,
  CorpsMiseEnOeuvre,
  CorpsMiseEnOeuvreMouvement,
  Mouvement,
  Nomination,
  PersonneVivier,
  PersonneVivierDetail,
  PosteCompatible,
  PosteOuvert,
  ProximityLevel,
  Rapprochement,
  StatutNomination,
  SyntheseNominations,
} from '../../contrat'
import type { ParametresRequete } from '../../client'
import { versBreakdown, type DetailDjango } from '../conversions/enseignants'
import { paginer } from '../liste'
import type { Conversion } from '../types'
import { queryServeur } from './planification'

// --- Formats du serveur ----------------------------------------------------------------------------------

type PersonneDjango = Omit<PersonneVivier, 'sousSysteme' | 'ecoleOrigine'> & {
  sous_systeme: PersonneVivier['sousSysteme']
  ecole_origine: PersonneVivier['ecoleOrigine']
}

interface PosteDjango {
  id: string
  id_ecole: string
  nom_ecole: string
  region: string
  departement: string
  commune: string
  sous_systeme: PosteOuvert['sousSysteme']
  zone_securite: PosteOuvert['zoneSecurite']
  indice_priorite: number
  rang: number
  statut: PosteOuvert['statut']
  nomination_id: string | null
}

interface NominationDjango {
  id: string
  personne: PersonneDjango
  poste: PosteDjango
  annee: AnneePlan
  statut: StatutNomination
  origine: Nomination['origine']
  motif: string | null
  reference_decision: string | null
  reference_acte: string | null
  date_effet: string | null
  creee_le: string
  historique: Nomination['historique']
}

interface RapprochementDjango {
  score: DetailDjango
  proximite: ProximityLevel
  compatible: boolean
  motifs: string[]
}

interface MouvementDjango extends Omit<Mouvement, 'creeLe' | 'realiseLe'> {
  cree_le: string
  realise_le: string | null
}

// --- Conversions -----------------------------------------------------------------------------------------

export function versPersonne(p: PersonneDjango): PersonneVivier {
  return {
    id: p.id,
    matricule: p.matricule,
    nom: p.nom,
    prenom: p.prenom,
    source: p.source,
    sousSysteme: p.sous_systeme,
    region: p.region,
    departement: p.departement,
    commune: p.commune,
    ecoleOrigine: p.ecole_origine,
    bareme: p.bareme,
    note: p.note,
    disponibilite: p.disponibilite,
    contraintes: p.contraintes,
  }
}

export function versPosteOuvert(p: PosteDjango): PosteOuvert {
  return {
    id: p.id,
    schoolId: p.id_ecole,
    nomEtab: p.nom_ecole,
    region: p.region,
    departement: p.departement,
    commune: p.commune,
    sousSysteme: p.sous_systeme,
    zoneSecurite: p.zone_securite,
    indicePriorite: p.indice_priorite,
    rang: p.rang,
    statut: p.statut,
    nominationId: p.nomination_id,
  }
}

export function versNomination(n: NominationDjango): Nomination {
  return {
    id: n.id,
    personne: versPersonne(n.personne),
    poste: versPosteOuvert(n.poste),
    annee: n.annee,
    statut: n.statut,
    origine: n.origine,
    motif: n.motif,
    referenceDecision: n.reference_decision,
    referenceActe: n.reference_acte,
    dateEffet: n.date_effet,
    creeeLe: n.creee_le,
    historique: n.historique,
  }
}

function versRapprochement(r: RapprochementDjango): Rapprochement {
  return { score: versBreakdown(r.score), proximite: r.proximite, compatible: r.compatible, motifs: r.motifs }
}

function versMouvement(m: MouvementDjango): Mouvement {
  return {
    id: m.id,
    type: m.type,
    statut: m.statut,
    annee: m.annee,
    personne: m.personne,
    origine: m.origine,
    destination: m.destination,
    decision: m.decision,
    creeLe: m.cree_le,
    realiseLe: m.realise_le,
  }
}

function miseEnOeuvre(c: CorpsMiseEnOeuvre | CorpsMiseEnOeuvreMouvement) {
  return {
    date_effet: c.dateEffet,
    reference_acte: c.referenceActe,
    auteur: c.auteur,
    ...('verificationSources' in c && c.verificationSources ? { verification_sources: true } : {}),
  }
}

/** Corps d'une décision : `verificationSources` devient le champ du serveur, envoyé seulement quand il est reconnu. */
function versCorpsAvecSources<T extends { verificationSources?: boolean }>(corps: T) {
  const { verificationSources, ...reste } = corps
  return { ...reste, ...(verificationSources ? { verification_sources: true } : {}) }
}

// --- Routes -----------------------------------------------------------------------------------------------

const N = (p: Record<string, string>) => `jeux/${p.jeu}/nominations/${encodeURIComponent(p.nomination)}/`

/** Filtres transmis au serveur (sans pagination ni tri, faits ici). */
function filtres(query: ParametresRequete): ParametresRequete {
  return queryServeur(query)
}

export const conversionsNominations: Record<string, Conversion> = {
  'GET jeux/{jeu}/vivier/': async (r, acces, p) => {
    const { lignes } = await acces.toutes<PersonneDjango>(`jeux/${p.jeu}/vivier/`, filtres(r.query))
    return paginer(lignes.map(versPersonne), r.query)
  },
  'POST jeux/{jeu}/vivier/import/': (r, acces, p): Promise<BilanImportVivier> =>
    acces.ecrire('POST', `jeux/${p.jeu}/vivier/import/`, r.corps, 'multipart'),
  'GET jeux/{jeu}/vivier/{personne}/': async (_, acces, p): Promise<PersonneVivierDetail> => {
    const d = await acces.lire<PersonneDjango & { detail_bareme: DetailDjango | null; historique: NominationDjango[] }>(
      `jeux/${p.jeu}/vivier/${encodeURIComponent(p.personne)}/`,
    )
    return {
      ...versPersonne(d),
      detailBareme: d.detail_bareme ? versBreakdown(d.detail_bareme) : null,
      historique: d.historique.map(versNomination),
    }
  },
  'GET jeux/{jeu}/vivier/{personne}/postes-compatibles/': async (_, acces, p): Promise<PosteCompatible[]> =>
    (
      await acces.lire<(RapprochementDjango & { poste: PosteDjango })[]>(
        `jeux/${p.jeu}/vivier/${encodeURIComponent(p.personne)}/postes-compatibles/`,
      )
    ).map(x => ({ ...versRapprochement(x), poste: versPosteOuvert(x.poste) })),
  'GET jeux/{jeu}/postes-ouverts/': async (r, acces, p) => {
    const { lignes } = await acces.toutes<PosteDjango>(`jeux/${p.jeu}/postes-ouverts/`, filtres(r.query))
    return paginer(lignes.map(versPosteOuvert), r.query)
  },
  'GET jeux/{jeu}/postes-ouverts/{poste}/candidats/': async (_, acces, p): Promise<CandidatPoste[]> =>
    (
      await acces.lire<(RapprochementDjango & { personne: PersonneDjango })[]>(
        `jeux/${p.jeu}/postes-ouverts/${encodeURIComponent(p.poste)}/candidats/`,
      )
    ).map(x => ({ ...versRapprochement(x), personne: versPersonne(x.personne) })),

  'GET jeux/{jeu}/nominations/': async (r, acces, p) => {
    const { lignes } = await acces.toutes<NominationDjango>(`jeux/${p.jeu}/nominations/`, filtres(r.query))
    return paginer(lignes.map(versNomination), r.query)
  },
  'POST jeux/{jeu}/nominations/': async (r, acces, p) =>
    versNomination(await acces.ecrire<NominationDjango>('POST', `jeux/${p.jeu}/nominations/`, r.corps)),
  'POST jeux/{jeu}/nominations/generer/': async (r, acces, p): Promise<BilanGenerationNominations> => {
    const b = await acces.ecrire<{ proposees: number; sans_poste: number; postes_sans_candidat: number }>(
      'POST',
      `jeux/${p.jeu}/nominations/generer/`,
      r.corps as CorpsGenerationNominations,
    )
    return { proposees: b.proposees, sansPoste: b.sans_poste, postesSansCandidat: b.postes_sans_candidat }
  },
  'POST jeux/{jeu}/nominations/lot/': (r, acces, p): Promise<BilanLot> =>
    acces.ecrire('POST', `jeux/${p.jeu}/nominations/lot/`, versCorpsAvecSources(r.corps as CorpsLotNominations)),
  'POST jeux/{jeu}/nominations/import/': (r, acces, p): Promise<BilanImportNominations> =>
    acces.ecrire('POST', `jeux/${p.jeu}/nominations/import/`, r.corps, 'multipart'),
  'GET jeux/{jeu}/nominations/synthese/': async (_, acces, p): Promise<SyntheseNominations> => {
    type Compte = Record<StatutNomination, number>
    const s = await acces.lire<{
      scenario_reference?: string
      scenario_obsolete?: boolean
      par_statut: Compte
      par_territoire: { territoire: string; par_statut: Compte }[]
      par_annee: { annee: AnneePlan; par_statut: Compte }[]
    }>(`jeux/${p.jeu}/nominations/synthese/`)
    return {
      scenarioReference: s.scenario_reference,
      scenarioObsolete: s.scenario_obsolete ?? false,
      parStatut: s.par_statut,
      parTerritoire: s.par_territoire.map(t => ({ territoire: t.territoire, parStatut: t.par_statut })),
      parAnnee: s.par_annee.map(a => ({ annee: a.annee, parStatut: a.par_statut })),
    }
  },
  'GET jeux/{jeu}/nominations/{nomination}/': async (_, acces, p) =>
    versNomination(await acces.lire<NominationDjango>(N(p))),
  'POST jeux/{jeu}/nominations/{nomination}/valider/': async (r, acces, p) =>
    versNomination(
      await acces.ecrire<NominationDjango>(
        'POST',
        `${N(p)}valider/`,
        versCorpsAvecSources(r.corps as CorpsValidationNomination),
      ),
    ),
  'POST jeux/{jeu}/nominations/{nomination}/rejeter/': async (r, acces, p) =>
    versNomination(await acces.ecrire<NominationDjango>('POST', `${N(p)}rejeter/`, r.corps)),
  'POST jeux/{jeu}/nominations/{nomination}/mettre-en-oeuvre/': async (r, acces, p) =>
    versNomination(
      await acces.ecrire<NominationDjango>(
        'POST',
        `${N(p)}mettre-en-oeuvre/`,
        miseEnOeuvre(r.corps as CorpsMiseEnOeuvre),
      ),
    ),
  'POST jeux/{jeu}/nominations/{nomination}/annuler/': async (r, acces, p) =>
    versNomination(await acces.ecrire<NominationDjango>('POST', `${N(p)}annuler/`, r.corps)),

  'GET jeux/{jeu}/mouvements/': async (r, acces, p) => {
    const { lignes } = await acces.toutes<MouvementDjango>(`jeux/${p.jeu}/mouvements/`, filtres(r.query))
    return paginer(lignes.map(versMouvement), r.query)
  },
  'GET jeux/{jeu}/mouvements/controles/': (_, acces, p): Promise<ControleMouvements> =>
    acces.lire(`jeux/${p.jeu}/mouvements/controles/`),
  'GET jeux/{jeu}/mouvements/{mouvement}/': async (_, acces, p) =>
    versMouvement(await acces.lire<MouvementDjango>(`jeux/${p.jeu}/mouvements/${encodeURIComponent(p.mouvement)}/`)),
  'POST jeux/{jeu}/mouvements/{mouvement}/mettre-en-oeuvre/': async (r, acces, p) =>
    versMouvement(
      await acces.ecrire<MouvementDjango>(
        'POST',
        `jeux/${p.jeu}/mouvements/${encodeURIComponent(p.mouvement)}/mettre-en-oeuvre/`,
        miseEnOeuvre(r.corps as CorpsMiseEnOeuvreMouvement),
      ),
    ),
  'GET jeux/{jeu}/personnes/{matricule}/mouvements/': async (_, acces, p) =>
    (await acces.lire<MouvementDjango[]>(`jeux/${p.jeu}/personnes/${encodeURIComponent(p.matricule)}/mouvements/`)).map(
      versMouvement,
    ),
}
