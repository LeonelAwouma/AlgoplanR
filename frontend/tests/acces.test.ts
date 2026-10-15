/**
 * Contrôle d'accès côté interface : jeton de session joint aux requêtes, refus du
 * serveur relayés à la porte d'accès, échéances d'inactivité et règles du mot de
 * passe affichées.
 *
 * Les décisions d'accès elles-mêmes (rôles, régions, expiration) sont prises et
 * testées par le serveur : backend/tests/test_acces.py.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  INTERVALLE_SIGNAL_MS,
  doitSignaler,
  echeanceDepuis,
  formaterDuree,
  phaseInactivite,
  secondesRestantes,
} from '../components/acces/domain/inactivite'
import { motDePasseAcceptable, reglesMotDePasse } from '../components/acces/domain/motDePasse'
import { sessionDepuisCompte, type CompteServeur, type EcheancesSession } from '../components/acces/domain/types'
import { desactiverConversions } from '../components/shared/api/backend'
import { appeler } from '../components/shared/api/client'
import { definirJeton, lireJeton, surEvenementAcces } from '../components/shared/api/jetonSession'
import { route } from '../components/shared/api/routes'

const fetchOriginal = globalThis.fetch
desactiverConversions()

afterEach(() => {
  globalThis.fetch = fetchOriginal
  definirJeton(null)
})

function repondre(statut: number, corps: unknown, enTetes: Headers[] = []): void {
  globalThis.fetch = (async (_url: string | URL | Request, init: RequestInit = {}) => {
    enTetes.push(new Headers(init.headers))
    return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
}

const lireJeux = route<unknown[]>()('GET', 'test-acces/jeux/')

describe('jeton de session', () => {
  it('est joint à chaque requête tant que la session est ouverte', async () => {
    const enTetes: Headers[] = []
    repondre(200, [], enTetes)
    definirJeton('abc')
    assert.equal(lireJeton(), 'abc')
    await appeler(lireJeux)
    assert.equal(enTetes[0].get('Authorization'), 'Bearer abc')
    definirJeton(null)
    await appeler(lireJeux)
    assert.equal(enTetes[1].get('Authorization'), null)
  })

  it('relaie les refus d’accès du serveur, et eux seuls', async () => {
    const recus: string[] = []
    const desabonner = surEvenementAcces(e => recus.push(e))
    repondre(401, { detail: 'Session expirée', code: 'session_expiree' })
    await assert.rejects(appeler(lireJeux))
    repondre(403, { detail: 'Changez votre mot de passe', code: 'mot_de_passe_a_changer' })
    await assert.rejects(appeler(lireJeux))
    // Une erreur de connexion (identifiants) ou un refus métier ne change pas l'écran.
    repondre(401, { detail: 'Identifiant ou mot de passe incorrect.', code: 'identifiants_invalides' })
    await assert.rejects(appeler(lireJeux))
    repondre(422, { detail: 'Import refusé', code: 'region_non_autorisee' })
    await assert.rejects(appeler(lireJeux))
    desabonner()
    assert.deepEqual(recus, ['session_expiree', 'mot_de_passe_a_changer'])
  })
})

describe('inactivité', () => {
  const session: EcheancesSession = {
    portee: 'COMPLETE',
    maintenant: '2026-10-14T10:00:00Z',
    expire_inactivite_le: '2026-10-14T10:20:00Z',
    expire_absolue_le: '2026-10-14T22:00:00Z',
    inactivite_minutes: 20,
    avertissement_minutes: 2,
  }

  it('avertit deux minutes avant l’échéance du serveur, puis verrouille', () => {
    const t0 = Date.parse('2026-10-14T10:00:00Z')
    const e = echeanceDepuis(session, t0)
    assert.equal(phaseInactivite(e, t0 + 17 * 60_000), 'active')
    assert.equal(phaseInactivite(e, t0 + 18 * 60_000), 'avertissement')
    assert.equal(secondesRestantes(e, t0 + 18 * 60_000 + 30_000), 90)
    assert.equal(phaseInactivite(e, t0 + 20 * 60_000), 'expiree')
    assert.equal(formaterDuree(90), '1:30')
  })

  it('corrige l’écart d’horloge entre le poste et le serveur', () => {
    // Horloge du poste en avance de 5 minutes : l'échéance suit le serveur, pas le poste.
    const recue = Date.parse('2026-10-14T10:05:00Z')
    const e = echeanceDepuis(session, recue)
    assert.equal(e.expireMs, Date.parse('2026-10-14T10:25:00Z'))
  })

  it('ne signale l’activité qu’une fois par minute, et seulement s’il y en a eu', () => {
    assert.equal(doitSignaler(0, 0, INTERVALLE_SIGNAL_MS * 3), false)
    assert.equal(doitSignaler(0, 10, 30_000), false)
    assert.equal(doitSignaler(0, 10, INTERVALLE_SIGNAL_MS), true)
  })
})

describe('mot de passe', () => {
  it('reprend les règles du serveur', () => {
    assert.equal(motDePasseAcceptable('123456', '123456', 'drh'), false)
    assert.equal(motDePasseAcceptable('courtA1', 'courtA1', 'drh'), false)
    assert.equal(motDePasseAcceptable('sanschiffre', 'sanschiffre', 'drh'), false)
    assert.equal(motDePasseAcceptable('delegue.centre2026', 'delegue.centre2026', 'delegue.centre'), false)
    assert.equal(motDePasseAcceptable('Nouveau-mdp-2026', 'Nouveau-mdp-2027', 'drh'), false)
    assert.equal(motDePasseAcceptable('Nouveau-mdp-2026', 'Nouveau-mdp-2026', 'drh'), true)
    assert.ok(reglesMotDePasse('', '', 'drh').every(r => !r.ok))
  })
})

describe('session', () => {
  const base: CompteServeur = {
    identifiant: 'delegue.centre',
    nom: 'Délégué',
    role: 'DELEGUE',
    region: 'Centre',
    etat: 'ACTIF',
    doit_changer_mot_de_passe: false,
    region_a_confirmer: false,
    region_confirmee_le: null,
    derniere_connexion: null,
  }

  it('reprend le rôle et la région fixés par le serveur', () => {
    assert.deepEqual(sessionDepuisCompte(base), {
      role: 'delegue',
      identifiant: 'delegue.centre',
      nom: 'Délégué',
      region: 'Centre',
    })
    assert.equal(sessionDepuisCompte({ ...base, role: 'DRH', region: null }).role, 'drh')
  })
})
