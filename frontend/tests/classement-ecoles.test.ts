/** Classement des écoles : l'ordre est celui du serveur (rang d'accueil), jamais recalculé côté interface. */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { trierParPriorite } from '../components/shared/api/backend/moteur/diagnostic'
import type { SchoolDiagnostic } from '../components/shared/api'

function ecole(id: string, rang: number | null, indice: number, rem: number | null = null): SchoolDiagnostic {
  return {
    school: { id },
    besoinTheorique: rang === null ? 0 : 1,
    deficitAbsolu: rang === null ? 0 : 1,
    calcul: { remActuel: rem },
    priorite: { rang, indice },
  } as unknown as SchoolDiagnostic
}

describe('Classement des écoles', () => {
  it('suit le rang du serveur, même quand l’interface classerait autrement', () => {
    // À poids égal (u = 20), le serveur place B avant A (REM plus élevé) ; l'interface n'a pas à le redécider.
    const triees = trierParPriorite([ecole('A', 2, 20, 40), ecole('B', 1, 20, 90), ecole('C', 3, 20, 60)])
    assert.deepEqual(
      triees.map(d => d.school.id),
      ['B', 'A', 'C'],
    )
  })

  it('met les écoles sans besoin après celles qui en ont, par poids puis identifiant', () => {
    const triees = trierParPriorite([
      ecole('Z', null, 5),
      ecole('A', 2, 10),
      ecole('Y', null, 30),
      ecole('B', 1, 10),
      ecole('X', null, 30),
    ])
    assert.deepEqual(
      triees.map(d => d.school.id),
      ['B', 'A', 'X', 'Y', 'Z'],
    )
  })

  it('est stable : deux appels donnent le même ordre', () => {
    const entree = [ecole('B', 2, 10), ecole('A', 1, 10)]
    assert.deepEqual(
      trierParPriorite(entree).map(d => d.school.id),
      trierParPriorite([...entree].reverse()).map(d => d.school.id),
    )
  })
})
