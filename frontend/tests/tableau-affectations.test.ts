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

// --- Consultation paginée à l'écran ------------------------------------------------------------------------------

import {
  FILTRES_AFFECTATIONS_VIDES,
  filtrerLignes,
  optionsFiltre,
  paginer,
} from '../components/rapports/domain/affectations'

function lignesDeTest(n: number): string[][] {
  const regions = ['Adamaoua', 'Centre', 'Nord']
  return lignesAffectations(
    Array.from({ length: n }, (_, i) =>
      proposition(`M${String(i).padStart(4, '0')}`, regions[i % 3], `Dept ${i % 6}`, `Nom${i}`, i % 2 ? 1 : null),
    ),
  )
}

test('La pagination sert des pages de 50 ou 100 lignes sans en perdre', () => {
  const lignes = lignesDeTest(1762)
  const p1 = paginer(lignes, 1, 50)
  assert.equal(p1.lignes.length, 50)
  assert.equal(p1.pages, 36)
  assert.deepEqual([p1.de, p1.a, p1.total], [1, 50, 1762])
  const derniere = paginer(lignes, 36, 50)
  assert.equal(derniere.lignes.length, 12)
  assert.deepEqual([derniere.de, derniere.a], [1751, 1762])
  assert.equal(paginer(lignes, 18, 100).lignes.length, 62)
  // Toutes les pages mises bout à bout redonnent toutes les lignes, une fois chacune.
  const vues = Array.from({ length: p1.pages }, (_, k) => paginer(lignes, k + 1, 50).lignes).flat()
  assert.equal(vues.length, 1762)
  assert.equal(new Set(vues.map(l => l[0])).size, 1762)
})

test('Une page hors bornes est ramenée dans les bornes, et une liste vide donne une page vide', () => {
  const lignes = lignesDeTest(120)
  assert.equal(paginer(lignes, 99, 50).page, 3)
  assert.equal(paginer(lignes, 0, 50).page, 1)
  assert.equal(paginer(lignes, -4, 50).page, 1)
  const vide = paginer([], 1, 50)
  assert.deepEqual([vide.lignes.length, vide.page, vide.pages, vide.de, vide.a], [0, 1, 1, 0, 0])
})

test('Les filtres ne touchent que la consultation : la liste complète reste intacte', () => {
  const lignes = lignesDeTest(300)
  const avant = lignes.length
  const nord = filtrerLignes(lignes, { ...FILTRES_AFFECTATIONS_VIDES, region: 'Nord' })
  assert.equal(nord.length, 100)
  assert.ok(nord.every(l => l[9] === 'Nord'))
  assert.equal(lignes.length, avant, 'les lignes servant à l’annexe Word ne sont pas modifiées')
  assert.equal(filtrerLignes(lignes, { ...FILTRES_AFFECTATIONS_VIDES, recherche: 'm0042' }).length, 1)
  assert.equal(filtrerLignes(lignes, { ...FILTRES_AFFECTATIONS_VIDES, recherche: 'NOM7' }).length, 11) // Nom7, Nom70..Nom79
})

test('Les départements proposés dépendent de la région choisie', () => {
  const lignes = lignesDeTest(60)
  assert.deepEqual(optionsFiltre(lignes, 'region', FILTRES_AFFECTATIONS_VIDES), ['Adamaoua', 'Centre', 'Nord'])
  const depts = optionsFiltre(lignes, 'departement', { ...FILTRES_AFFECTATIONS_VIDES, region: 'Centre' })
  assert.ok(depts.length > 0 && depts.length < 6)
})
