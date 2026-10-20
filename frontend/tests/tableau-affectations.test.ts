/** Tableau complet des propositions d'affectation du rapport : une ligne par proposition, dans l'ordre de lecture. */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { ProposedAssignment } from '../components/shared/api'
import {
  ENTETES_AFFECTATIONS,
  lignesAffectations,
  ordonnerAffectations,
} from '../components/rapports/domain/affectations'

function proposition(
  id: string,
  region: string,
  departement: string,
  nom: string,
  voeu: number | null,
): ProposedAssignment {
  return {
    phase: voeu ? `phase1_voeu_${voeu}` : 'phase2_proximite_departement',
    nature: voeu ? 'voeu' : 'obligatoire',
    rangVoeu: voeu,
    statut: 'propose',
    annee: 'N+1',
    postId: `${id}_P1`,
    teacherId: id,
    nomEns: nom,
    prenomEns: 'Paul',
    sousSysteme: 'francophone',
    schoolOrigineId: 'ECO1',
    nomEtabOrigine: 'Ecole A',
    communeOrigine: 'Mfoundi 1',
    departementOrigine: 'Mfoundi',
    regionOrigine: 'Centre',
    schoolDestinationId: 'ECO2',
    nomEtabDestination: 'Ecole B',
    communeDestination: 'Mbam 1',
    departementDestination: departement,
    regionDestination: region,
    niveauProximite: 'meme_region',
    bareme: 22.75,
    score: 22.3125,
    breakdown: { total: 22.3125, components: [] },
  }
}

test('Une ligne par proposition, avec autant de cellules que d’en-têtes', () => {
  const lignes = lignesAffectations([
    proposition('M1', 'Centre', 'Mbam', 'Abena', 1),
    proposition('M2', 'Centre', 'Mbam', 'Zang', null),
  ])
  assert.equal(lignes.length, 2)
  for (const l of lignes) assert.equal(l.length, ENTETES_AFFECTATIONS.length)
})

test('Les propositions sont rangées par région, département puis nom, et numérotées', () => {
  const ordre = ordonnerAffectations([
    proposition('M1', 'Littoral', 'Wouri', 'Zang', null),
    proposition('M2', 'Centre', 'Mbam', 'Zang', null),
    proposition('M3', 'Centre', 'Mbam', 'Abena', null),
    proposition('M4', 'Adamaoua', 'Vina', 'Ndi', null),
  ])
  assert.deepEqual(
    ordre.map(a => a.teacherId),
    ['M4', 'M3', 'M2', 'M1'],
  )
  const lignes = lignesAffectations(ordre)
  assert.deepEqual(
    lignes.map(l => l[0]),
    ['1', '2', '3', '4'],
  )
})

test('Le rang du vœu satisfait apparaît dans la nature, et les nombres sont formatés', () => {
  const [voeu, autre] = lignesAffectations([
    proposition('M1', 'Centre', 'Mbam', 'Abena', 2),
    proposition('M2', 'Centre', 'Mbam', 'Zang', null),
  ])
  assert.match(voeu[10], /vœu 2/)
  assert.doesNotMatch(autre[10], /vœu/)
  assert.equal(voeu[13], '22,75')
  assert.equal(voeu[14], '22,31')
})

test('Aucune proposition : aucune ligne', () => {
  assert.deepEqual(lignesAffectations([]), [])
})
