/**
 * Conversions vers le serveur Django : format des erreurs, lecture de toutes
 * les pages d'une liste et remise des réponses au format du contrat. `fetch`
 * est simulé avec des réponses au format du serveur.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { listerEvenementsAudit } from '../components/audit/infrastructure/auditApi'
import {
  listerEtablissements,
  listerJeux,
  lireJeu,
  supprimerJeu,
  validerJeu,
} from '../components/donnees/infrastructure/donneesApi'
import { listerNominations, mettreEnOeuvreNomination } from '../components/nominations/infrastructure/nominationsApi'
import {
  lireHypotheses,
  lireRapportPrevisionnel,
  lireTableauPlanification,
  modifierHypotheses,
} from '../components/planification/infrastructure/planificationApi'
import { paramsDe, ROUTES_NON_SERVIES, viderCache } from '../components/shared/api/backend'
import { retenirScenario } from '../components/simulation/infrastructure/simulationApi'
import {
  versConfigDjango,
  versEngineSettings,
  type ConfigDjango,
} from '../components/shared/api/backend/conversions/parametres'
import { paginer } from '../components/shared/api/backend/liste'
import { FILTRES_VIDES } from '../components/shared/api/contrat/commun'
import { ApiError } from '../components/shared/api/erreurs'
import { SANS_PAGINATION } from '../components/shared/api/pagination'

/** Les jeux du serveur sont identifiés par un UUID. */
const JEU = '1f7ca877-6622-4851-9edd-98bb30ecf05c'

const fetchOriginal = globalThis.fetch
let appels: string[] = []

function json(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })
}

/** Installe un `fetch` qui répond selon le chemin demandé. */
function simulerServeur(repondre: (url: URL, init: RequestInit) => Response): void {
  globalThis.fetch = (async (entree: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(entree))
    appels.push(`${init.method ?? 'GET'} ${url.pathname}${url.search}`)
    return repondre(url, init)
  }) as typeof fetch
}

const CONFIG: ConfigDjango = {
  seuils: { anciennete_poste_recevabilite_ans: 5, age_senior_ans: 50, age_jeune_ans: 35, age_retraite_ans: 60 },
  poids_bareme_individuel: {
    C1_carriere_zone: 0.3,
    C2_anciennete_poste: 0.25,
    C3_charges_familiales: 0.2,
    C4_formation_continue: 0.15,
    C5_cohorte_age: 0.1,
  },
  points_situation_familiale: { celibataire: 10, divorce: 8, veuf: 8, marie: 5 },
  poids_score_appariement: {
    Z1_bareme_individu: 0.25,
    Z2_poids_poste_Up: 0.25,
    Z3_proximite: 0.25,
    Z4_ajustements: 0.25,
  },
  points_proximite: { meme_commune: 60, meme_departement: 30, autre: 0 },
  ajustements_contextuels: {
    appui_multigrades_jeune: 15,
    senior_vers_encadrement: 15,
    allegement_senior_standard: 8,
    transition_rural_urbain: 12,
    bonification_ciblee: 20,
  },
  vulnerabilite: { t1: 0.3, t2: 0.7 },
  besoin: {
    norme_eleves_par_maitre: 60,
    effectif_premiere_section: 20,
    nombre_niveaux: 6,
    niveaux_par_maitre_multigrade: 2,
    minimum_selon_multigrades: true,
    double_flux_autorise: true,
  },
  regles_dreb: {
    phase1_voeux_actif: true,
    phase2_proximite_iaeb: true,
    phase2_proximite_departement: true,
    phase3_extension_regionale: true,
    phase4_vivier_recrutement: true,
    regions_etanches: true,
  },
}

