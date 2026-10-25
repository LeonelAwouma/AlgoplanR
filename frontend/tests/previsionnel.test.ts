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
  LIBELLE_NATURE,
  ORDRE_SCENARIOS,
  controlesAuditRetraites,
  entetesExport,
  libelleNatures,
  ligne,
  lignesAuditRetraites,
  lignesContexte,
  lignesExport,
  lignesFiabilite,
  lignesScenarios,
  natureCase,
  pointsEnseignants,
  pointsRecrutements,
  pointsRem,
  raisonsIndisponibles,
  renvoi,
  syntheseDecideur,
  valeur,
} from '../components/planification/domain/previsionnel'
import { camelProfond } from '../components/shared/api/backend/routes/planification'
import type { PrevisionnelComplet } from '../components/shared/api/contrat'
import { AVERTISSEMENT_PERSONNELS, MESSAGE_MULTIGRADES_NON_RENSEIGNES } from '../components/shared/kernel/libelles'

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
    // La base est l'année du jeu ; N+1 est l'année scolaire suivante, puis chronologiquement jusqu'à N+5.
    assert.equal(p.annees[0], `Base (${p.anneeBase})`)
    const debut = Number(p.anneeScolairePlan?.slice(0, 4))
    assert.equal(p.anneeBase, p.anneeScolairePlan)
    assert.equal(p.contexte?.anneeScolaire, p.anneeBase)
    p.annees.slice(1).forEach((a, k) => assert.equal(a, `N+${k + 1} (${debut + 1 + k}-${debut + 2 + k})`))
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

  it('produit les feuilles du classeur', () => {
    const p = prevision()
    const feuilles = feuillesPrevisionnel(p)
    assert.deepEqual(
      feuilles.map(f => f.nom),
      [
        'Contexte',
        'Tableau complet',
        'Nature des valeurs',
        'Scénarios',
        'Audit des retraites',
        'Hypothèses',
        'Données non disponibles',
        'Minimum pédagogique',
        'Avertissements',
      ],
    )
    const nd = feuille(p, 'Données non disponibles')
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
    assert.ok(xml.includes('Données non disponibles'))
  })

  it('affiche le message du mode « non renseigné » quand des écoles sont provisoires', async () => {
    const p = {
      ...prevision(),
      ecolesMinimumProvisoire: 3,
      messageMinimumProvisoire: MESSAGE_MULTIGRADES_NON_RENSEIGNES,
    }
    const xml = documentXml(await Packer.toBuffer(documentPrevisionnel(p)))
    assert.ok(xml.includes('Le nombre de classes multigrades n'))
    assert.ok(feuille(p, 'Avertissements').lignes.some(l => l[1] === MESSAGE_MULTIGRADES_NON_RENSEIGNES))
  })
})

