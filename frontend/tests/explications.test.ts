/**
 * Le total du tableau « Pourquoi cette proposition ? » est le score d'appariement, jamais le barème :
 * l'ancien libellé « Barème individuel » faisait lire 22,3125 comme le barème d'un enseignant à 22,75.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { libelleTotalScore } from '../components/simulation/domain/explications'

test('Le total est étiqueté score d’appariement pour toutes les natures de mouvement', () => {
  for (const nature of ['voeu', 'hors_voeux', 'obligatoire'] as const) {
    assert.match(libelleTotalScore(nature), /Score d'appariement/)
    assert.doesNotMatch(libelleTotalScore(nature), /^Barème/)
  }
})

test('Une décision de commission rappelle que le score est indicatif', () => {
  assert.match(libelleTotalScore('arbitrage'), /indicatif/)
})