/** École enrichie au format du serveur. */
function ecole(id: string, be: number, xe = 0) {
  return {
    Identifiant_Ecole: id,
    Sous_Systeme: 'Francophone',
    Region: 'Centre',
    Departement: 'Mfoundi',
    Commune: 'Yaoundé I',
    Circonscription_IAEB: 'IAEB Yaoundé I',
    Effectif_Eleves_Attendus: 240,
    Enseignants_Actuels: 2,
    Salles_Simple_Flux: 6,
    Salles_Double_Flux: 0,
    Accessibilite_Zone: 'Rural enclavé',
    Securite_Zone: 'Zone rouge',
    Classes_Multigrades: 'Non',
    nom_etab: `École ${id}`,
    type_etab: 'ECOLE',
    Pe: 4,
    me: 6,
    De: 6,
    BMAX: 6,
    Ke: 6,
    be,
    xe,
    se: 0,
    ae: 0,
    alpha: 20,
    sigma: 25,
    Wp: 23.5,
    beta: 10,
    Up: 33.5,
    niveau_difficulte: 2,
    nb_postes_ouverts: be,
    est_necessiteuse: be > 0,
    est_excedentaire: xe > 0,
    est_zone_rouge: true,
  }
}

beforeEach(() => {
  appels = []
  viderCache()
  process.env.NEXT_PUBLIC_API_URL = 'http://django.test'
})

afterEach(() => {
  globalThis.fetch = fetchOriginal
  delete process.env.NEXT_PUBLIC_API_URL
})

describe('erreurs du serveur Django', () => {
  it('reprend `detail` et `motifs` comme motif de l’erreur', async () => {
    simulerServeur(() =>
      json({ detail: 'Arbitrage refusé', code: 'arbitrage_refuse', motifs: ['École inconnue : X'] }, 422),
    )
    await assert.rejects(listerJeux(), (e: unknown) => {
      assert.ok(e instanceof ApiError)
      assert.equal(e.statut, 422)
      assert.equal(e.code, 'arbitrage_refuse')
      assert.equal(e.motif, 'Arbitrage refusé : École inconnue : X')
      assert.deepEqual(e.details, ['École inconnue : X'])
      return true
    })
  })
})

