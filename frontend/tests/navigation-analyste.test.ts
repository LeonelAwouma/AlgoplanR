/**
 * Vue analyste et Fait de Prince : « Fait de Prince » est une étape du menu Données (après l'import, avant la
 * validation), réservée au DRH et visible dès la vue Décideur ; les écrans techniques ne sont ouverts qu'au DRH en
 * Vue analyste.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  RUBRIQUES,
  etapesVisibles,
  pageAnalysteSeule,
  pageReserveeAuDrh,
} from '../components/shared/ui/coquille/navigation'

const donnees = RUBRIQUES.find(r => r.id === 'donnees')!
const ids = (mode: 'simple' | 'analyste', role: 'drh' | 'delegue') => etapesVisibles(donnees, mode, role).map(e => e.id)

describe('Fait de Prince et Vue analyste', () => {
  it('« Fait de Prince » est réservé au DRH mais n’exige pas la Vue analyste', () => {
    assert.equal(pageReserveeAuDrh('prince'), true)
    assert.equal(pageAnalysteSeule('prince'), false)
  })

  it('le DRH le voit dès la vue Décideur, entre l’import et la validation', () => {
    assert.deepEqual(ids('simple', 'drh'), ['import', 'prince', 'validation'])
    assert.ok(ids('analyste', 'drh').includes('prince'))
  })

  it('un délégué ne le voit dans aucun mode', () => {
    assert.ok(!ids('simple', 'delegue').includes('prince'))
    assert.ok(!ids('analyste', 'delegue').includes('prince'))
  })

  it('les pages techniques n’existent qu’en Vue analyste, ouverte au DRH comme au délégué', () => {
    for (const page of ['data', 'pool', 'posts', 'assignments', 'unassigned', 'logs', 'engine'] as const) {
      assert.equal(pageAnalysteSeule(page), true, page)
    }
    // Le délégué les voit en Vue analyste, sauf celles que le DRH seul règle (configuration du moteur).
    const visibles = RUBRIQUES.flatMap(r => etapesVisibles(r, 'analyste', 'delegue')).map(e => e.id)
    for (const page of ['data', 'pool', 'posts', 'assignments', 'unassigned', 'logs'] as const) {
      assert.ok(visibles.includes(page), page)
    }
    assert.ok(!visibles.includes('engine'))
  })

  it('la vue Décideur ne montre aucune page technique', () => {
    for (const rubrique of RUBRIQUES) {
      for (const etape of etapesVisibles(rubrique, 'simple', 'drh')) {
        assert.equal(pageAnalysteSeule(etape.id), false, etape.id)
      }
    }
  })
})
