/**
 * Données factices — vivier, postes ouverts, nominations, registre des
 * mouvements et journal d'audit.
 *
 * Le cycle de vie suit le document des routes (section 5) : proposée →
 * validée → mise en œuvre, ou rejetée / annulée. Une nomination validée réserve
 * son poste et inscrit un mouvement « prévu » au registre ; mise en œuvre, elle
 * pourvoit le poste et rend le mouvement « réalisé ». Une personne ou un poste
 * ne peut être engagé que dans une seule nomination active.
 */

import { http } from 'msw'

import type {
  AnomalieMouvement,
  BilanGenerationNominations,
  BilanImportNominations,
  BilanImportVivier,
  BilanLot,
  CandidatPoste,
  ControleMouvements,
  CorpsGenerationNominations,
  CorpsLotNominations,
  CorpsMiseEnOeuvre,
  CorpsMiseEnOeuvreMouvement,
  CorpsMotifNomination,
  CorpsNomination,
  CorpsValidationNomination,
  Mouvement,
  Nomination,
  PersonneVivierDetail,
  StatutNomination,
  SyntheseNominations,
} from '../../components/shared/api'
import { ANNEES_PLAN } from '../../components/shared/api'

import { auditer, etat, maintenant, nouvelId } from '../etat'
import { MOUVEMENTS, NOMINATIONS, POSTES_OUVERTS, VIVIER, estApproximation, traiterListe } from '../listes'
import { conflit, introuvable, ok, refus } from '../reponses'
import { api, corps, jeuConnu, lireCatalogue, parametre } from './outils'

const STATUTS: StatutNomination[] = ['proposee', 'validee', 'mise_en_oeuvre', 'rejetee', 'annulee']
const ACTIFS: StatutNomination[] = ['proposee', 'validee']

/** Résultat d'une transition : la nomination modifiée, ou le motif du refus. */
type Transition = { nomination: Nomination } | { refus: string }

function compter(nominations: Nomination[]): Record<StatutNomination, number> {
  return Object.fromEntries(STATUTS.map(s => [s, nominations.filter(n => n.statut === s).length])) as Record<
    StatutNomination,
    number
  >
}

/** Remet la personne et le poste d'une nomination dans l'état courant. */
function synchroniser(n: Nomination): Nomination {
  const e = etat()
  const personne = e.vivier.find(p => p.id === n.personne.id)
  const poste = e.postesOuverts.find(p => p.id === n.poste.id)
  if (personne) n.personne = { ...personne }
  if (poste) n.poste = { ...poste }
  return n
}

