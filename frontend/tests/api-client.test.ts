/**
 * Client HTTP de l'API : construction des URL, envoi des corps, jeton de
 * l'application de bureau et conversion des erreurs. `fetch` est simulé : aucun
 * serveur n'est nécessaire.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { appeler, serialiserQuery } from '../components/shared/api/client'
import { EN_TETE_JETON } from '../components/shared/api/config'
import {
  ApiError,
  STATUT_INJOIGNABLE,
  estConflit,
  estInjoignable,
  estRefusMetier,
} from '../components/shared/api/erreurs'
import { construireChemin, route } from '../components/shared/api/routes'

/** Appel reçu par le `fetch` simulé. */
interface AppelFetch {
  url: string
  init: RequestInit
}

const fetchOriginal = globalThis.fetch
let appels: AppelFetch[] = []

/** Installe un `fetch` qui enregistre l'appel et renvoie la réponse fournie. */
function simulerFetch(reponse: () => Response | Promise<Response>): void {
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    appels.push({ url: String(url), init })
    return reponse()
  }) as typeof fetch
}

/** Réponse JSON. */
function json(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })
}

const lireJeu = route<{ id: string }>()('GET', 'jeux/{jeu}/')
const lister = route<string[]>()('GET', 'liste/')
const creer = route<{ ok: boolean }, { nom: string }>()('POST', 'jeux/')
const envoyer = route<{ id: string }, { fichier: Blob; type: string; feuille?: string }>()(
  'POST',
  'fichiers/',
  'multipart',
)
const supprimer = route<void>()('DELETE', 'jeux/{jeu}/')

beforeEach(() => {
  appels = []
  delete process.env.NEXT_PUBLIC_API_URL
})

afterEach(() => {
  globalThis.fetch = fetchOriginal
  delete (globalThis as { window?: unknown }).window
})

describe('construction des requêtes', () => {
  it('remplace et encode les paramètres du chemin, sous le préfixe /api/v1', async () => {
    simulerFetch(() => json({ id: 'a b' }))
    const jeu = await appeler(lireJeu, { params: { jeu: 'a b' } })
    assert.deepEqual(jeu, { id: 'a b' })
    assert.equal(appels[0].url, '/api/v1/jeux/a%20b/')
    assert.equal(appels[0].init.method, 'GET')
  })

  it('répète la clé pour une liste et omet les valeurs vides', () => {
    assert.equal(
      serialiserQuery({ zone: ['rurale', 'urbaine'], region: null, commune: undefined, page: 2, actif: true }),
      '?zone=rurale&zone=urbaine&page=2&actif=true',
    )
    assert.equal(serialiserQuery({ region: null }), '')
  })

  it('utilise NEXT_PUBLIC_API_URL en développement, sans barre finale en double', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000/'
    simulerFetch(() => json([]))
    await appeler(lister, { query: { q: 'école' } })
    assert.equal(appels[0].url, 'http://127.0.0.1:8000/api/v1/liste/?q=%C3%A9cole')
  })

  it("joint le jeton et l'adresse fournis par l'application de bureau", async () => {
    ;(globalThis as { window?: unknown }).window = {
      algobaba: { api: { baseUrl: 'http://127.0.0.1:51234', jeton: 'secret' } },
    }
    simulerFetch(() => json([]))
    await appeler(lister)
    assert.equal(appels[0].url, 'http://127.0.0.1:51234/api/v1/liste/')
    assert.equal((appels[0].init.headers as Record<string, string>)[EN_TETE_JETON], 'secret')
  })

  it('envoie un corps JSON avec son en-tête', async () => {
    simulerFetch(() => json({ ok: true }, 201))
    await appeler(creer, { corps: { nom: 'Jeu 2026' } })
    const enTetes = appels[0].init.headers as Record<string, string>
    assert.equal(enTetes['Content-Type'], 'application/json')
    assert.equal(appels[0].init.body, JSON.stringify({ nom: 'Jeu 2026' }))
  })

  it('envoie un fichier en multipart, sans fixer le Content-Type, et ignore les champs absents', async () => {
    simulerFetch(() => json({ id: 'f1' }, 201))
    const fichier = new Blob(['a;b'], { type: 'text/csv' })
    await appeler(envoyer, { corps: { fichier, type: 'enseignants', feuille: undefined } })
    const corps = appels[0].init.body
    assert.ok(corps instanceof FormData)
    assert.equal(corps.get('type'), 'enseignants')
    assert.ok(corps.get('fichier') instanceof Blob)
    assert.equal(corps.has('feuille'), false)
    assert.equal((appels[0].init.headers as Record<string, string>)['Content-Type'], undefined)
  })

  it('renvoie undefined pour une réponse 204', async () => {
    simulerFetch(() => new Response(null, { status: 204 }))
    assert.equal(await appeler(supprimer, { params: { jeu: '1' } }), undefined)
  })

  it('refuse un paramètre de chemin manquant', () => {
    assert.throws(() => construireChemin('jeux/{jeu}/', {}), /Paramètre « jeu » manquant/)
  })
})

describe('conversion des erreurs', () => {
  it('reprend le code et le motif d’un refus métier (422)', async () => {
    simulerFetch(() => json({ code: 'meme_ecole', motif: 'L’enseignant est déjà dans cette école.' }, 422))
    await assert.rejects(appeler(lister), (erreur: unknown) => {
      assert.ok(estRefusMetier(erreur))
      assert.equal(erreur.statut, 422)
      assert.equal(erreur.code, 'meme_ecole')
      assert.equal(erreur.motif, 'L’enseignant est déjà dans cette école.')
      return true
    })
  })

  it('donne un code et un motif par défaut à un conflit sans corps (409)', async () => {
    simulerFetch(() => new Response('', { status: 409 }))
    await assert.rejects(appeler(lister), (erreur: unknown) => {
      assert.ok(estConflit(erreur))
      assert.equal(erreur.code, 'conflit')
      assert.match(erreur.motif, /conflit/)
      return true
    })
  })

  it('signale un serveur injoignable par le statut 0', async () => {
    simulerFetch(() => {
      throw new TypeError('fetch failed')
    })
    await assert.rejects(appeler(lister), (erreur: unknown) => {
      assert.ok(estInjoignable(erreur))
      assert.equal((erreur as ApiError).statut, STATUT_INJOIGNABLE)
      assert.equal((erreur as ApiError).code, 'serveur_injoignable')
      return true
    })
  })

  it('laisse remonter une annulation volontaire telle quelle', async () => {
    simulerFetch(() => {
      throw new DOMException('Annulé', 'AbortError')
    })
    await assert.rejects(appeler(lister), (erreur: unknown) => {
      assert.ok(erreur instanceof DOMException)
      assert.equal(erreur.name, 'AbortError')
      return true
    })
  })
})
