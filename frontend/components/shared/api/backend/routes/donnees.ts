/**
 * Routes du contexte « Données » : classeurs, jeux, qualité, validation et
 * actualisation des jeux, fiches établissement et enseignant, recherche.
 */

import type {
  Actualisation,
  CorpsCorrespondances,
  CorpsCreationJeu,
  CorpsModificationJeu,
  CorpsEnvoiFichier,
  EcartsActualisation,
  EnseignantDetail,
  EtablissementDetail,
  JeuCree,
  QualiteJeu,
  ResultatRecherche,
  SchoolDiagnostic,
  Teacher,
  TypeColonnes,
  ValidationJeu,
} from '../../contrat'
import type { Acces } from '../acces'
import {
  colonnesAttendues,
  versFichier,
  versJeu,
  versRapportQualite,
  type FichierDjango,
  type JeuDjango,
  type QualiteDjango,
} from '../conversions/donnees'
import { versDiagnostic, type EcoleDjango } from '../conversions/ecoles'
import {
  motifMobilite,
  situationRetenue,
  versBreakdown,
  versEnseignantResume,
  versTeacher,
  type DetailDjango,
  type EnseignantDjango,
} from '../conversions/enseignants'
import { versBilanPrince, type BilanPrinceDjango } from '../conversions/prince'
import { normaliser } from '../conversions/referentiel'
import { booleen, paginer, valeur } from '../liste'
import { aucunFiltreActif } from '../moteur/territoires'
import * as source from '../sources'
import type { Conversion } from '../types'

/** Jeu et rapport de qualité, après création. */
async function jeuCree(acces: Acces, jeu: JeuDjango, qualite?: QualiteDjango): Promise<JeuCree> {
  const [q, ecoles] = await Promise.all([
    qualite ?? acces.lire<QualiteDjango>(`jeux/${jeu.id}/qualite/`),
    source.diagnostics(acces, jeu.id),
  ])
  return { jeu: versJeu(jeu), qualite: versRapportQualite(q, ecoles) }
}

/** Élément désigné sans ambiguïté : correspondance exacte de l'identifiant, ou résultat unique. */
function recherche<T>(saisie: string, candidats: T[], identifiant: (t: T) => string): ResultatRecherche<T> {
  const exact = candidats.filter(c => normaliser(identifiant(c)) === normaliser(saisie))
  const trouve = exact.length === 1 ? exact[0] : candidats.length === 1 ? candidats[0] : null
  return { trouve, candidats }
}

/** Validation d'un jeu telle que la sert le serveur. */
function versValidation(v: {
  statut: ValidationJeu['statut']
  valide_le: string | null
  valide_par: string | null
  reserve?: ValidationJeu['reserve']
  controles: ValidationJeu['controles']
}): ValidationJeu {
  return {
    statut: v.statut,
    valideLe: v.valide_le,
    validePar: v.valide_par,
    reserve: v.reserve ?? null,
    controles: v.controles,
  }
}

interface ActualisationDjango {
  id: string
  realisee_le: string
  realisee_par: string | null
  fichiers_source: Actualisation['fichiersSource']
  resume: { arrivees: number; departs: number; changements_ecole: number; decisions_invalidees: number }
}

function versActualisation(a: ActualisationDjango): Actualisation {
  return {
    id: a.id,
    realiseeLe: a.realisee_le,
    realiseePar: a.realisee_par,
    fichiersSource: a.fichiers_source,
    resume: {
      arrivees: a.resume.arrivees,
      departs: a.resume.departs,
      changementsEcole: a.resume.changements_ecole,
      decisionsInvalidees: a.resume.decisions_invalidees,
    },
  }
}

