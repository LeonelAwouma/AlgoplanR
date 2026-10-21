/** Export CSV : échappement des séparateurs et neutralisation des formules (injection à l'ouverture dans Excel). */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { versCSV } from '../components/shared/exports/export-csv'

describe('versCSV', () => {
  it('sépare par « ; », met les décimales en virgule et protège les guillemets', () => {
    assert.equal(
      versCSV(
        ['a', 'b'],
        [
          ['x;y', 1.5],
          ['dit "oui"', null],
        ],
      ),
      'a;b\r\n"x;y";"1,5"\r\n"dit ""oui""";',
    )
  })

  it('un texte qui commencerait une formule est neutralisé, pas un nombre négatif', () => {
    const csv = versCSV(['v'], [['=1+1'], ['+33 6'], ['-cmd'], ['@somme'], [-5], ['normal']])
    assert.equal(csv, "v\r\n'=1+1\r\n'+33 6\r\n'-cmd\r\n'@somme\r\n-5\r\nnormal")
  })
})
