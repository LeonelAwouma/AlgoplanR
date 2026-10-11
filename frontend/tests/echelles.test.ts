/**
 * Échelles des graphiques.
 *
 * Ces règles sont testées parce qu'une erreur y est silencieuse : un axe dont
 * la dernière graduation est inférieure au maximum ne provoque aucune erreur,
 * il fait simplement sortir la plus grande barre de son cadre.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { construireClasses, graduations } from '../components/shared/kernel/echelles'

test('La dernière graduation couvre toujours la valeur maximale', () => {
  for (const max of [1, 3, 7, 15, 18, 23, 38, 99, 100, 313, 1684, 0.4, 1.4, 2.5, 53.6]) {
    const ticks = graduations(max)
    const dernier = ticks[ticks.length - 1]
    assert.ok(dernier >= max, `max ${max} : dernière graduation ${dernier} inférieure au maximum`)
  }
})

test('Les graduations partent de zéro et sont régulièrement espacées', () => {
  const ticks = graduations(38)
  assert.equal(ticks[0], 0)
  const pas = ticks[1] - ticks[0]
  for (let i = 1; i < ticks.length; i++) {
    assert.ok(Math.abs(ticks[i] - ticks[i - 1] - pas) < 1e-9, 'espacement irrégulier')
  }
  assert.ok(ticks.length >= 3 && ticks.length <= 9, `nombre de graduations peu lisible : ${ticks.length}`)
})

test('Une échelle reste définie pour une série vide ou nulle', () => {
  assert.deepEqual(graduations(0), [0, 1])
  assert.deepEqual(graduations(-5), [0, 1])
  assert.deepEqual(graduations(Number.NaN), [0, 1])
})

test('Les intervalles d’un histogramme restent distincts sur des valeurs décimales', () => {
  // Taux d'encadrement : sans décimales, tous les intervalles s'écriraient « 1 – 1 ».
  const classes = construireClasses([0.5, 0.67, 0.8, 0.9, 1, 1, 1.1, 1.2, 1.25, 1.4], 8)
  const libelles = classes.map(c => c.label)
  assert.equal(new Set(libelles).size, libelles.length, `intervalles en doublon : ${libelles.join(' | ')}`)
  assert.ok(libelles.every(l => l.includes('–')))
})

test('Chaque valeur tombe dans une classe et une seule', () => {
  const valeurs = [2, 4, 4, 5, 9, 12, 12, 12, 18, 21, 30]
  const classes = construireClasses(valeurs, 6)
  assert.equal(
    classes.reduce((a, c) => a + c.effectif, 0),
    valeurs.length,
  )
  assert.ok(classes.every(c => c.effectif >= 0))
})

test('Les bornes des classes sont croissantes et régulières', () => {
  const classes = construireClasses([10, 20, 30, 40, 55, 70, 90], 5)
  for (let i = 1; i < classes.length; i++) {
    assert.ok(classes[i].borneBasse > classes[i - 1].borneBasse, 'bornes non croissantes')
  }
  const amplitude = classes[1].borneBasse - classes[0].borneBasse
  for (let i = 1; i < classes.length; i++) {
    assert.ok(Math.abs(classes[i].borneBasse - classes[i - 1].borneBasse - amplitude) < 1e-9)
  }
})

test('Une série constante produit une seule classe', () => {
  const classes = construireClasses([3, 3, 3, 3])
  assert.equal(classes.length, 1)
  assert.equal(classes[0].effectif, 4)
})

test('Une série vide ne produit aucune classe', () => {
  assert.deepEqual(construireClasses([]), [])
  assert.deepEqual(construireClasses([Number.NaN, Number.POSITIVE_INFINITY]), [])
})