export const conversionsDonnees: Record<string, Conversion> = {
  'GET fichiers/colonnes/': async r => colonnesAttendues((valeur(r.query.type) ?? 'etablissements') as TypeColonnes),

  'POST fichiers/': async (r, acces) => {
    const { baseNationale, ...champs } = r.corps as CorpsEnvoiFichier
    return versFichier(
      await acces.ecrire<FichierDjango>('POST', 'fichiers/', { ...champs, base_nationale: baseNationale }, 'multipart'),
    )
  },

  'PATCH fichiers/{fichier}/correspondances/': async (r, acces, p) => {
    const { correspondances } = r.corps as CorpsCorrespondances
    const correspondance = Object.fromEntries(Object.entries(correspondances).map(([champ, h]) => [champ, h ?? '']))
    return versFichier(
      await acces.ecrire<FichierDjango>('PATCH', `fichiers/${p.fichier}/correspondances/`, { correspondance }),
    )
  },

  'GET jeux/': async (_, acces) => {
    const jeux = await acces.lire<JeuDjango[]>('jeux/')
    return jeux.map(versJeu).sort((a, b) => b.importeLe.localeCompare(a.importeLe))
  },

  'POST jeux/': async (r, acces) => {
    const c = r.corps as CorpsCreationJeu
    const cree = await acces.ecrire<JeuDjango & { qualite: QualiteDjango; prince?: BilanPrinceDjango }>(
      'POST',
      'jeux/',
      {
        fichier_etablissements: c.etablissements,
        fichier_enseignants: c.enseignants,
        ...(c.prince ? { fichier_prince: c.prince } : {}),
        ...(c.anneeScolaire ? { annee_scolaire: c.anneeScolaire } : {}),
        ...(c.sensAnneeScolaire ? { sens_annee_scolaire: c.sensAnneeScolaire } : {}),
        ...(c.donneesFictives ? { donnees_fictives: true } : {}),
      },
    )
    return {
      ...(await jeuCree(acces, cree, cree.qualite)),
      ...(cree.prince ? { prince: versBilanPrince(cree.prince) } : {}),
    }
  },

  'POST jeux/demonstration/': async (_, acces) =>
    jeuCree(acces, await acces.ecrire<JeuDjango>('POST', 'jeux/demonstration/', {})),

  'GET jeux/{jeu}/': async (_, acces, p) => versJeu(await acces.lire<JeuDjango>(`jeux/${p.jeu}/`)),

  'PATCH jeux/{jeu}/': async (r, acces, p) => {
    const c = r.corps as CorpsModificationJeu
    return versJeu(
      await acces.ecrire<JeuDjango>('PATCH', `jeux/${p.jeu}/`, {
        ...(c.sensAnneeScolaire ? { sens_annee_scolaire: c.sensAnneeScolaire } : {}),
        ...(c.donneesFictives !== undefined ? { donnees_fictives: c.donneesFictives } : {}),
      }),
    )
  },

  'GET jeux/{jeu}/qualite/': async (_, acces, p): Promise<QualiteJeu> => {
    const [q, ecoles] = await Promise.all([
      acces.lire<QualiteDjango>(`jeux/${p.jeu}/qualite/`),
      source.diagnostics(acces, p.jeu),
    ])
    return { rapport: versRapportQualite(q, ecoles), correspondances: { etablissements: null, enseignants: null } }
  },

  'GET jeux/{jeu}/validation/': async (_, acces, p) => versValidation(await acces.lire(`jeux/${p.jeu}/validation/`)),
  'POST jeux/{jeu}/validation/': async (r, acces, p) =>
    versValidation(await acces.ecrire('POST', `jeux/${p.jeu}/validation/`, r.corps)),
  'GET jeux/{jeu}/actualisations/': async (_, acces, p) =>
    (await acces.lire<ActualisationDjango[]>(`jeux/${p.jeu}/actualisations/`)).map(versActualisation),
  'POST jeux/{jeu}/actualisations/': async (r, acces, p) =>
    versActualisation(await acces.ecrire<ActualisationDjango>('POST', `jeux/${p.jeu}/actualisations/`, r.corps)),
  'GET jeux/{jeu}/actualisations/{actualisation}/ecarts/': async (_, acces, p): Promise<EcartsActualisation> => {
    const e = await acces.lire<
      Omit<EcartsActualisation, 'changementsEcole' | 'decisionsInvalidees'> & {
        changements_ecole: { matricule: string; nom: string; ancienne_ecole: string; nouvelle_ecole: string }[]
        decisions_invalidees: EcartsActualisation['decisionsInvalidees']
      }
    >(`jeux/${p.jeu}/actualisations/${encodeURIComponent(p.actualisation)}/ecarts/`)
    const personne = (x: { matricule: string; nom: string; ecole: string }) => ({
      matricule: x.matricule,
      nom: x.nom,
      ecole: x.ecole,
    })
    return {
      arrivees: e.arrivees.map(personne),
      departs: e.departs.map(personne),
      changementsEcole: e.changements_ecole.map(c => ({
        matricule: c.matricule,
        nom: c.nom,
        ancienneEcole: c.ancienne_ecole,
        nouvelleEcole: c.nouvelle_ecole,
      })),
      decisionsInvalidees: e.decisions_invalidees,
    }
  },

  'GET jeux/{jeu}/etablissements/': async (r, acces, p) => {
    let ecoles = await source.diagnosticsFiltres(acces, p.jeu, r.query)
    const q = normaliser(valeur(r.query.q))
    if (q) {
      ecoles = ecoles.filter(d =>
        [d.school.id, d.school.nom, d.school.commune].some(champ => normaliser(champ).includes(q)),
      )
    }
    return paginer(ecoles, r.query, {
      besoin: d => d.besoinTheorique,
      excedent: d => d.excedentTheorique,
      indice: d => d.priorite.indice,
      nom: d => d.school.nom,
    })
  },

  'GET jeux/{jeu}/etablissements/{ecole}/': async (_, acces, p): Promise<EtablissementDetail> => {
    const [brut, settings, enseignants] = await Promise.all([
      acces.lire<{ ecole: EcoleDjango }>(`jeux/${p.jeu}/etablissements/${encodeURIComponent(p.ecole)}/`),
      source.parametres(acces, p.jeu),
      acces.toutes<EnseignantDjango>(`jeux/${p.jeu}/enseignants/`, { ecole: p.ecole }),
    ])
    const ligne = (await source.diagnosticsParId(acces, p.jeu)).get(p.ecole)?.school.ligneSource ?? 0
    const diagnostic = versDiagnostic(brut.ecole, ligne, settings)
    return {
      diagnostic,
      enseignants: enseignants.lignes.map(t => versTeacher(t)),
      structure: diagnostic.school.estStructure,
    }
  },

  'GET jeux/{jeu}/enseignants/': async (r, acces, p) => {
    const [tous, settings, ecoles] = await Promise.all([
      source.enseignantsDjango(acces, p.jeu),
      source.parametres(acces, p.jeu),
      source.diagnosticsParId(acces, p.jeu),
    ])
    const scenario = valeur(r.query.scenario)
    const duVivier = scenario
      ? new Set((await source.vivier(acces, p.jeu, scenario)).map(t => t.Matricule_Enseignant))
      : null

    let lignes = tous.map((t, i) => {
      const enseignant = duVivier ? { ...t, dans_vivier: duVivier.has(t.Matricule_Enseignant) } : t
      return versEnseignantResume(enseignant, i + 1, ecoles.get(t.Ecole_Attache_Actuelle)?.school.nom ?? '', settings)
    })

    const filtres = source.filtresDepuis(r.query)
    if (!aucunFiltreActif(filtres)) {
      const perimetre = new Set((await source.diagnosticsFiltres(acces, p.jeu, r.query)).map(d => d.school.id))
      lignes = lignes.filter(l => perimetre.has(l.teacher.idEtabAttache))
    }
    const ecole = valeur(r.query.ecole)
    if (ecole) lignes = lignes.filter(l => l.teacher.idEtabAttache === ecole)
    const mobilisable = booleen(r.query.mobilisable)
    if (mobilisable !== undefined) lignes = lignes.filter(l => l.mobilisable === mobilisable)
    const q = normaliser(valeur(r.query.q))
    if (q) {
      lignes = lignes.filter(l =>
        [l.teacher.id, l.teacher.nom, l.teacher.prenom, `${l.teacher.nom} ${l.teacher.prenom}`].some(c =>
          normaliser(c).includes(q),
        ),
      )
    }
    return paginer(lignes, r.query, { nom: l => l.teacher.nom, matricule: l => l.teacher.id })
  },

  'GET jeux/{jeu}/enseignants/{matricule}/': async (_, acces, p): Promise<EnseignantDetail> => {
    const [d, settings, ecoles] = await Promise.all([
      acces.lire<{
        enseignant: EnseignantDjango
        bareme: DetailDjango
        eligibilite: { eligible: boolean; code: string; raison: string }
      }>(`jeux/${p.jeu}/enseignants/${encodeURIComponent(p.matricule)}/`),
      source.parametres(acces, p.jeu),
      source.diagnosticsParId(acces, p.jeu),
    ])
    const ecole = ecoles.get(d.enseignant.Ecole_Attache_Actuelle)?.school ?? null
    const mobilisable = d.eligibilite.code === 'VIVIER'
    return {
      teacher: versTeacher(d.enseignant, 0),
      nomEtab: ecole?.nom ?? '',
      bareme: d.bareme.total,
      mobilisable,
      motif: d.eligibilite.raison
        ? `${d.eligibilite.raison}.`
        : motifMobilite({ ...d.enseignant, dans_vivier: mobilisable }, mobilisable),
      situation: situationRetenue(d.enseignant.Situation_Matrimoniale, settings),
      ecole,
      detailBareme: versBreakdown(d.bareme),
    }
  },

  'GET jeux/{jeu}/recherche/enseignants/': async (r, acces, p): Promise<ResultatRecherche<Teacher>> => {
    const saisie = valeur(r.query.q) ?? ''
    const reponse = await acces.lire<{ resultats: EnseignantDjango[] }>(`jeux/${p.jeu}/recherche/enseignants/`, {
      q: saisie,
    })
    return recherche(
      saisie,
      reponse.resultats.map(t => versTeacher(t)),
      t => t.id,
    )
  },

  'GET jeux/{jeu}/recherche/etablissements/': async (r, acces, p): Promise<ResultatRecherche<SchoolDiagnostic>> => {
    const saisie = valeur(r.query.q) ?? ''
    const [reponse, ecoles] = await Promise.all([
      acces.lire<{ resultats: EcoleDjango[] }>(`jeux/${p.jeu}/recherche/etablissements/`, { q: saisie }),
      source.diagnosticsParId(acces, p.jeu),
    ])
    const candidats = reponse.resultats
      .map(e => ecoles.get(e.Identifiant_Ecole))
      .filter((d): d is SchoolDiagnostic => d !== undefined)
    return recherche(saisie, candidats, d => d.school.id)
  },
}
