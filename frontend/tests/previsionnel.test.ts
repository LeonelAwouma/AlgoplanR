/**
 * Tableau prévisionnel complet (Projection sur 5 ans) : le tableau, les graphiques et les exports lisent les mêmes
 * lignes du serveur ; une valeur absente n'est jamais tracée ni exportée comme 0 ; le message du mode « non
 * renseigné » est le même texte des deux côtés.
 *
 * Le prévisionnel testé est celui que le serveur Django produit pour le jeu de démonstration
 * (tests/donnees/previsionnel-demonstration.json, réponse brute de `planification/previsionnel/`).
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, it } from 'node:test'
import { inflateRawSync } from 'node:zlib'

import { Packer } from 'docx'

import {
  documentPrevisionnel,
  feuillesPrevisionnel,
  lignesMinimumPedagogique,
} from '../components/planification/application/export-previsionnel'
import {
  ORDRE_SCENARIOS,
  entetesExport,
  ligne,
  lignesExport,
  lignesScenarios,
  pointsEnseignants,
  pointsRecrutements,
  pointsRem,
  syntheseDecideur,
  valeur,
} from '../components/planification/domain/previsionnel'
import { camelProfond } from '../components/shared/api/backend/routes/planification'
import type { PrevisionnelComplet } from '../components/shared/api/contrat'
import { MESSAGE_MULTIGRADES_NON_RENSEIGNES } from '../components/shared/kernel/libelles'

const RACINE = path.resolve(__dirname, '..', '..')

function brut(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(RACINE, 'tests', 'donnees', 'previsionnel-demonstration.json'), 'utf8'))
}

/** Le prévisionnel tel que l'interface le reçoit (même conversion que la route). */
const prevision = (): PrevisionnelComplet => camelProfond<PrevisionnelComplet>(brut())

describe('Tableau prévisionnel complet', () => {
  it('garde la base puis cinq années, et cinq groupes A à E', () => {
    const p = prevision()
    assert.equal(p.annees.length, 6)
    assert.equal(p.annees[0], 'Base')
    assert.deepEqual(
      p.groupes.map(g => g.code),
      ['A', 'B', 'C', 'D', 'E'],
    )
    for (const g of p.groupes) for (const l of g.lignes) assert.equal(l.valeurs.length, 6, l.cle)
    assert.equal(p.remReference, 74.4)
  })

  it('conserve les sous-objets du serveur en camelCase', () => {
    const p = prevision()
    assert.equal(typeof p.minimumPedagogique.secours, 'number')
    assert.equal(typeof p.besoinsParStatut.provisoire, 'number')
    assert.ok(p.scenarios.every(s => Array.isArray(s.disponiblesFin) && 'recrutementsTotal' in s))
    assert.ok(p.nonDisponibles.every(d => d.valeur === null && d.sourceManquante.length > 0))
  })

  it('lit la synthèse Décideur dans le tableau, sans recalcul', () => {
    const p = prevision()
    const s = syntheseDecideur(p)
    const retraites = (ligne(p, 'departs_retraite')?.valeurs ?? []).slice(1).reduce<number>((a, v) => a + (v ?? 0), 0)
    assert.equal(s.retraites, retraites)
    assert.equal(s.elevesFin, valeur(p, 'eleves', 5))
    assert.equal(s.remReference, 74.4)
    assert.equal(s.recrutementsBesoin, p.scenarios.find(x => x.scenario === 'besoin')?.recrutementsTotal)
  })

  it('donne aux graphiques les valeurs du tableau, jamais 0 à la place d’une valeur absente', () => {
    const p = prevision()
    const recrutements = pointsRecrutements(p)
    assert.equal(recrutements.length, 5)
    for (const s of ORDRE_SCENARIOS) {
      assert.deepEqual(
        recrutements.map(pt => pt.valeurs[s]),
        ligne(p, `recrutement_${s}`)?.valeurs.slice(1),
      )
    }
    const rem = pointsRem(p)
    assert.ok(rem.every(pt => pt.valeurs.reference === 74.4))
    // Une valeur retirée du tableau disparaît du graphique au lieu de valoir 0.
    const l = ligne(p, 'disponibles_fin')
    assert.ok(l)
    l.valeurs[3] = null
    assert.equal(pointsEnseignants(p)[2].valeurs.disponibles, undefined)
  })

  it('exporte exactement les lignes affichées, dans le même ordre', () => {
    const p = prevision()
    const lignes = lignesExport(p)
    const affichees = p.groupes.flatMap(g => g.lignes)
    assert.equal(lignes.length, affichees.length)
    lignes.forEach((l, i) => {
      assert.equal(l[1], affichees[i].libelle)
      assert.deepEqual(l.slice(2, 8), affichees[i].valeurs)
    })
    assert.deepEqual(entetesExport(p).slice(2, 8), p.annees)
    assert.equal(lignesScenarios(p).length, 4)
  })

  it('produit les cinq feuilles du classeur', () => {
    const p = prevision()
    const feuilles = feuillesPrevisionnel(p)
    assert.deepEqual(
      feuilles.map(f => f.nom),
      ['Tableau complet', 'Scénarios', 'Hypothèses', 'Données non disponibles', 'Minimum pédagogique'],
    )
    const nd = feuilles[3]
    assert.ok(nd.lignes.every(l => l[1] === 'Non disponible'))
    assert.ok(nd.lignes.some(l => String(l[0]).includes('SIGE')))
    assert.equal(lignesMinimumPedagogique(p)[0][1], p.ecoles)
  })

  it('reprend dans le document Word les groupes, les scénarios et les hypothèses', async () => {
    const p = prevision()
    const octets = await Packer.toBuffer(documentPrevisionnel(p))
    const xml = documentXml(octets)
    for (const g of p.groupes) assert.ok(xml.includes(`${g.code}. ${g.titre.split(/['’]/)[0]}`), g.titre)
    assert.ok(xml.includes('Comparaison des scénarios'))
    assert.ok(xml.includes('Non disponible'))
  })

  it('affiche le message du mode « non renseigné » quand des écoles sont provisoires', async () => {
    const p = {
      ...prevision(),
      ecolesMinimumProvisoire: 3,
      messageMinimumProvisoire: MESSAGE_MULTIGRADES_NON_RENSEIGNES,
    }
    const xml = documentXml(await Packer.toBuffer(documentPrevisionnel(p)))
    assert.ok(xml.includes('Le nombre de classes multigrades n'))
    assert.ok(feuillesPrevisionnel(p)[4].lignes.some(l => l[1] === MESSAGE_MULTIGRADES_NON_RENSEIGNES))
  })
})

