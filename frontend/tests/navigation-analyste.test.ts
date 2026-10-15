/**
 * Vue analyste : réservée au DRH. « Fait de Prince » n'existe qu'en Vue analyste et que pour le DRH.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  RUBRIQUES,
  etapesVisibles,
  pageAnalysteSeule,
  pageReserveeAuDrh,
} from '../components/shared/ui/coquille/navigation'

const affectations = RUBRIQUES.find(r => r.id === 'affectations')!
const ids = (mode: 'simple' | 'analyste', role: 'drh' | 'delegue') =>
  etapesVisibles(affectations, mode, role).map(e => e.id)

describe('Fait de Prince et Vue analyste', () => {
  it('« Fait de Prince » est une page de la Vue analyste, réservée au DRH', () => {
    assert.equal(pageAnalysteSeule('prince'), true)
    assert.equal(pageReserveeAuDrh('prince'), true)
  })

  it('le DRH le voit en Vue analyste seulement', () => {
    assert.ok(!ids('simple', 'drh').includes('prince'))
    assert.ok(ids('analyste', 'drh').includes('prince'))
  })

  it('un délégué ne le voit dans aucun mode', () => {
    assert.ok(!ids('simple', 'delegue').includes('prince'))
    assert.ok(!ids('analyste', 'delegue').includes('prince'))
  })

  it('les pages techniques de la Vue analyste ne sont jamais ouvertes à un délégué', () => {
    for (const page of ['data', 'pool', 'posts', 'assignments', 'unassigned', 'logs', 'engine'] as const) {
      assert.equal(pageAnalysteSeule(page) || pageReserveeAuDrh(page), true, page)
    }
  })
})