/** Applique un changement de statut, avec ses effets sur le poste, la personne et le registre. */
function transition(
  nomination: Nomination,
  vers: StatutNomination,
  auteur: string,
  details: { motif?: string; reference?: string; dateEffet?: string },
): Transition {
  const autorisees: Record<StatutNomination, StatutNomination[]> = {
    proposee: ['validee', 'rejetee', 'annulee'],
    validee: ['mise_en_oeuvre', 'annulee'],
    mise_en_oeuvre: [],
    rejetee: [],
    annulee: [],
  }
  if (!autorisees[nomination.statut].includes(vers)) {
    return {
      refus: `Une nomination « ${nomination.statut.replace('_', ' ')} » ne peut pas devenir « ${vers.replace('_', ' ')} ».`,
    }
  }

  const e = etat()
  const personne = e.vivier.find(p => p.id === nomination.personne.id)
  const poste = e.postesOuverts.find(p => p.id === nomination.poste.id)
  const le = details.dateEffet ?? maintenant()
  const de = nomination.statut
  nomination.statut = vers
  nomination.historique.push({
    de,
    vers,
    le: maintenant(),
    auteur,
    motif: details.motif ?? null,
    reference: details.reference ?? null,
  })

  if (vers === 'validee') {
    nomination.referenceDecision = details.reference ?? null
    if (personne) personne.disponibilite = 'nommee'
    if (poste) Object.assign(poste, { statut: 'reserve', nominationId: nomination.id })
    e.mouvements.push({
      id: `mvt-${nomination.id}`,
      type: 'nomination',
      statut: 'prevu',
      annee: nomination.annee,
      personne: {
        matricule: nomination.personne.matricule,
        nom: `${nomination.personne.nom} ${nomination.personne.prenom}`.trim(),
      },
      origine: nomination.personne.ecoleOrigine,
      destination: {
        id: nomination.poste.schoolId,
        nom: nomination.poste.nomEtab,
        commune: nomination.poste.commune,
        region: nomination.poste.region,
      },
      decision: { type: 'nomination', id: nomination.id, reference: nomination.referenceDecision },
      creeLe: maintenant(),
      realiseLe: null,
    })
  } else if (vers === 'mise_en_oeuvre') {
    nomination.referenceActe = details.reference ?? null
    nomination.dateEffet = le
    if (poste) poste.statut = 'pourvu'
    const mouvement = e.mouvements.find(m => m.decision.type === 'nomination' && m.decision.id === nomination.id)
    if (mouvement) Object.assign(mouvement, { statut: 'realise', realiseLe: le })
  } else {
    // Rejet ou annulation : la personne et le poste redeviennent libres, le mouvement prévu disparaît.
    nomination.motif = details.motif ?? nomination.motif
    if (personne) personne.disponibilite = 'libre'
    if (poste) Object.assign(poste, { statut: 'libre', nominationId: null })
    e.mouvements = e.mouvements.filter(m => !(m.decision.type === 'nomination' && m.decision.id === nomination.id))
  }

  auditer(
    'nomination',
    vers,
    `Nomination de ${nomination.personne.nom} sur ${nomination.poste.nomEtab} : ${vers.replace('_', ' ')}`,
    auteur,
    {
      type: 'nomination',
      id: nomination.id,
    },
    { statut: de },
    { statut: vers },
  )
  return { nomination: synchroniser(nomination) }
}

/** Crée une nomination proposée, après contrôle des doubles engagements. */
function proposer(
  personneId: string,
  posteId: string,
  annee: Nomination['annee'],
  motif: string,
  auteur: string,
  origine: Nomination['origine'],
): Transition {
  const e = etat()
  const personne = e.vivier.find(p => p.id === personneId)
  const poste = e.postesOuverts.find(p => p.id === posteId)
  if (!personne) return { refus: 'Cette personne n’est pas dans le vivier.' }
  if (!poste) return { refus: 'Ce poste n’est pas ouvert.' }
  if (personne.disponibilite !== 'libre')
    return { refus: `${personne.nom} est déjà engagé(e) dans une nomination active.` }
  if (poste.statut !== 'libre') return { refus: `Le poste de ${poste.nomEtab} est déjà réservé ou pourvu.` }

  personne.disponibilite = 'proposee'
  const nomination: Nomination = {
    id: nouvelId('nom'),
    personne: { ...personne },
    poste: { ...poste },
    annee,
    statut: 'proposee',
    origine,
    motif,
    referenceDecision: null,
    referenceActe: null,
    dateEffet: null,
    creeeLe: maintenant(),
    historique: [{ de: null, vers: 'proposee', le: maintenant(), auteur, motif, reference: null }],
  }
  e.nominations.push(nomination)
  auditer(
    'nomination',
    'proposee',
    `Nomination proposée : ${personne.nom} sur ${poste.nomEtab}`,
    auteur,
    {
      type: 'nomination',
      id: nomination.id,
    },
    null,
    { statut: 'proposee' },
  )
  return { nomination }
}

function repondre(resultat: Transition, statut = 200) {
  return 'refus' in resultat ? conflit(resultat.refus) : ok(resultat.nomination, false, statut)
}

/** Nomination désignée par la route, ou `null`. */
function nominationDe(id: unknown): Nomination | null {
  return etat().nominations.find(n => n.id === id) ?? null
}