describe('Message du mode « Classes_Multigrades non renseigné »', () => {
  it('est le même texte que celui du serveur', () => {
    const source = readFileSync(path.join(RACINE, '..', 'backend', 'domaine', 'diagnostic', 'indicateurs.py'), 'utf8')
    // Le texte Python est découpé en plusieurs littéraux concaténés : on les rassemble.
    const affectation = /MESSAGE_MULTIGRADES_NON_RENSEIGNES = \(([^)]*)\)/.exec(source)?.[1] ?? ''
    const serveur = [...affectation.matchAll(/"([^"]*)"/g)].map(m => m[1]).join('')
    assert.equal(serveur, MESSAGE_MULTIGRADES_NON_RENSEIGNES, 'message différent de celui du serveur')
    assert.equal(
      MESSAGE_MULTIGRADES_NON_RENSEIGNES,
      "Le nombre de classes multigrades n'est pas renseigné. Le besoin en enseignants est provisoire et sera recalculé lorsque cette information sera disponible.",
    )
  })
})

/** Extrait `word/document.xml` de l'archive .docx. */
function documentXml(octets: Buffer): string {
  const nom = Buffer.from('word/document.xml')
  for (let i = 0; i + 30 < octets.length; i++) {
    if (octets.readUInt32LE(i) !== 0x04034b50) continue
    const methode = octets.readUInt16LE(i + 8)
    const taille = octets.readUInt32LE(i + 18)
    const tailleNom = octets.readUInt16LE(i + 26)
    const extra = octets.readUInt16LE(i + 28)
    if (octets.subarray(i + 30, i + 30 + tailleNom).equals(nom)) {
      const donnees = octets.subarray(i + 30 + tailleNom + extra, i + 30 + tailleNom + extra + taille)
      return methode === 0 ? donnees.toString('utf8') : inflateRawSync(donnees).toString('utf8')
    }
  }
  throw new Error('word/document.xml introuvable')
}
