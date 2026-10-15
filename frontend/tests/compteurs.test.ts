/**
 * Lecture des nombres affichés, base des compteurs animés.
 *
 * Testée parce qu'une erreur y fausserait un indicateur pendant l'animation,
 * ou figerait à l'écran une valeur différente de la valeur réelle.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { decomposerNombre, formaterNombre } from '../components/shared/ui/motion/nombres'

const ESPACE_FINE = ' '

test('Un entier avec séparateur de milliers est lu puis réécrit à l’identique', () => {
  const texte = `1${ESPACE_FINE}234`
  const nombre = decomposerNombre(texte)
  assert.ok(nombre)
  assert.equal(nombre.valeur, 1234)
  assert.equal(nombre.decimales, 0)
  assert.equal(formaterNombre(nombre, nombre.valeur), texte)
})

test('Les décimales et l’unité sont conservées', () => {
  const pourcentage = decomposerNombre('36 %')
  assert.ok(pourcentage)
  assert.equal(pourcentage.valeur, 36)
  assert.equal(pourcentage.suffixe, ' %')

  const ratio = decomposerNombre('53,09')
  assert.ok(ratio)
  assert.equal(ratio.valeur, 53.09)
  assert.equal(ratio.decimales, 2)
  assert.equal(formaterNombre(ratio, 0), '0,00')
})

test('Un texte sans nombre unique n’est pas animé', () => {
  for (const texte of ['—', '…', '12 / 40', 'Non calculable', '2026-2027']) {
    assert.equal(decomposerNombre(texte), null, texte)
  }
})
