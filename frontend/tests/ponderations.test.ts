/**
 * Pondérations dont la somme vaut 1.
 *
 * Testées parce qu'une erreur y est silencieuse : un barème dont les poids ne
 * font plus 1 change l'échelle des scores sans aucun message.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { reequilibrerPoids, sommePoids } from '../components/parametrage/domain/edition'

const BAREME = {
  carriereZone: 0.3,
  anciennetePoste: 0.25,
  chargesFamiliales: 0.2,
  formationContinue: 0.15,
  cohorteAge: 0.1,
}

test('Augmenter un poids diminue les autres et la somme reste 1', () => {
  const poids = reequilibrerPoids(BAREME, 'carriereZone', 0.5)
  assert.equal(poids.carriereZone, 0.5)
  assert.equal(sommePoids(poids), 1)
  for (const cle of ['anciennetePoste', 'chargesFamiliales', 'formationContinue', 'cohorteAge'] as const) {
    assert.ok(poids[cle] < BAREME[cle], `${cle} aurait dû diminuer`)
  }
})

test('Les autres poids gardent leurs proportions', () => {
  const poids = reequilibrerPoids(BAREME, 'carriereZone', 0.58)
  // Reste 0,42 pour 0,70 de poids : chacun est multiplié par 0,6.
  assert.deepEqual(poids, {
    carriereZone: 0.58,
    anciennetePoste: 0.15,
    chargesFamiliales: 0.12,
    formationContinue: 0.09,
    cohorteAge: 0.06,
  })
})

test('Diminuer un poids augmente les autres', () => {
  const poids = reequilibrerPoids(BAREME, 'carriereZone', 0.1)
  assert.equal(sommePoids(poids), 1)
  assert.ok(poids.anciennetePoste > BAREME.anciennetePoste)
})

test('Un poids à 1 met tous les autres à 0', () => {
  const poids = reequilibrerPoids(BAREME, 'cohorteAge', 1)
  assert.deepEqual(poids, {
    carriereZone: 0,
    anciennetePoste: 0,
    chargesFamiliales: 0,
    formationContinue: 0,
    cohorteAge: 1,
  })
})

test('Si les autres sont tous à 0, le reste est partagé à parts égales', () => {
  const poids = reequilibrerPoids({ a: 1, b: 0, c: 0 }, 'a', 0.4)
  assert.deepEqual(poids, { a: 0.4, b: 0.3, c: 0.3 })
})

test('L’arrondi au centième ne fait jamais dévier la somme de 1', () => {
  const groupe = { bareme: 0.25, poidsPoste: 0.25, proximite: 0.25, ajustements: 0.25 }
  for (let centiemes = 0; centiemes <= 100; centiemes++) {
    const poids = reequilibrerPoids(groupe, 'proximite', centiemes / 100)
    assert.equal(sommePoids(poids), 1, `valeur ${centiemes / 100}`)
    assert.ok(
      Object.values(poids).every(p => p >= 0),
      `poids négatif pour ${centiemes / 100}`,
    )
  }
})

test('Un poids saisi hors de [0, 1] est ramené dans l’intervalle', () => {
  assert.equal(reequilibrerPoids(BAREME, 'carriereZone', 1.4).carriereZone, 1)
  assert.equal(reequilibrerPoids(BAREME, 'carriereZone', -0.2).carriereZone, 0)
})
