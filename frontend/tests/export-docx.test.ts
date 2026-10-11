/**
 * Export Word du rapport décisionnel.
 *
 * Le document est produit à partir du même objet que la page affiche. Ces tests
 * vérifient qu'il est bien formé et qu'il contient réellement le contenu du
 * rapport — titres de sections, tableaux et mentions obligatoires.
 *
 * Le rapport testé est celui que le serveur de référence produit pour le jeu de
 * démonstration (tests/donnees/rapport-demonstration.json, régénéré par
 * `pnpm --dir moteur-reference fixtures`).
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { gunzipSync, inflateRawSync } from 'node:zlib'

import { construireRapportDocx } from '../components/rapports/application/exports/export-docx'
import type { DecisionReport } from '../components/shared/api/contrat'

/** Rapport national du jeu de démonstration (compilé dans .test-build/tests, d'où les deux niveaux). */
function rapportDeTest(): DecisionReport {
  const fichier = path.resolve(__dirname, '..', '..', 'tests', 'donnees', 'rapport-demonstration.json')
  return JSON.parse(readFileSync(fichier, 'utf8')) as DecisionReport
}

/** Extrait `word/document.xml` de l'archive .docx, sans dépendance externe. */
function lireDocumentXml(octets: Buffer): string {
  const nom = Buffer.from('word/document.xml')
  // Entrée locale du ZIP : signature PK\x03\x04, puis méthode et tailles.
  for (let i = 0; i + 30 < octets.length; i++) {
    if (octets.readUInt32LE(i) !== 0x04034b50) continue
    const methode = octets.readUInt16LE(i + 8)
    const tailleCompressee = octets.readUInt32LE(i + 18)
    const tailleNom = octets.readUInt16LE(i + 26)
    const tailleExtra = octets.readUInt16LE(i + 28)
    const debutNom = i + 30
    if (octets.subarray(debutNom, debutNom + tailleNom).equals(nom)) {
      const debut = debutNom + tailleNom + tailleExtra
      const donnees = octets.subarray(debut, debut + tailleCompressee)
      if (methode === 0) return donnees.toString('utf8')
      if (methode === 8) return inflateRawSync(donnees).toString('utf8')
      return gunzipSync(donnees).toString('utf8')
    }
  }
  throw new Error('word/document.xml introuvable dans l’archive')
}

test('L’export produit un fichier Word valide', async () => {
  const blob = await construireRapportDocx({
    rapport: rapportDeTest(),
    scenarioNom: 'Situation actuelle',
    donneesDemonstration: false,
  })
  const octets = Buffer.from(await blob.arrayBuffer())

  assert.ok(octets.length > 5000, 'le document n’est pas vide')
  assert.equal(octets.subarray(0, 2).toString(), 'PK', 'un .docx est une archive ZIP')
})

test('Le document reprend les sections et les tableaux du rapport', async () => {
  const rapport = rapportDeTest()
  const blob = await construireRapportDocx({ rapport, scenarioNom: 'Situation actuelle', donneesDemonstration: false })
  const xml = lireDocumentXml(Buffer.from(await blob.arrayBuffer()))

  for (const section of rapport.sections) {
    // Le XML échappe les apostrophes : on compare sur un fragment sûr du titre.
    const fragment = section.titre.split(/['’]/)[0].trim()
    assert.ok(xml.includes(fragment), `section manquante : ${section.titre}`)
  }

  const nbTableauxAttendus = rapport.sections.filter(s => s.tableau).length
  const nbTableaux = (xml.match(/<w:tbl>/g) ?? []).length
  assert.ok(nbTableaux >= nbTableauxAttendus, `${nbTableaux} tableaux pour ${nbTableauxAttendus} attendus`)
  assert.ok(xml.includes('Cameroun'), 'le périmètre figure sur la page de garde')
})

test('La mention de simulation est toujours présente, celle de démonstration seulement si besoin', async () => {
  const rapport = rapportDeTest()

  const reel = await construireRapportDocx({ rapport, scenarioNom: 'Situation actuelle', donneesDemonstration: false })
  const xmlReel = lireDocumentXml(Buffer.from(await reel.arrayBuffer()))
  assert.ok(/simulation/i.test(xmlReel), 'la mention de simulation est obligatoire')
  assert.ok(
    !/valeurs de ce document sont fictives/i.test(xmlReel),
    'pas de mention de démonstration sur des données réelles',
  )

  const demo = await construireRapportDocx({ rapport, scenarioNom: 'Situation actuelle', donneesDemonstration: true })
  const xmlDemo = lireDocumentXml(Buffer.from(await demo.arrayBuffer()))
  assert.ok(/valeurs de ce document sont fictives/i.test(xmlDemo), 'la mention de démonstration est obligatoire')
})

test('Deux exports du même rapport produisent le même contenu', async () => {
  const rapport = rapportDeTest()
  const lire = async () =>
    lireDocumentXml(
      Buffer.from(
        await (await construireRapportDocx({ rapport, scenarioNom: 'S', donneesDemonstration: false })).arrayBuffer(),
      ),
    )
  assert.equal(await lire(), await lire())
})