describe('conversions des routes', () => {
  it('répond 404 sans interroger le serveur pour un jeu qui n’est pas un UUID', async () => {
    // Le jeu « demonstration » des données factices, resté en mémoire du navigateur.
    simulerServeur(() => json({ detail: 'Method Not Allowed' }, 405))
    await assert.rejects(lireJeu('demonstration'), (e: unknown) => e instanceof ApiError && e.statut === 404)
    assert.deepEqual(appels, [])
  })

  it('sert toutes les routes du contrat : aucune n’est annoncée comme non disponible', () => {
    // Planification, nominations, audit, validation, actualisation et scénario retenu sont servis par le serveur.
    assert.deepEqual([...ROUTES_NON_SERVIES], [])
  })

  it('convertit le rapport prévisionnel et transmet horizon et seuil de la cohorte', async () => {
    simulerServeur(() =>
      json({
        perimetre: 'Cameroun',
        scenario_id: '3',
        horizon: 3,
        scenarios_regions: {
          lignes: [
            { region: 'Nord', min: 2, maintien: 5, besoin: 9, plafond: 4, rem_base: 120.5, rem_final: { min: 130 } },
          ],
        },
        redeploiement: { national: { redeployable_arrondissement: 7, ecoles_sans_eleves: 1 }, seuil_cohorte: 5 },
      }),
    )
    const r = await lireRapportPrevisionnel(JEU, { region: 'Nord' }, { horizon: 3, seuilCohorte: 5 })
    assert.equal(r.scenarioId, '3')
    assert.equal(r.scenariosRegions.lignes[0].region, 'Nord')
    assert.equal(r.scenariosRegions.lignes[0].remBase, 120.5)
    assert.equal(r.scenariosRegions.lignes[0].remFinal.min, 130)
    assert.equal(r.redeploiement.national.redeployableArrondissement, 7)
    assert.equal(r.redeploiement.seuilCohorte, 5)
    const appel = appels.at(-1) ?? ''
    assert.ok(appel.includes('/planification/rapport/'), appel)
    assert.ok(appel.includes('horizon=3') && appel.includes('seuil_cohorte=5') && appel.includes('region=Nord'), appel)
  })

  it('convertit les hypothèses et renvoie au serveur un corps en snake_case', async () => {
    const h = {
      horizon: 5,
      retraite: { source: 's', justification: 'j', age_legal: 60, date_reference: 'rentree', exceptions: [] },
      attrition: {
        source: 's',
        justification: 'j',
        methode: 'taux_unique',
        taux_unique: 2.25,
        par_sous_systeme: {},
        par_region: { Centre: 1.92 },
        niveau_arrondi: 'departement',
      },
      quotas: { source: 's', justification: 'j', annees_precedentes_realisees: true },
      vivier: { source: 's', justification: 'j', sources: ['excedentaire'] },
      drh: { ETAL_N: 5 },
      version: 1,
      modifiees_le: '2026-10-14T08:00:00Z',
      modifiees_par: 'Paramétrage initial',
    }
    let corps: Record<string, unknown> = {}
    simulerServeur((_, init) => {
      if (init.method === 'PUT') corps = JSON.parse(String(init.body))
      return json(h)
    })
    const lu = await lireHypotheses(JEU)
    assert.equal(lu.attrition.tauxUnique, 2.25)
    assert.equal(lu.retraite.ageLegal, 60)
    assert.deepEqual(lu.attrition.parRegion, { Centre: 1.92 })
    assert.equal(lu.modifieesPar, 'Paramétrage initial')
    const { version: _v, modifieesLe: _le, modifieesPar: _par, ...brouillon } = lu
    await modifierHypotheses(JEU, { ...brouillon, motif: 'Taux observé', auteur: 'DRH' })
    assert.deepEqual(corps.attrition, h.attrition)
    assert.equal(corps.motif, 'Taux observé')
    assert.ok(!('drh' in corps), 'le bloc DRH reste au serveur')
  })

  it('convertit le tableau de planification et transmet le sous-système', async () => {
    const annee = {
      annee: 'N+1',
      effectif_debut: 403,
      departs_retraite: 15,
      departs_attrition: 10,
      besoin: 25,
      ressources_vivier: 5,
      quota_calcule: 20,
      quota_retenu: null,
      nominations_prevues: 1,
      nominations_realisees: 0,
      deploiements_prevus: 40,
      deploiements_realises: 0,
      besoin_restant: 20,
      rem: 32.5,
    }
    simulerServeur(() =>
      json({
        perimetre: 'Centre',
        niveau: 'region',
        sous_systeme: 'francophone',
        scenario_id: '7',
        version: 2,
        calcule_le: '2026-10-14T08:00:00Z',
        annees: [annee],
        fiabilite: [{ indicateur: 'departs_retraite', niveau: 'bonne', detail: 'Âge connu' }],
      }),
    )
    const t = await lireTableauPlanification(JEU, { region: 'Centre', sousSysteme: 'francophone' })
    assert.ok(appels[0].includes('sous_systeme=francophone') && !appels[0].includes('sousSysteme'))
    assert.equal(t.annees[0].effectifDebut, 403)
    assert.equal(t.annees[0].besoinRestant, 20)
    assert.equal(t.fiabilite[0].indicateur, 'departsRetraite')
    assert.equal(t.scenarioId, '7')
  })

  it('convertit les nominations, pagine selon le contrat et transmet la mise en œuvre', async () => {
    const personne = {
      id: 'ens-M1',
      matricule: 'M1',
      nom: 'Bello',
      prenom: 'Aïcha',
      source: 'excedentaire',
      sous_systeme: 'francophone',
      region: 'Centre',
      departement: 'Mfoundi',
      commune: 'Yaoundé I',
      iaeb: 'IAEB Yaoundé I',
      ecole_origine: { id: 'E1', nom: 'École E1' },
      bareme: 102.8,
      note: null,
      disponibilite: 'nommee',
      contraintes: [],
    }
    const poste = {
      id: 'E2_P1',
      id_ecole: 'E2',
      nom_ecole: 'École E2',
      region: 'Centre',
      departement: 'Mfoundi',
      commune: 'Yaoundé I',
      sous_systeme: 'francophone',
      zone_securite: 'verte',
      indice_priorite: 15,
      rang: 1,
      statut: 'reserve',
      nomination_id: '4',
    }
    const nomination = (statut: string) => ({
      id: '4',
      personne,
      poste,
      annee: 'N+1',
      statut,
      origine: 'automatique',
      motif: null,
      reference_decision: 'DEC-1',
      reference_acte: null,
      date_effet: null,
      creee_le: '2026-10-14T08:00:00Z',
      historique: [],
    })
    let corps: Record<string, unknown> = {}
    simulerServeur((url, init) => {
      if (init.method === 'POST') {
        corps = JSON.parse(String(init.body))
        return json(nomination('mise_en_oeuvre'))
      }
      return json({ count: 1, page: 1, taille: 5000, pages: 1, resultats: [nomination('validee')] })
    })
    const page = await listerNominations(JEU, { statut: ['validee'], page: 1, taille: 10 })
    assert.equal(page.total, 1)
    assert.ok(appels[0].includes('statut=validee'))
    const [n] = page.elements
    assert.equal(n.poste.schoolId, 'E2')
    assert.equal(n.personne.ecoleOrigine?.nom, 'École E1')
    assert.equal(n.referenceDecision, 'DEC-1')
    const fait = await mettreEnOeuvreNomination(
      { jeu: JEU, nomination: '4' },
      { dateEffet: '2027-09-01', referenceActe: 'ACTE-1', auteur: 'Agent' },
    )
    assert.deepEqual(corps, { date_effet: '2027-09-01', reference_acte: 'ACTE-1', auteur: 'Agent' })
    assert.equal(fait.statut, 'mise_en_oeuvre')
  })

  it('convertit le scénario retenu, la validation et le journal d’audit', async () => {
    simulerServeur(url => {
      if (url.pathname.endsWith('/scenario-retenu/'))
        return json({
          id: JEU,
          nom: 'Jeu',
          source: 'demonstration',
          cree_le: '2026-10-14T08:00:00Z',
          nb_etablissements: 3,
          nb_enseignants: 5,
          nb_scenarios: 3,
          nb_faits_prince: 0,
          nb_arbitrages: 0,
          nb_recrues: 0,
          statut: 'valide',
          scenario_retenu_id: '7',
        })
      if (url.pathname.endsWith('/validation/'))
        return json({ statut: 'valide', valide_le: '2026-10-14T08:00:00Z', valide_par: 'DRH', controles: [] })
      return json({
        count: 1,
        page: 1,
        taille: 5000,
        pages: 1,
        resultats: [
          {
            id: '1',
            type: 'scenario_retenu',
            action: 'retenu',
            objet: { type: 'scenario', id: '7' },
            resume: 'Scénario retenu',
            auteur: 'DRH',
            compte: 'drh',
            le: '2026-10-14T08:00:00Z',
          },
        ],
      })
    })
    const jeu = await retenirScenario(JEU, '7')
    assert.equal(jeu.scenarioRetenuId, '7')
    assert.equal(jeu.statut, 'valide')
    assert.equal((await validerJeu(JEU, 'DRH')).validePar, 'DRH')
    const journal = await listerEvenementsAudit(JEU, { type: ['scenario_retenu'] })
    assert.deepEqual(journal.elements[0].objet, { type: 'scenario', id: '7' })
    assert.ok(!('compte' in journal.elements[0]))
  })

  it('convertit la liste des jeux au format du contrat', async () => {
    simulerServeur(() =>
      json([
        {
          id: 'a',
          nom: 'Jeu national',
          source: 'import',
          cree_le: '2026-10-12T09:18:41Z',
          nb_etablissements: 3,
          nb_enseignants: 5,
          nb_scenarios: 3,
          nb_faits_prince: 1,
          nb_arbitrages: 0,
          nb_recrues: 0,
        },
      ]),
    )
    const [jeu] = await listerJeux()
    assert.equal(jeu.id, 'a')
    assert.equal(jeu.demonstration, false)
    assert.equal(jeu.nbEtablissements, 3)
    assert.equal(jeu.nbFaitsPrinceActifs, 1)
    assert.equal(jeu.statut, 'brouillon')
  })

  it('lit toutes les pages du serveur puis pagine selon le contrat', async () => {
    const ecoles = [ecole('E1', 4), ecole('E2', 0, 1), ecole('E3', 1)]
    simulerServeur(url => {
      if (url.pathname.endsWith('/parametres/')) return json({ parametres: CONFIG, surcharges: {} })
      const page = Number(url.searchParams.get('page'))
      // Le serveur sert ici une école par page, pour vérifier l'enchaînement.
      return json({ count: 3, page, taille: 1, pages: 3, resultats: [ecoles[page - 1]] })
    })
    const tout = await listerEtablissements(JEU, FILTRES_VIDES, SANS_PAGINATION)
    assert.equal(tout.total, 3)
    assert.deepEqual(
      tout.elements.map(d => d.school.id),
      ['E1', 'E2', 'E3'],
    )
    const [e1] = tout.elements
    assert.equal(e1.besoinTheorique, 4)
    assert.equal(e1.school.zone, 'rurale')
    assert.equal(e1.school.zoneSecurite, 'rouge')
    assert.equal(e1.priorite.indice, 33.5)
    // 4 maîtres manquants pour une cible de 6 : au-delà du seuil « important » (0,34).
    assert.equal(e1.severite, 'deficit_critique')
    assert.equal(tout.elements[1].severite, 'excedent')

    // Seconde lecture : servie par le cache, avec une pagination du contrat.
    const avant = appels.length
    const page = await listerEtablissements(JEU, FILTRES_VIDES, { page: 2, taille: 1, tri: '-besoin' })
    assert.equal(appels.length, avant)
    assert.deepEqual(
      page.elements.map(d => d.school.id),
      ['E3'],
    )
  })

  it('vide le cache du jeu après une écriture', async () => {
    simulerServeur(url => {
      if (url.pathname.endsWith('/parametres/')) return json({ parametres: CONFIG, surcharges: {} })
      if (url.pathname === `/api/v1/jeux/${JEU}/`) return new Response(null, { status: 204 })
      return json({ count: 1, page: 1, taille: 1000, pages: 1, resultats: [ecole('E1', 1)] })
    })
    await listerEtablissements(JEU, FILTRES_VIDES, SANS_PAGINATION)
    await supprimerJeu(JEU)
    const avant = appels.length
    await listerEtablissements(JEU, FILTRES_VIDES, SANS_PAGINATION)
    assert.ok(appels.length > avant, 'les écoles doivent être relues après la suppression')
  })
})

