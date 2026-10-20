/** Niveaux de proximité d'un mouvement : la commune et la circonscription IAEB forment un seul niveau. */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { proximite } from '../components/shared/api/backend/conversions/simulation'

const lieu = (commune: string, iaeb: string, departement: string, region: string) => ({
  commune,
  iaeb,
  departement,
  region,
})

const ORIGINE = lieu('Mfoundi 1', 'IAEB Mfoundi 1', 'Mfoundi', 'Centre')

test('Même commune : niveau commune / IAEB', () => {
  assert.equal(proximite(ORIGINE, lieu('mfoundi 1', 'IAEB autre', 'Mfoundi', 'Centre')), 'meme_commune')
})

test('Même IAEB sans même commune : niveau commune / IAEB', () => {
  assert.equal(proximite(ORIGINE, lieu('Mfoundi 2', 'iaeb mfoundi 1', 'Mfoundi', 'Centre')), 'meme_commune')
})

test('Ni commune ni IAEB : département, région, puis hors région', () => {
  assert.equal(proximite(ORIGINE, lieu('Mfoundi 3', 'IAEB Mfoundi 3', 'Mfoundi', 'Centre')), 'meme_departement')
  assert.equal(proximite(ORIGINE, lieu('Mbam 1', 'IAEB Mbam 1', 'Mbam', 'Centre')), 'meme_region')
  assert.equal(proximite(ORIGINE, lieu('Wouri 1', 'IAEB Wouri 1', 'Wouri', 'Littoral')), 'hors_region')
})

test('Une commune ou une IAEB vide ne rapproche jamais deux lieux', () => {
  assert.equal(proximite(lieu('', '', 'Mfoundi', 'Centre'), lieu('', '', 'Mbam', 'Centre')), 'meme_region')
})
