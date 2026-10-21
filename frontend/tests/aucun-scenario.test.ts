/** Le refus 422 « Aucun scénario calculé » est reconnu pour proposer l'action de calcul (jamais une création au GET). */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ApiError, estAucunScenario } from '../components/shared/api'

describe('estAucunScenario', () => {
  it('reconnaît le code métier du serveur', () => {
    assert.equal(estAucunScenario(new ApiError(422, 'aucun_scenario', 'Aucun scénario calculé')), true)
  })
  it('ignore les autres erreurs', () => {
    assert.equal(estAucunScenario(new ApiError(422, 'refus_metier', 'Autre refus')), false)
    assert.equal(estAucunScenario(new ApiError(403, 'ecriture_interdite', 'Lecture seule')), false)
    assert.equal(estAucunScenario(new Error('aucun_scenario')), false)
    assert.equal(estAucunScenario(null), false)
  })
})
