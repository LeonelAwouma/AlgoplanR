/**
 * Onglet « Projection N+1 à N+5 » : mise en forme des chiffres du serveur, sans recalcul, et détection des ruptures
 * d'enchaînement des effectifs.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { AnneePlan, IndicateursAnnee } from '../components/shared/api'
import {
  construireProjection,
  rupturesDeChainage,
  tauxAttritionApplique,
  totauxProjection,
} from '../components/planification/domain/projection'

const ANNEES: AnneePlan[] = ['N+1', 'N+2', 'N+3', 'N+4', 'N+5']

/** Année minimale du tableau ; le détail de la projection est facultatif. */
function annee(i: number, debut: number, extra: Partial<IndicateursAnnee> = {}): IndicateursAnnee {
  return {
    annee: ANNEES[i],
    effectifDebut: debut,
    departsRetraite: 10,
    departsAttrition: 5,
    besoin: 20,
    ressourcesVivier: 0,
    quotaCalcule: 15,
    quotaRetenu: null,
    nominationsPrevues: 0,
    nominationsRealisees: 0,
    deploiementsPrevus: 0,
    deploiementsRealises: 0,
    besoinRestant: 15,
    ...extra,
  }
}

/** Cinq années chaînées : fin = début − 10 − 5 − 2 + 15 = début − 2. */
const COMPLETES = [1000, 998, 996, 994, 992].map((debut, i) =>
  annee(i, debut, { directeursDecharges: 2, recrutement: 15, effectifFin: debut - 2, tauxAttrition: 2.25, rem: 31.2 }),
)

describe('projection N+1 à N+5', () => {
  it('reprend telles quelles les valeurs du serveur', () => {
    const lignes = construireProjection(COMPLETES)
    assert.equal(lignes.length, 5)
    assert.deepEqual(
      lignes.map(l => [l.effectifDebut, l.effectifFin, l.variation]),
      [
        [1000, 998, -2],
        [998, 996, -2],
        [996, 994, -2],
        [994, 992, -2],
        [992, 990, -2],
      ],
    )
    assert.equal(lignes[0].directeursDecharges, 2)
    assert.equal(lignes[0].rem, 31.2)
  })

  it('totalise l’horizon et signale le taux d’attrition appliqué', () => {
    const lignes = construireProjection(COMPLETES)
    const t = totauxProjection(lignes)
    assert.deepEqual(t, {
      departsRetraite: 50,
      departsAttrition: 25,
      recrutements: 75,
      effectifInitial: 1000,
      effectifFinal: 990,
      variation: -10,
    })
    assert.equal(tauxAttritionApplique(lignes), 2.25)
  })

  it('un enchaînement cohérent n’a aucune rupture', () => {
    assert.deepEqual(rupturesDeChainage(construireProjection(COMPLETES)), [])
  })

  it('une rupture d’enchaînement est signalée', () => {
    const cassee = COMPLETES.map((a, i) => (i === 2 ? { ...a, effectifDebut: 900 } : a))
    assert.deepEqual(rupturesDeChainage(construireProjection(cassee)), ['N+2'])
  })

  it('sans détail du serveur : l’effectif de fin est celui de début de l’année suivante, sauf en dernière année', () => {
    const anciennes = [1000, 990, 980].map((debut, i) => annee(i, debut))
    const lignes = construireProjection(anciennes)
    assert.deepEqual(
      lignes.map(l => l.effectifFin),
      [990, 980, null],
    )
    assert.equal(lignes[0].directeursDecharges, null)
    assert.equal(lignes[0].rem, null)
    const t = totauxProjection(lignes)
    assert.equal(t?.recrutements, null)
    assert.equal(t?.effectifFinal, null)
    assert.equal(tauxAttritionApplique(lignes), null)
  })

  it('reprend le quota retenu, pour signaler le report des quotas sur les effectifs', () => {
    const avec = COMPLETES.map((a, i) => (i === 0 ? { ...a, quotaRetenu: 20 } : a))
    assert.deepEqual(
      construireProjection(avec).map(l => l.quotaRetenu),
      [20, null, null, null, null],
    )
  })

  it('un tableau vide n’a pas de totaux', () => {
    assert.equal(totauxProjection([]), null)
  })
})

describe('Taux d’encadrement projeté non disponible', () => {
  it('garde la raison fournie par le serveur et n’invente aucune valeur', () => {
    const raison = '3 école(s) à effectif d’élèves inconnu : …'
    const lignes = construireProjection([
      annee(0, 1000, { rem: 31.9 }),
      annee(1, 998, { rem: null, remRaison: raison }),
      annee(2, 996),
    ])
    assert.equal(lignes[0].rem, 31.9)
    assert.equal(lignes[0].remRaison, null)
    assert.equal(lignes[1].rem, null)
    assert.equal(lignes[1].remRaison, raison)
    assert.equal(lignes[2].rem, null, 'sans valeur ni raison : indisponible, jamais 0')
    assert.equal(lignes[2].remRaison, null)
  })
})
