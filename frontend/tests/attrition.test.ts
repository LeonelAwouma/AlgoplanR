/**
 * Attrition hors retraite : les hypothèses de planification sont l'unique source, et le calcul du frontend donne les
 * mêmes nombres que le serveur (`domaine/planification/projection.py`, `taux_attrition` et `arrondi`).
 *
 * Les valeurs attendues viennent du serveur, calculées sur ces mêmes écoles : parité d'une règle écrite deux fois.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { SchoolDiagnostic } from '../components/shared/api'
import {
  arrondiDemiHaut,
  departsAttrition,
  tauxAttrition,
  type EffectifEcole,
  type HypotheseAttrition,
} from '../components/shared/api/backend/moteur/attrition'
import { syntheseTerritoriale } from '../components/shared/api/backend/moteur/synthese'

const ECOLES: EffectifEcole[] = [
  { region: 'Centre', sousSysteme: 'francophone', effectif: 120 },
  { region: 'Nord', sousSysteme: 'francophone', effectif: 80 },
  { region: 'Nord', sousSysteme: 'anglophone', effectif: 40 },
  { region: 'Sud-Ouest', sousSysteme: 'anglophone', effectif: 30 },
  { region: 'Est', sousSysteme: null, effectif: 10 },
]

const BASE = {
  tauxUnique: 2.25,
  parRegion: { Centre: 1.92, Nord: 3.5, 'sud-ouest': 4.1 },
  parSousSysteme: { francophone: 2.0, anglophone: 3.0 },
}
const hyp = (methode: HypotheseAttrition['methode']): HypotheseAttrition => ({ ...BASE, methode })

describe('attrition : même règle que le serveur', () => {
  it('arrondit à l’entier le plus proche, demi vers le haut', () => {
    assert.equal(arrondiDemiHaut((44232 * 2.25) / 100), 995)
    assert.deepEqual([2.5, 0.49, 7.5, 0.5].map(arrondiDemiHaut), [3, 0, 8, 1])
  })

  it('taux unique, par région et par sous-système : taux pondéré et départs du serveur', () => {
    assert.equal(tauxAttrition(hyp('taux_unique'), ECOLES), 2.25)
    assert.equal(departsAttrition(hyp('taux_unique'), ECOLES), 6)
    assert.ok(Math.abs(tauxAttrition(hyp('par_region'), ECOLES) - 2.8425) < 1e-9)
    assert.equal(departsAttrition(hyp('par_region'), ECOLES), 8)
    assert.ok(Math.abs(tauxAttrition(hyp('par_sous_systeme'), ECOLES) - 2.2589285714285716) < 1e-9)
    assert.equal(departsAttrition(hyp('par_sous_systeme'), ECOLES), 6)
  })

  it('sans effectif, le taux unique s’applique', () => {
    assert.equal(tauxAttrition(hyp('par_region'), []), 2.25)
  })
})

/** Diagnostic minimal : seuls les champs lus par la synthèse territoriale. */
function diagnostic(
  id: string,
  region: string,
  sousSysteme: 'francophone' | 'anglophone' | null,
  retenus: number,
  cible: number,
): SchoolDiagnostic {
  return {
    school: { id, region, sousSysteme },
    calcul: { enseignantsRetenus: retenus, cible, dotation: cible, sallesManquantes: 0 },
  } as unknown as SchoolDiagnostic
}

describe('synthèse territoriale : recrutement à prévoir', () => {
  const diagnostics = [
    diagnostic('A', 'Centre', 'francophone', 100, 110),
    diagnostic('B', 'Nord', 'francophone', 60, 55),
    diagnostic('C', 'Nord', 'anglophone', 40, 40),
  ]

  it('ajoute l’attrition des hypothèses au besoin restant, sous-système par sous-système', () => {
    const s = syntheseTerritoriale(diagnostics, { ...hyp('taux_unique'), tauxUnique: 3 })
    const franco = s.parSousSysteme.find(g => g.sousSysteme === 'francophone')
    const anglo = s.parSousSysteme.find(g => g.sousSysteme === 'anglophone')
    // francophone : besoin 10 (école A), excédent 5 (école B) → restant 5 ; attrition arrondi(3 % × 160) = 5
    assert.equal(franco?.restant, 5)
    assert.equal(franco?.recrutementAPrevoir, 5 + 5)
    // anglophone : rien à couvrir ; attrition arrondi(3 % × 40) = 1 (et non ⌈1,2⌉ = 2 comme avant)
    assert.equal(anglo?.recrutementAPrevoir, 1)
  })

  it('suit les hypothèses : un autre taux change le résultat', () => {
    const faible = syntheseTerritoriale(diagnostics, { ...hyp('taux_unique'), tauxUnique: 1 })
    const fort = syntheseTerritoriale(diagnostics, { ...hyp('taux_unique'), tauxUnique: 6 })
    assert.ok(fort.recrutementAPrevoir > faible.recrutementAPrevoir)
  })
})