describe('outils des conversions', () => {
  it('lit les paramètres d’un chemin concret', () => {
    assert.deepEqual(paramsDe('jeux/{jeu}/scenarios/{scenario}/', 'jeux/a%20b/scenarios/5/'), {
      jeu: 'a b',
      scenario: '5',
    })
  })

  it('pagine et trie une liste, `taille=0` renvoyant tout', () => {
    const liste = [{ v: 2 }, { v: 3 }, { v: 1 }]
    assert.deepEqual(paginer(liste, { taille: 0, tri: 'v' }).elements, [{ v: 1 }, { v: 2 }, { v: 3 }])
    assert.deepEqual(paginer(liste, { page: 2, taille: 2, tri: '-v' }), {
      elements: [{ v: 1 }],
      total: 3,
      page: 2,
      taille: 2,
    })
  })

  it('aller-retour des paramètres : seules les règles connues du serveur sont transmises', () => {
    const settings = versEngineSettings(CONFIG)
    assert.equal(settings.scoring.seuils.ageJeuneAns, 35)
    assert.equal(settings.priorite.coefSecurite, 0.7)
    const retour = versConfigDjango({
      ...settings,
      scoring: { ...settings.scoring, pointsSituationFamiliale: { marie: 6, separe: 3 } },
    })
    assert.deepEqual(retour.points_situation_familiale, { marie: 6 })
    assert.deepEqual(retour.seuils, CONFIG.seuils)
    assert.deepEqual(retour.vulnerabilite, CONFIG.vulnerabilite)
  })
})
