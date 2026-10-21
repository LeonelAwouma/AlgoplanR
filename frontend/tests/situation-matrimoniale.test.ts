/**
 * Situation matrimoniale (composante C3 du barème) : l'interface lit la même règle que le serveur (v2) — une situation
 * vide ou non reconnue vaut 0 point, elle n'est jamais assimilée à « célibataire ».
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { categorieSituation } from '../components/shared/api/backend/conversions/referentiel'

describe('categorieSituation (miroir de bareme.categorie_situation)', () => {
  it('reconnaît les quatre situations, accents et casse ignorés', () => {
    assert.deepEqual(categorieSituation('Célibataire'), { cle: 'celibataire', reconnue: true })
    assert.deepEqual(categorieSituation('CELIBATAIRE'), { cle: 'celibataire', reconnue: true })
    assert.deepEqual(categorieSituation('Marié(e)'), { cle: 'marie', reconnue: true })
    assert.deepEqual(categorieSituation('Divorcée'), { cle: 'divorce', reconnue: true })
    assert.deepEqual(categorieSituation('Veuve'), { cle: 'veuf', reconnue: true })
  })

  it('une valeur vide ou non reconnue n’a pas de catégorie (0 point), jamais « célibataire »', () => {
    for (const v of ['', '   ', null, undefined, 'séparé(e)', 'Union libre', 'N/A']) {
      assert.deepEqual(categorieSituation(v), { cle: '', reconnue: false }, String(v))
    }
  })
})
