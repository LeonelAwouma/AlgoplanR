/**
 * Import avec ou sans fichier nominatif des enseignants : ce que l'interface envoie au serveur et la façon dont elle
 * lit le mode d'import. Le calcul et les refus sont décidés et testés par le serveur
 * (backend/tests/test_import_flexible.py) ; ici, seulement le contrat : aucun identifiant de fichier fictif n'est
 * envoyé, un nombre d'enseignants inconnu n'est jamais lu comme zéro, et le sort des enseignants lors d'une
 * actualisation est toujours explicite.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { actualiserJeu } from '../components/donnees/infrastructure/donneesApi'
import {
  DESCRIPTION_FICHIER,
  MESSAGE_ETABLISSEMENTS_SEULS,
  TYPES_FICHIER,
} from '../components/donnees/domain/correspondances'
import { mettreEnOeuvreNomination, validerNomination } from '../components/nominations/infrastructure/nominationsApi'
import { phraseContexte } from '../components/planification/domain/previsionnel'
import { validerQuotas } from '../components/planification/infrastructure/planificationApi'
import { viderCache } from '../components/shared/api/backend'
import { versJeu, type JeuDjango } from '../components/shared/api/backend/conversions/donnees'
import { diagnosticTerritorial } from '../components/shared/api/backend/moteur/narration'
import { versTotaux, type TotauxDjango } from '../components/shared/api/backend/conversions/territoires'

const JEU = '1f7ca877-6622-4851-9edd-98bb30ecf05c'
const fetchOriginal = globalThis.fetch
let corps: Record<string, unknown>[] = []

function json(contenu: unknown, statut = 200): Response {
  return new Response(JSON.stringify(contenu), { status: statut, headers: { 'Content-Type': 'application/json' } })
}

function simuler(reponse: unknown): void {
  globalThis.fetch = (async (_entree: string | URL | Request, init: RequestInit = {}) => {
    if (typeof init.body === 'string') corps.push(JSON.parse(init.body) as Record<string, unknown>)
    return json(reponse)
  }) as typeof fetch
}

beforeEach(() => {
  corps = []
  viderCache()
  process.env.NEXT_PUBLIC_API_URL = 'http://django.test'
})
afterEach(() => {
  globalThis.fetch = fetchOriginal
  delete process.env.NEXT_PUBLIC_API_URL
})

const JEU_BASE: JeuDjango = {
  id: JEU,
  nom: 'Base nationale',
  source: 'import',
  cree_le: '2026-10-26T09:00:00Z',
  nb_etablissements: 13494,
  nb_enseignants: null,
  nb_scenarios: 0,
  nb_faits_prince: 0,
  nb_arbitrages: 0,
  nb_recrues: 0,
}

describe('lecture du mode d’import', () => {
  it('lit un jeu sans fichier nominatif comme « établissements seuls », sans compter zéro enseignant', () => {
    const jeu = versJeu({
      ...JEU_BASE,
      nominatif_disponible: false,
      mode_import: 'etablissements_seuls',
      message_mode_import: 'Jeu d’établissements seuls',
    })
    assert.equal(jeu.nominatifDisponible, false)
    assert.equal(jeu.modeImport, 'etablissements_seuls')
    assert.equal(jeu.nbEnseignants, null)
    assert.equal(jeu.messageModeImport, 'Jeu d’établissements seuls')
    assert.equal(jeu.fichiersSource.enseignants, null)
  })

  it('distingue « aucun fichier » (null) d’un fichier nominatif vide (0)', () => {
    const complet = versJeu({ ...JEU_BASE, nb_enseignants: 0, nominatif_disponible: true, mode_import: 'complet' })
    assert.equal(complet.nominatifDisponible, true)
    assert.equal(complet.nbEnseignants, 0)
    assert.equal(complet.modeImport, 'complet')
  })

  it('déduit le mode d’un ancien serveur : des enseignants comptés font un jeu complet', () => {
    const ancien = versJeu({ ...JEU_BASE, nb_enseignants: 62065 })
    assert.equal(ancien.modeImport, 'complet')
    assert.equal(ancien.nominatifDisponible, true)
  })
})

describe('présentation des fichiers', () => {
  it('annonce le message exact de l’import en établissements seuls', () => {
    assert.equal(
      MESSAGE_ETABLISSEMENTS_SEULS,
      'Vous pouvez poursuivre avec les établissements seuls. Les analyses scolaires seront disponibles, mais les retraites, les affectations individuelles et certains scénarios resteront incomplets jusqu’à l’importation des enseignants.',
    )
  })

  it('nomme le fichier des établissements (obligatoire) et celui des enseignants (facultatif)', () => {
    assert.equal(DESCRIPTION_FICHIER.etablissements.titre, 'Fichier des établissements')
    assert.equal(DESCRIPTION_FICHIER.enseignants.titre, 'Fichier des enseignants')
    assert.match(DESCRIPTION_FICHIER.enseignants.texte, /^Facultatif/)
    assert.deepEqual([...TYPES_FICHIER], ['etablissements', 'enseignants'])
  })
})

describe('actualisation : le sort des enseignants est explicite', () => {
  const ACTUALISATION = {
    id: 'a1',
    realisee_le: '2026-10-26T10:00:00Z',
    realisee_par: 'DRH',
    fichiers_source: { etablissements: 'e.xlsx', enseignants: null },
    mode_nominatif: 'conserve',
    resume: { arrivees: 0, departs: 0, changements_ecole: 0, decisions_invalidees: 0 },
  }

  it('sans nouveau fichier, n’envoie ni enseignants ni suppression : le serveur conserve les enseignants', async () => {
    simuler(ACTUALISATION)
    const a = await actualiserJeu(JEU, { etablissements: 'f1', auteur: 'DRH' })
    assert.deepEqual(corps[0], { etablissements: 'f1', auteur: 'DRH' })
    assert.equal(a.modeNominatif, 'conserve')
    assert.equal(a.fichiersSource.enseignants, null)
  })

  it('avec un nouveau fichier, l’envoie ; la suppression n’est envoyée que si elle est demandée', async () => {
    simuler({ ...ACTUALISATION, mode_nominatif: 'remplace' })
    await actualiserJeu(JEU, { etablissements: 'f1', enseignants: 'f2', auteur: 'DRH' })
    assert.deepEqual(corps[0], { etablissements: 'f1', enseignants: 'f2', auteur: 'DRH' })
    simuler({ ...ACTUALISATION, mode_nominatif: 'supprime' })
    await actualiserJeu(JEU, { etablissements: 'f1', supprimerNominatif: true, auteur: 'DRH' })
    assert.deepEqual(corps[1], { etablissements: 'f1', supprimer_nominatif: true, auteur: 'DRH' })
  })
})

describe('décisions : réserves et vérification des sources reconnues explicitement', () => {
  it('n’envoie les réserves reconnues et la référence que si elles sont saisies', async () => {
    simuler([])
    await validerQuotas(JEU, { annee: 'N+1', auteur: 'DRH' })
    await validerQuotas(JEU, {
      annee: 'N+1',
      auteur: 'DRH',
      reservesReconnues: ['depassement_plafond'],
      referenceAdministrative: 'Note 12/2026',
    })
    assert.deepEqual(corps[0], { annee: 'N+1', auteur: 'DRH' })
    assert.deepEqual(corps[1], {
      annee: 'N+1',
      auteur: 'DRH',
      reserves_reconnues: ['depassement_plafond'],
      reference_administrative: 'Note 12/2026',
    })
  })

  it('transmet la vérification des sources pour valider une nomination ou réaliser un mouvement, jamais par défaut', async () => {
    simuler({})
    const ref = { jeu: JEU, nomination: 'n1' }
    await validerNomination(ref, { reference: 'Décision 1', auteur: 'DRH' }).catch(() => undefined)
    await validerNomination(ref, { reference: 'Décision 1', auteur: 'DRH', verificationSources: true }).catch(
      () => undefined,
    )
    await mettreEnOeuvreNomination(ref, {
      dateEffet: '2026-11-01',
      referenceActe: 'Acte 1',
      auteur: 'DRH',
    }).catch(() => undefined)
    assert.equal('verification_sources' in corps[0], false)
    assert.equal(corps[1].verification_sources, true)
    assert.equal('verification_sources' in corps[2], false)
  })
})

describe('classes multigrades non renseignées', () => {
  const TOTAUX: TotauxDjango = {
    nb_ecoles: 13494,
    besoin_postes: 0,
    excedent_enseignants: 0,
    excedent_mobilisable: 0,
    nb_ecoles_necessiteuses: 0,
    nb_ecoles_excedentaires: 0,
    nb_ecoles_zone_rouge: 0,
    nb_ecoles_a_examiner: 0,
    nb_ecoles_satisfaisantes: 0,
    salles_manquantes: 0,
    surnombre: 0,
    enseignants_en_poste: 0,
    classes: null,
    autres_enseignants: null,
    effectif_total_eleves: null,
    eleves_par_enseignant_etat: null,
    eleves_par_classe: null,
    classes_multigrades: 0,
  }

  it('lit une colonne vide dans toutes les écoles comme inconnue (null), jamais comme zéro classe', () => {
    const t = versTotaux({ ...TOTAUX, multigrades_non_renseignes: 13494 })
    assert.equal(t.classesMultigrades, null)
    assert.equal(t.ecolesMultigradesNonRenseignees, 13494)
  })

  it('garde le compte des écoles déclarantes quand l’information est partielle', () => {
    const t = versTotaux({ ...TOTAUX, classes_multigrades: 40, multigrades_non_renseignes: 100 })
    assert.equal(t.classesMultigrades, 40)
    assert.equal(t.ecolesMultigradesNonRenseignees, 100)
  })
})

describe('récit du diagnostic sans fichier nominatif', () => {
  const totaux = versTotaux({
    nb_ecoles: 3,
    besoin_postes: 10,
    excedent_enseignants: 4,
    excedent_mobilisable: 4,
    nb_ecoles_necessiteuses: 2,
    nb_ecoles_excedentaires: 1,
    nb_ecoles_zone_rouge: 0,
    nb_ecoles_a_examiner: 0,
    nb_ecoles_satisfaisantes: 0,
    salles_manquantes: 0,
    surnombre: 0,
    enseignants_en_poste: 50,
    classes: null,
    autres_enseignants: null,
    effectif_total_eleves: null,
    eleves_par_enseignant_etat: null,
    eleves_par_classe: null,
    classes_multigrades: 0,
    multigrades_non_renseignes: 3,
  })

  it('parle d’un stock déclaré et non d’enseignants lus, sans agents mobilisables', () => {
    const texte = diagnosticTerritorial(totaux, 50, null, 'Cameroun', false)
      .map(e => e.texte)
      .join(' ')
    assert.match(texte, /stock déclaré de 50 enseignants \(aucun fichier nominatif/)
    assert.match(texte, /excédent de stock déclaré/)
    assert.doesNotMatch(texte, /excédent mobilisable/)
  })

  it('garde le texte habituel quand le fichier nominatif a été importé', () => {
    const texte = diagnosticTerritorial(totaux, 50, null, 'Cameroun')
      .map(e => e.texte)
      .join(' ')
    assert.match(texte, /et 50 enseignants sur Cameroun/)
    assert.match(texte, /excédent mobilisable/)
  })
})

describe('provenance du prévisionnel sans fichier nominatif', () => {
  it('ne lit pas un nombre de matricules inconnu comme un nombre : la phrase de contexte ne plante pas', () => {
    const p = {
      contexte: {
        jeuNom: 'Établissements 2024-2025',
        jeuSource: 'import',
        anneeScolaire: '2024-2025',
        ecolesPerimetre: 10,
        ecolesJeu: 10,
        personnelsStockDeclare: 30,
        personnelsNominatifs: null,
        ecolesDonneesIncompletes: 2,
      },
    } as unknown as Parameters<typeof phraseContexte>[0]
    const phrase = phraseContexte(p)
    assert.match(phrase, /aucun fichier nominatif des enseignants importé/)
    assert.doesNotMatch(phrase, /\(0 dans le fichier nominatif\)/)
  })
})
