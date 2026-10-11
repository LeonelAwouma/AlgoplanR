/**
 * Données factices — décisions : faits du Prince, arbitrages des commissions
 * et recrues.
 *
 * Les décisions sont enregistrées, contrôlées sur les cas simples (enseignant ou
 * école inconnus, doublon) et journalisées ; en revanche diagnostic et
 * scénarios ne sont pas recalculés, ce que seul le serveur réel fait.
 */

import { http } from 'msw'

import type {
  BilanImportPrince,
  CorpsDecisionArbitrage,
  CorpsFaitPrince,
  DecisionArbitrage,
  EnseignantDetail,
  EtablissementDetail,
  FaitPrinceApplique,
  ImpactPrince,
  LectureRecrues,
  LieuPrince,
  ProposedAssignment,
  SchoolDiagnostic,
} from '../../components/shared/api'

import { auditer, etat, maintenant, nouvelId } from '../etat'
import { conflit, introuvable, ok, refus, sansContenu } from '../reponses'
import { api, corps, jeuConnu, lireCatalogue, parametre } from './outils'

const OBSERVATION_FACTICE =
  'Données factices : les effets sur les autres écoles et sur les scénarios ne sont pas recalculés.'

function enseignant(jeu: string, matricule: string) {
  return lireCatalogue<EnseignantDetail>(`jeux/${jeu}/enseignants/${encodeURIComponent(matricule)}/`)
}

function etablissement(jeu: string, ecole: string) {
  return lireCatalogue<EtablissementDetail>(`jeux/${jeu}/etablissements/${encodeURIComponent(ecole)}/`)
}

function lieu(d: SchoolDiagnostic): LieuPrince {
  const s = d.school
  return { id: s.id, nom: s.nom, commune: s.commune, departement: s.departement, region: s.region }
}

