/** Indicateurs de suivi : REM et degré d'aléa, avant (bases importées) et après (recalcul de l'algorithme). */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { construireSuiviAvantApres, ecart } from '../components/planification/application/suiviAvantApres'
import type { ComparaisonEncadrement, DegreAlea, LigneAlea } from '../components/shared/api'

const ligneAlea = (region: string, alea: number | null, raison: string | null = null): LigneAlea => ({
  region,
  alea,
  raison,
  ecoles: 10,
  ecolesAvecEleves: 10,
  ecartNational: null,
})

const indicateurs = (territoire: string, remAvant: number, remApres: number) =>
  ({ territoire, remAvant, remApres }) as unknown as ComparaisonEncadrement['national']

const ENCADREMENT = {
  national: indicateurs('National', 52.4, 50.1),
  parRegion: [indicateurs('Nord', 61, 58.5), indicateurs('Centre', 45, 45)],
} as unknown as ComparaisonEncadrement

const ALEA: DegreAlea = {
  perimetre: 'National',
  scenarioId: '1',
  national: ligneAlea('National', 0.31),
  regions: [ligneAlea('Nord', 0.4), ligneAlea('Centre', null, 'Moins de 3 écoles avec un effectif d’élèves connu')],
  avant: {
    national: ligneAlea('National', 0.38),
    regions: [ligneAlea('Nord', 0.52), ligneAlea('Centre', 0.2)],
  },
}

describe('REM et aléa, avant / après', () => {
  it('met côte à côte REM et aléa, avant et après, pour le national puis chaque région', () => {
    const { lignes } = construireSuiviAvantApres(ENCADREMENT, ALEA)
    assert.deepEqual(
      lignes.map(l => l.territoire),
      ['National', 'Centre', 'Nord'],
    )
    const [national, centre, nord] = lignes
    assert.equal(national.national, true)
    assert.deepEqual(
      [national.remAvant, national.remApres, national.aleaAvant, national.aleaApres],
      [52.4, 50.1, 0.38, 0.31],
    )
    assert.deepEqual([nord.remAvant, nord.remApres, nord.aleaAvant, nord.aleaApres], [61, 58.5, 0.52, 0.4])
    assert.equal(centre.aleaAvant, 0.2)
    assert.equal(centre.aleaApres, null, 'aléa après incalculable : pas de valeur inventée')
    assert.match(centre.raisonAleaApres ?? '', /Moins de 3 écoles/)
  })

  it('rapproche les régions malgré la casse et les espaces', () => {
    const encadrement = { ...ENCADREMENT, parRegion: [indicateurs(' nord ', 61, 58.5)] } as ComparaisonEncadrement
    const { lignes } = construireSuiviAvantApres(encadrement, ALEA)
    assert.equal(lignes.filter(l => l.territoire.trim().toLowerCase() === 'nord').length, 1)
    const nord = lignes.find(l => l.remAvant === 61)!
    assert.equal(nord.aleaApres, 0.4)
  })

  it('signale ce qui manque sans le calculer côté interface', () => {
    const sansAvant = construireSuiviAvantApres(ENCADREMENT, { ...ALEA, avant: undefined })
    assert.equal(sansAvant.aleaDisponible, false)
    assert.equal(sansAvant.lignes[0].aleaAvant, null)
    const sansEncadrement = construireSuiviAvantApres(null, ALEA)
    assert.equal(sansEncadrement.remDisponible, false)
    assert.equal(sansEncadrement.lignes[0].remAvant, null)
    assert.equal(sansEncadrement.lignes[0].aleaApres, 0.31)
  })

  it('calcule l’écart après − avant, vide si une valeur manque', () => {
    assert.equal(ecart(0.38, 0.31), -0.07)
    assert.equal(ecart(52.4, 50.1), -2.3)
    assert.equal(ecart(null, 0.3), null)
    assert.equal(ecart(0.3, null), null)
  })
})
