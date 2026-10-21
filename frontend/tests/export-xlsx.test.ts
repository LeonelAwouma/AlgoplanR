/**
 * Export Excel : le classeur produit est relu avec exceljs pour vérifier la mise en forme promise
 * (en-têtes en gras, première ligne figée, filtre, formats de nombre, noms de feuilles valides).
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { construireClasseur, formatDeduit, nomDeFeuille } from '../components/shared/exports/export-xlsx'

test('Les noms de feuilles sont nettoyés, tronqués à 31 caractères et uniques', () => {
  assert.equal(nomDeFeuille('Départs [2026]: liste/complète?', new Set()), 'Départs  2026   liste complète')
  const long = 'A'.repeat(40)
  assert.equal(nomDeFeuille(long, new Set()).length, 31)
  const deja = new Set([long.slice(0, 31).toLowerCase()])
  const autre = nomDeFeuille(long, deja)
  assert.equal(autre.length, 31)
  assert.ok(autre.endsWith('(2)'))
  assert.equal(nomDeFeuille('   ', new Set()), 'Feuille')
})

test('Le format d’une colonne est déduit de son contenu', () => {
  assert.equal(formatDeduit([1, 2, null, 3]), 'entier')
  assert.equal(formatDeduit([1, 2.5]), 'decimal')
  assert.equal(formatDeduit([1, 'MAT001']), 'texte')
  assert.equal(formatDeduit([null, '']), 'texte')
})

test('Le classeur a des en-têtes en gras, une ligne figée, un filtre et des formats de nombre', async () => {
  const classeur = await construireClasseur([
    {
      nom: 'Affectations',
      entetes: ['Matricule', 'Barème', 'Taux', 'Affecté'],
      lignes: [
        ['MAT001', 22.75, 0.1234, true],
        ['MAT002', 18, 0.5, false],
      ],
      formats: [undefined, 'decimal', 'pourcentage', undefined],
    },
  ])
  const feuille = classeur.getWorksheet('Affectations')
  assert.ok(feuille)
  assert.equal(feuille.getCell('A1').font?.bold, true)
  assert.equal(feuille.views[0]?.state, 'frozen')
  assert.equal(feuille.views[0]?.ySplit, 1)
  assert.deepEqual(feuille.autoFilter, { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } })
  assert.equal(feuille.getCell('B2').value, 22.75)
  assert.equal(feuille.getColumn(2).numFmt, '#,##0.00')
  assert.equal(feuille.getColumn(3).numFmt, '0.0%')
  assert.equal(feuille.getCell('D2').value, 'Oui')
  assert.ok((feuille.getColumn(1).width ?? 0) >= 8)
})

test('Le classeur s’écrit en xlsx (signature ZIP)', async () => {
  const classeur = await construireClasseur([{ nom: 'Vide', entetes: ['A'], lignes: [] }])
  const octets = new Uint8Array((await classeur.xlsx.writeBuffer()) as ArrayBuffer)
  assert.equal(String.fromCharCode(octets[0], octets[1]), 'PK')
})