export const gestionnairesDecisions = [
  // --- Faits du Prince ---------------------------------------------------------------
  http.get(api('jeux/:jeu/faits-prince/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok(etat().faitsPrince) : introuvable(),
  ),

  http.post(api('jeux/:jeu/faits-prince/impact/'), async ({ params, request }) => {
    const jeu = parametre(params.jeu)
    if (!jeuConnu(jeu)) return introuvable()
    const { matricule, ecoleDestination } = await corps<CorpsFaitPrince>(request)
    const ens = await enseignant(jeu, matricule)
    if (!ens) return refus(`Matricule ${matricule} introuvable dans le fichier des enseignants.`)
    const impacts = etat().impactsPrince
    const destination = impacts[ecoleDestination]
    if (!destination) return refus(`École ${ecoleDestination} introuvable dans le fichier des établissements.`)
    const impact: ImpactPrince = {
      origine: impacts[ens.teacher.idEtabAttache]?.retrait ?? null,
      destination: destination.ajout,
      observations: [OBSERVATION_FACTICE],
    }
    return ok(impact)
  }),

  http.post(api('jeux/:jeu/faits-prince/'), async ({ params, request }) => {
    const jeu = parametre(params.jeu)
    if (!jeuConnu(jeu)) return introuvable()
    const saisie = await corps<CorpsFaitPrince>(request)
    const ens = await enseignant(jeu, saisie.matricule)
    if (!ens) return refus(`Matricule ${saisie.matricule} introuvable dans le fichier des enseignants.`)
    const destination = await etablissement(jeu, saisie.ecoleDestination)
    if (!destination) return refus(`École ${saisie.ecoleDestination} introuvable dans le fichier des établissements.`)
    if (ens.teacher.idEtabAttache === saisie.ecoleDestination) {
      return refus('L’enseignant est déjà rattaché à cette école.')
    }
    const e = etat()
    if (e.faitsPrince.some(f => f.statut === 'applique' && f.fait.teacherId === saisie.matricule)) {
      return conflit('Cet enseignant fait déjà l’objet d’un fait du Prince appliqué.')
    }
    const origine = await etablissement(jeu, ens.teacher.idEtabAttache)
    const fait: FaitPrinceApplique = {
      fait: {
        id: nouvelId('prince'),
        teacherId: saisie.matricule,
        schoolDestinationId: saisie.ecoleDestination,
        reference: saisie.reference,
        decideLe: maintenant(),
        enseignant: `${ens.teacher.nom} ${ens.teacher.prenom}`.trim(),
        origine: origine
          ? lieu(origine.diagnostic)
          : { id: ens.teacher.idEtabAttache, nom: ens.nomEtab, commune: '', departement: '', region: '' },
        destination: lieu(destination.diagnostic),
      },
      statut: 'applique',
      motif: 'Décision appliquée',
    }
    e.faitsPrince.push(fait)
    e.jeu = { ...e.jeu, nbFaitsPrinceActifs: e.faitsPrince.filter(f => f.statut === 'applique').length }
    auditer(
      'fait_prince',
      'enregistré',
      `Fait du Prince : ${fait.fait.enseignant} → ${fait.fait.destination.nom}`,
      null,
      {
        type: 'fait_prince',
        id: fait.fait.id,
      },
      null,
      fait,
    )
    return ok(fait, false, 201)
  }),

  http.post(api('jeux/:jeu/faits-prince/import/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const bilan: BilanImportPrince = {
      acceptees: 0,
      refus: ['Données factices : la lecture des fichiers de décisions demande le serveur AlgoPlanR.'],
      manquantes: [],
    }
    return ok(bilan)
  }),

  http.delete(api('jeux/:jeu/faits-prince/:fait/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const e = etat()
    const fait = e.faitsPrince.find(f => f.fait.id === params.fait)
    if (!fait) return introuvable('Ce fait du Prince n’existe pas.')
    e.faitsPrince = e.faitsPrince.filter(f => f !== fait)
    e.jeu = { ...e.jeu, nbFaitsPrinceActifs: e.faitsPrince.filter(f => f.statut === 'applique').length }
    auditer(
      'fait_prince',
      'annulé',
      `Annulation du fait du Prince : ${fait.fait.enseignant}`,
      null,
      {
        type: 'fait_prince',
        id: fait.fait.id,
      },
      fait,
      null,
    )
    return sansContenu()
  }),

  // --- Arbitrages ------------------------------------------------------------------------
  http.get(api('jeux/:jeu/arbitrages/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok(etat().arbitrages) : introuvable(),
  ),

  http.post(api('jeux/:jeu/arbitrages/'), async ({ params, request }) => {
    const jeu = parametre(params.jeu)
    if (!jeuConnu(jeu)) return introuvable()
    const saisie = await corps<CorpsDecisionArbitrage>(request)
    const ens = await enseignant(jeu, saisie.teacherId)
    if (!ens) return refus(`Matricule ${saisie.teacherId} introuvable.`)
    if (saisie.decision === 'modifier' && !saisie.schoolDestinationId) {
      return refus('Une modification doit désigner l’école retenue par la commission.')
    }
    const affectations = await lireCatalogue<ProposedAssignment[]>(
      `jeux/${jeu}/scenarios/${saisie.scenario}/affectations/`,
    )
    const proposition = affectations?.find(a => a.teacherId === saisie.teacherId) ?? null
    const destination = saisie.schoolDestinationId ? await etablissement(jeu, saisie.schoolDestinationId) : null
    const decision: DecisionArbitrage = {
      id: nouvelId('arbitrage'),
      teacherId: saisie.teacherId,
      nomEnseignant: `${ens.teacher.nom} ${ens.teacher.prenom}`.trim(),
      propositionInitiale: proposition
        ? {
            schoolId: proposition.schoolDestinationId,
            nomEtab: proposition.nomEtabDestination,
            nature: proposition.nature,
          }
        : null,
      decision: saisie.decision,
      schoolDestinationId: saisie.schoolDestinationId,
      nomEtabDestination: destination?.diagnostic.school.nom ?? null,
      changementSousSysteme: saisie.changementSousSysteme,
      motif: saisie.motif,
      instance: saisie.instance,
      decideLe: maintenant(),
    }
    etat().arbitrages.push({
      decision,
      appliquee: true,
      motif: 'Décision enregistrée (non recalculée : données factices)',
    })
    auditer(
      'arbitrage',
      saisie.decision,
      `Arbitrage : ${decision.nomEnseignant} (${saisie.decision})`,
      null,
      {
        type: 'arbitrage',
        id: decision.id,
      },
      null,
      decision,
    )
    return ok(decision, false, 201)
  }),

  http.delete(api('jeux/:jeu/arbitrages/:arbitrage/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const e = etat()
    const avant = e.arbitrages.length
    e.arbitrages = e.arbitrages.filter(a => a.decision.id !== params.arbitrage)
    if (e.arbitrages.length === avant) return introuvable('Cet arbitrage n’existe pas.')
    auditer('arbitrage', 'annulé', 'Annulation d’un arbitrage', null, {
      type: 'arbitrage',
      id: parametre(params.arbitrage),
    })
    return sansContenu()
  }),

  // --- Recrues -----------------------------------------------------------------------------
  http.get(api('jeux/:jeu/recrues/'), ({ params }) => (jeuConnu(params.jeu) ? ok(etat().recrues) : introuvable())),
  http.post(api('jeux/:jeu/recrues/import/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const e = etat()
    e.recrues = structuredClone(e.recruesExemple)
    auditer('recrues', 'import', `Import de ${e.recrues.length} recrue(s) d’exemple`, null)
    const lecture: LectureRecrues = { recrues: e.recrues, manquantes: [], ecartees: [] }
    return ok(lecture)
  }),
  http.delete(api('jeux/:jeu/recrues/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    etat().recrues = []
    auditer('recrues', 'suppression', 'Suppression des recrues', null)
    return sansContenu()
  }),
  http.get(api('jeux/:jeu/scenarios/:scenario/recrutes/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const e = etat()
    return ok(e.recrues.length > 0 ? (e.recrutesParScenario[parametre(params.scenario)] ?? null) : null)
  }),
]