describe('Provenance, natures et audit des retraites', () => {
  it('affiche le jeu, l’année, le périmètre réel et la date de calcul', async () => {
    const p = prevision()
    const c = p.contexte
    assert.ok(c)
    const lignes = new Map(lignesContexte(p))
    assert.equal(lignes.get('Année scolaire des données (base)'), p.anneeBase)
    assert.equal(lignes.get('Écoles du périmètre'), p.ecoles)
    assert.ok(String(lignes.get('Origine du jeu')).includes('démonstration'))
    assert.ok(feuille(p, 'Contexte').lignes.some(l => l[0] === 'Jeu de données' && l[1] === c.jeuNom))
    const xml = documentXml(await Packer.toBuffer(documentPrevisionnel(p)))
    assert.ok(xml.includes('Provenance et périmètre'))
    assert.ok(xml.includes(`données de l’année scolaire ${c.anneeScolaire}`))
  })

  it('ne qualifie jamais une valeur future d’observée, ni à l’écran ni dans les exports', () => {
    const p = prevision()
    const natures = feuille(p, 'Nature des valeurs')
    const actes = new Set([
      'Quota retenu (décision administrative)',
      'Recrutements réalisés (nominations mises en œuvre)',
    ])
    for (const l of natures.lignes) {
      if (actes.has(String(l[1]))) continue
      assert.ok(!l.slice(3).includes('Observé'), String(l[1]))
    }
    const eleves = ligne(p, 'eleves')
    assert.ok(eleves)
    assert.equal(natureCase(eleves, 0), 'observe')
    assert.equal(natureCase(eleves, 3), 'projete')
    assert.equal(LIBELLE_NATURE[natureCase(eleves, 3)], 'Projeté')
    assert.ok(libelleNatures(p, eleves).startsWith('Observé (Base) ; Projeté (N+1 à N+5)'))
  })

  it('reprend l’audit des retraites du serveur, sans recalcul', () => {
    const p = prevision()
    const a = p.auditRetraites
    assert.ok(a)
    const lignes = lignesAuditRetraites(p)
    assert.deepEqual(
      lignes.map(l => l[1]),
      ligne(p, 'departs_retraite')?.valeurs.slice(1),
    )
    assert.deepEqual(
      lignes.map(l => l[0]),
      p.annees.slice(1),
    )
    assert.ok(controlesAuditRetraites(p).some(([c]) => c.includes('sans âge')))
    assert.ok(feuille(p, 'Audit des retraites').lignes.length >= 5)
    assert.ok(!a.methode.includes('1,08 % est') && a.methode.includes('Nominative'))
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

/** Une feuille du classeur par son nom. */
function feuille(p: PrevisionnelComplet, nom: string) {
  const f = feuillesPrevisionnel(p).find(x => x.nom === nom)
  assert.ok(f, nom)
  return f
}

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

/** Le prévisionnel avec un REM non disponible en N+2 et N+3, comme le serveur le sert quand des effectifs manquent. */
function avecRemIndisponible(): PrevisionnelComplet {
  const p = prevision()
  const raison = "2 école(s) à effectif d'élèves inconnu : …"
  const l = ligne(p, 'rem_reel')
  assert.ok(l)
  l.valeurs[2] = null
  l.valeurs[3] = null
  l.raisons = [null, null, raison, raison, null, null]
  return p
}

describe('Valeurs non disponibles et fiabilité', () => {
  it('donne la raison de chaque valeur non disponible, regroupée par raison', () => {
    const p = avecRemIndisponible()
    const raisons = raisonsIndisponibles(p)
    // Chaque raison n'apparaît qu'une fois, avec toutes les cellules qu'elle explique.
    assert.equal(new Set(raisons.map(r => r.raison)).size, raisons.length)
    const i = raisons.findIndex(r => r.raison.includes('effectif d'))
    assert.ok(i >= 0)
    assert.ok(raisons[i].cellules[0].includes('N+2, N+3'))
    const l = ligne(p, 'rem_reel')
    assert.ok(l)
    assert.equal(renvoi(raisons, l, 2), i + 1)
    assert.equal(renvoi(raisons, l, 1), null)
    // Un quota sans décision est « non disponible », jamais 0 ; la base d'un flux est « sans objet », sans renvoi.
    assert.ok(raisons.some(r => r.raison.startsWith('Aucune décision administrative')))
    const retraites = ligne(p, 'departs_retraite')
    assert.ok(retraites)
    assert.equal(renvoi(raisons, retraites, 0), null)
    assert.equal(natureCase(retraites, 0), 'sans_objet')
  })

  it('reporte les raisons dans le classeur et le document Word', async () => {
    const p = avecRemIndisponible()
    const tableau = feuille(p, 'Tableau complet')
    assert.equal(tableau.entetes.at(-1), 'Raison des valeurs non disponibles')
    const rem = tableau.lignes.find(x => x[1] === ligne(p, 'rem_reel')?.libelle)
    assert.ok(String(rem?.at(-1)).includes('effectif d'))
    const xml = documentXml(await Packer.toBuffer(documentPrevisionnel(p)))
    assert.ok(xml.includes('Valeurs non disponibles'))
    assert.ok(/Non disponible \(\d\)/.test(xml))
  })

  it('compte à part le minimum provisoire et le besoin final incertain', () => {
    const p = prevision()
    const f = p.fiabilite
    assert.ok(f)
    assert.equal(f.besoinProvisoire + f.besoinEstime + f.besoinConfirme, p.ecoles)
    const lignes = lignesFiabilite(p)
    assert.equal(lignes.length, 5)
    assert.ok(lignesMinimumPedagogique(p).some(l => String(l[0]).includes('besoin final')))
  })

  it('signale que les personnels de la cartographie ne sont pas tous chargés de classe', async () => {
    const p = prevision()
    assert.equal(p.avertissementPersonnels, AVERTISSEMENT_PERSONNELS)
    assert.ok(feuille(p, 'Avertissements').lignes.some(l => l[1] === AVERTISSEMENT_PERSONNELS))
    const xml = documentXml(await Packer.toBuffer(documentPrevisionnel(p)))
    assert.ok(xml.includes('Personnels enseignants'))
    const source = readFileSync(
      path.join(RACINE, '..', 'backend', 'domaine', 'planification', 'previsionnel.py'),
      'utf8',
    )
    const affectation = /AVERTISSEMENT_PERSONNELS = \(([^)]*\)[^)]*)\)/.exec(source)?.[1] ?? ''
    const serveur = [...affectation.matchAll(/"([^"]*)"/g)].map(m => m[1]).join('')
    assert.equal(serveur, AVERTISSEMENT_PERSONNELS)
  })
})