/** Contrôle des doubles comptages du registre : une personne ou un poste dans deux mouvements. */
function controler(mouvements: Mouvement[]): ControleMouvements {
  const anomalies: AnomalieMouvement[] = []
  const parPersonne = new Map<string, string[]>()
  for (const m of mouvements) {
    if (!m.personne.matricule) continue
    parPersonne.set(m.personne.matricule, [...(parPersonne.get(m.personne.matricule) ?? []), m.id])
  }
  for (const [matricule, ids] of parPersonne) {
    if (ids.length > 1) {
      anomalies.push({
        code: 'personne_comptee_deux_fois',
        libelle: `Le matricule ${matricule} figure dans plusieurs mouvements.`,
        mouvements: ids,
      })
    }
  }
  return { ok: anomalies.length === 0, anomalies }
}

export const gestionnairesNominations = [
  // --- Vivier et postes ouverts ---------------------------------------------------------------
  http.get(api('jeux/:jeu/vivier/'), ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const q = new URL(request.url).searchParams
    const { page, utilises } = traiterListe(etat().vivier, q, VIVIER)
    return ok(page, estApproximation(q, utilises))
  }),
  http.post(api('jeux/:jeu/vivier/import/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const bilan: BilanImportVivier = {
      ajoutees: 0,
      refus: ['Données factices : la lecture des fichiers du vivier demande le serveur AlgoPlanR.'],
      manquantes: [],
    }
    return ok(bilan)
  }),
  http.get(api('jeux/:jeu/vivier/:personne/postes-compatibles/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const e = etat()
    const postes = e.rapprochements[parametre(params.personne)]
    if (!postes) return introuvable('Cette personne n’est pas dans le vivier.')
    return ok(postes.map(p => ({ ...p, poste: e.postesOuverts.find(o => o.id === p.poste.id) ?? p.poste })))
  }),
  http.get(api('jeux/:jeu/vivier/:personne/'), async ({ params }) => {
    const jeu = parametre(params.jeu)
    if (!jeuConnu(jeu)) return introuvable()
    const id = parametre(params.personne)
    const fiche = await lireCatalogue<PersonneVivierDetail>(`jeux/${jeu}/vivier/${encodeURIComponent(id)}/`)
    const personne = etat().vivier.find(p => p.id === id)
    if (!fiche || !personne) return introuvable('Cette personne n’est pas dans le vivier.')
    const historique = etat().nominations.filter(n => n.personne.id === id)
    return ok({ ...fiche, ...personne, historique })
  }),
  http.get(api('jeux/:jeu/postes-ouverts/'), ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const q = new URL(request.url).searchParams
    const { page, utilises } = traiterListe(etat().postesOuverts, q, POSTES_OUVERTS)
    return ok(page, estApproximation(q, utilises))
  }),
  http.get(api('jeux/:jeu/postes-ouverts/:poste/candidats/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const e = etat()
    const candidats: CandidatPoste[] = []
    for (const personne of e.vivier) {
      const r = e.rapprochements[personne.id]?.find(p => p.poste.id === params.poste)
      if (r)
        candidats.push({ personne, score: r.score, proximite: r.proximite, compatible: r.compatible, motifs: r.motifs })
    }
    candidats.sort((a, b) => Number(b.compatible) - Number(a.compatible) || b.score.total - a.score.total)
    return ok(candidats)
  }),

  // --- Nominations ------------------------------------------------------------------------------
  http.get(api('jeux/:jeu/nominations/synthese/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const nominations = etat().nominations
    const regions = [...new Set(nominations.map(n => n.poste.region))].sort()
    const synthese: SyntheseNominations = {
      parStatut: compter(nominations),
      parTerritoire: regions.map(r => ({
        territoire: r,
        parStatut: compter(nominations.filter(n => n.poste.region === r)),
      })),
      parAnnee: ANNEES_PLAN.map(a => ({ annee: a, parStatut: compter(nominations.filter(n => n.annee === a)) })),
    }
    return ok(synthese)
  }),
  http.get(api('jeux/:jeu/nominations/'), ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const q = new URL(request.url).searchParams
    const recentes = [...etat().nominations].reverse().map(synchroniser)
    const { page, utilises } = traiterListe(recentes, q, NOMINATIONS)
    return ok(page, estApproximation(q, utilises))
  }),
  http.post(api('jeux/:jeu/nominations/generer/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const demande = await corps<CorpsGenerationNominations>(request)
    const e = etat()
    let proposees = 0
    let sansPoste = 0
    for (const personne of e.vivier.filter(p => p.disponibilite === 'libre')) {
      if (demande.region && personne.region !== demande.region) continue
      if (demande.departement && personne.departement !== demande.departement) continue
      const choix = e.rapprochements[personne.id]?.find(
        r => r.compatible && e.postesOuverts.find(p => p.id === r.poste.id)?.statut === 'libre',
      )
      if (!choix) {
        sansPoste++
        continue
      }
      // Un poste proposé à quelqu'un n'est plus proposé à un autre dans la même génération.
      if (e.nominations.some(n => n.poste.id === choix.poste.id && ACTIFS.includes(n.statut))) {
        sansPoste++
        continue
      }
      const resultat = proposer(
        personne.id,
        choix.poste.id,
        demande.annee,
        'Meilleur rapprochement du vivier',
        demande.auteur,
        'automatique',
      )
      if ('nomination' in resultat) proposees++
    }
    const engages = new Set(e.nominations.filter(n => ACTIFS.includes(n.statut)).map(n => n.poste.id))
    const bilan: BilanGenerationNominations = {
      proposees,
      sansPoste,
      postesSansCandidat: e.postesOuverts.filter(p => p.statut === 'libre' && !engages.has(p.id)).length,
    }
    return ok(bilan)
  }),
  http.post(api('jeux/:jeu/nominations/lot/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const lot = await corps<CorpsLotNominations>(request)
    const bilan: BilanLot = { traitees: 0, refus: [] }
    for (const id of lot.nominations) {
      const nomination = nominationDe(id)
      if (!nomination) {
        bilan.refus.push({ nomination: id, motif: 'Nomination inconnue.' })
        continue
      }
      const resultat =
        lot.action === 'valider'
          ? transition(nomination, 'validee', lot.auteur, { reference: lot.reference })
          : transition(nomination, 'rejetee', lot.auteur, { motif: lot.motif })
      if ('refus' in resultat) bilan.refus.push({ nomination: id, motif: resultat.refus })
      else bilan.traitees++
    }
    return ok(bilan)
  }),
  http.post(api('jeux/:jeu/nominations/import/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const bilan: BilanImportNominations = {
      importees: 0,
      refus: ['Données factices : la lecture des fichiers de nominations demande le serveur AlgoPlanR.'],
      manquantes: [],
    }
    return ok(bilan)
  }),
  http.post(api('jeux/:jeu/nominations/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const d = await corps<CorpsNomination>(request)
    if (!d.motif.trim()) return refus('Une nomination manuelle doit être motivée.')
    return repondre(proposer(d.personne, d.poste, d.annee, d.motif, d.auteur, 'manuelle'), 201)
  }),
  http.get(api('jeux/:jeu/nominations/:nomination/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const nomination = nominationDe(params.nomination)
    return nomination ? ok(synchroniser(nomination)) : introuvable('Cette nomination n’existe pas.')
  }),
  http.post(api('jeux/:jeu/nominations/:nomination/valider/'), async ({ params, request }) => {
    const nomination = jeuConnu(params.jeu) ? nominationDe(params.nomination) : null
    if (!nomination) return introuvable('Cette nomination n’existe pas.')
    const { reference, auteur } = await corps<CorpsValidationNomination>(request)
    return repondre(transition(nomination, 'validee', auteur, { reference }))
  }),
  http.post(api('jeux/:jeu/nominations/:nomination/rejeter/'), async ({ params, request }) => {
    const nomination = jeuConnu(params.jeu) ? nominationDe(params.nomination) : null
    if (!nomination) return introuvable('Cette nomination n’existe pas.')
    const { motif, auteur } = await corps<CorpsMotifNomination>(request)
    return repondre(transition(nomination, 'rejetee', auteur, { motif }))
  }),
  http.post(api('jeux/:jeu/nominations/:nomination/annuler/'), async ({ params, request }) => {
    const nomination = jeuConnu(params.jeu) ? nominationDe(params.nomination) : null
    if (!nomination) return introuvable('Cette nomination n’existe pas.')
    const { motif, auteur } = await corps<CorpsMotifNomination>(request)
    return repondre(transition(nomination, 'annulee', auteur, { motif }))
  }),
  http.post(api('jeux/:jeu/nominations/:nomination/mettre-en-oeuvre/'), async ({ params, request }) => {
    const nomination = jeuConnu(params.jeu) ? nominationDe(params.nomination) : null
    if (!nomination) return introuvable('Cette nomination n’existe pas.')
    const { dateEffet, referenceActe, auteur } = await corps<CorpsMiseEnOeuvre>(request)
    return repondre(transition(nomination, 'mise_en_oeuvre', auteur, { reference: referenceActe, dateEffet }))
  }),

  // --- Registre des mouvements -------------------------------------------------------------------
  http.get(api('jeux/:jeu/mouvements/controles/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok(controler(etat().mouvements)) : introuvable(),
  ),
  http.get(api('jeux/:jeu/mouvements/'), ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const q = new URL(request.url).searchParams
    const { page, utilises } = traiterListe(etat().mouvements, q, MOUVEMENTS)
    return ok(page, estApproximation(q, utilises))
  }),
  http.get(api('jeux/:jeu/mouvements/:mouvement/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const mouvement = etat().mouvements.find(m => m.id === params.mouvement)
    return mouvement ? ok(mouvement) : introuvable('Ce mouvement n’existe pas.')
  }),
  http.post(api('jeux/:jeu/mouvements/:mouvement/mettre-en-oeuvre/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const e = etat()
    const mouvement = e.mouvements.find(m => m.id === params.mouvement)
    if (!mouvement) return introuvable('Ce mouvement n’existe pas.')
    if (mouvement.statut === 'realise') return conflit('Ce mouvement est déjà réalisé.')
    const { dateEffet, referenceActe, auteur } = await corps<CorpsMiseEnOeuvreMouvement>(request)
    if (mouvement.type === 'nomination') {
      // Le mouvement d'une nomination se réalise avec elle.
      const nomination = nominationDe(mouvement.decision.id)
      if (nomination) {
        const resultat = transition(nomination, 'mise_en_oeuvre', auteur, { reference: referenceActe, dateEffet })
        if ('refus' in resultat) return conflit(resultat.refus)
      }
    } else {
      Object.assign(mouvement, { statut: 'realise', realiseLe: dateEffet })
      auditer(
        'mouvement',
        'réalisé',
        `Mouvement réalisé : ${mouvement.personne.nom} → ${mouvement.destination.nom}`,
        auteur,
        {
          type: 'mouvement',
          id: mouvement.id,
        },
        { statut: 'prevu' },
        { statut: 'realise', referenceActe },
      )
    }
    return ok(e.mouvements.find(m => m.id === params.mouvement))
  }),
  http.get(api('jeux/:jeu/personnes/:matricule/mouvements/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok(etat().mouvements.filter(m => m.personne.matricule === params.matricule)) : introuvable(),
  ),

  // --- Journal d'audit ------------------------------------------------------------------------------
  http.get(api('jeux/:jeu/journal-audit/'), ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const q = new URL(request.url).searchParams
    const types = q.getAll('type')
    const objet = q.get('objet')
    const auteur = q.get('auteur')?.toLowerCase()
    const du = q.get('du')
    const au = q.get('au')
    const evenements = [...etat().audit]
      .reverse()
      .filter(
        e =>
          (types.length === 0 || types.includes(e.type)) &&
          (!objet || `${e.objet?.type}:${e.objet?.id}` === objet) &&
          (!auteur || (e.auteur ?? '').toLowerCase().includes(auteur)) &&
          (!du || e.le.slice(0, 10) >= du) &&
          (!au || e.le.slice(0, 10) <= au),
      )
      .map(({ avant: _avant, apres: _apres, ...resume }) => resume)
    const { page } = traiterListe(evenements, q, {}, new Set(['type', 'objet', 'auteur', 'du', 'au']))
    return ok(page)
  }),
  http.get(api('jeux/:jeu/journal-audit/:evenement/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const evenement = etat().audit.find(e => e.id === params.evenement)
    return evenement ? ok(evenement) : introuvable('Cet événement n’existe pas.')
  }),
]
