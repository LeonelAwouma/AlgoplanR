/** Un export long ou en échec dit toujours ce qui se passe : progression, délai dépassé, annulation, serveur muet. */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ApiError } from '../components/shared/api'
import { dureeEcoulee, messageEchecExport, messageGeneration } from '../components/rapports/application/messagesExport'

describe('messages d’export', () => {
  it('affiche la durée écoulée', () => {
    assert.equal(dureeEcoulee(7.9), '7 s')
    assert.equal(dureeEcoulee(65), '1 min 05 s')
  })
  it('annonce la durée attendue d’un export national, pas d’un export de périmètre', () => {
    assert.match(messageGeneration(true, 12), /environ une minute/)
    assert.match(messageGeneration(true, 12), /12 s écoulées/)
    assert.doesNotMatch(messageGeneration(false, 3), /une minute/)
  })
  it('distingue délai dépassé, annulation, serveur injoignable, refus et autre échec', () => {
    assert.equal(
      messageEchecExport(new ApiError(408, 'delai_depasse', 'trop long')).titre,
      'L’export a dépassé le délai.',
    )
    assert.equal(messageEchecExport(new ApiError(499, 'annule', 'annulé')).titre, 'Export annulé.')
    assert.match(messageEchecExport(new ApiError(0, 'serveur_injoignable', 'injoignable')).detail, /pas perdues/)
    assert.equal(messageEchecExport(new ApiError(403, 'reserve_drh', 'réservé')).titre, 'Export refusé.')
    assert.equal(messageEchecExport(new ApiError(500, 'erreur_serveur', 'boom')).titre, 'L’export a échoué.')
    assert.equal(messageEchecExport(new Error('x')).detail, 'x')
  })
})

describe('telechargerDepuisServeur : délai et annulation', () => {
  const vraiFetch = globalThis.fetch
  /** Un serveur qui ne répond jamais, mais qui respecte l'annulation. */
  function serveurMuet() {
    globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, rejeter) => {
        init?.signal?.addEventListener('abort', () => rejeter(new DOMException('abort', 'AbortError')))
      })) as typeof fetch
  }

  it('abandonne avec « delai_depasse » quand le serveur ne répond pas à temps', async () => {
    const { telechargerDepuisServeur } = await import('../components/shared/api/telechargement')
    serveurMuet()
    try {
      await assert.rejects(
        telechargerDepuisServeur('jeux/x/export/', {}, 'f.xlsx', { delaiMs: 30 }),
        (e: unknown) => e instanceof ApiError && e.code === 'delai_depasse' && e.statut === 408,
      )
    } finally {
      globalThis.fetch = vraiFetch
    }
  })

  it('abandonne avec « annule » quand l’utilisateur annule', async () => {
    const { telechargerDepuisServeur } = await import('../components/shared/api/telechargement')
    serveurMuet()
    const controleur = new AbortController()
    setTimeout(() => controleur.abort(), 20)
    try {
      await assert.rejects(
        telechargerDepuisServeur('jeux/x/export/', {}, 'f.xlsx', { signal: controleur.signal }),
        (e: unknown) => e instanceof ApiError && e.code === 'annule',
      )
    } finally {
      globalThis.fetch = vraiFetch
    }
  })
})
