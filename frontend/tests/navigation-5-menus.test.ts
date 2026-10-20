/**
 * Navigation en cinq menus (Données, Tableau de bord, Affectations, Planification, Rapports) et « Paramètres
 * avancés » à part : chaque écran appartient à un seul menu, le parcours s'enchaîne et les accès restent restreints.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  RUBRIQUES,
  etapeSuivante,
  etapesVisibles,
  pageReserveeAuDrh,
  parcoursVisible,
  rubriqueDePage,
  rubriquesVisibles,
  type PageKey,
} from '../components/shared/ui/coquille/navigation'

const TOUT_PRET = { donneesChargees: true, simulationPrete: true }
const RIEN_DE_PRET = { donneesChargees: false, simulationPrete: false }

describe('six menus et paramètres avancés', () => {
  it('le DRH voit six menus dans l’ordre, puis les paramètres avancés', () => {
    const visibles = rubriquesVisibles('simple', 'drh')
    assert.deepEqual(
      visibles.filter(r => !r.avance).map(r => r.label),
      ['Données', 'Tableau de bord', 'Affectations', 'Planification', 'Rapports', 'Comptes et accès'],
    )
    assert.deepEqual(
      visibles.filter(r => r.avance).map(r => r.label),
      ['Paramètres avancés'],
    )
    assert.equal(visibles.at(-1)?.avance, true)
  })

  it('chaque écran appartient à exactement un menu', () => {
    const toutes = RUBRIQUES.flatMap(r => r.etapes.map(e => e.id))
    assert.equal(new Set(toutes).size, toutes.length, 'un écran est listé deux fois')
    for (const page of toutes) assert.equal(rubriqueDePage(page)?.etapes.filter(e => e.id === page).length, 1)
  })

  it('le tableau de bord ouvre le degré d’aléa en onglet de détail', () => {
    const tableau = RUBRIQUES.find(r => r.id === 'accueil')!
    const alea = tableau.etapes.find(e => e.id === 'alea')
    assert.ok(alea?.onglet)
    assert.equal(rubriqueDePage('alea')?.id, 'accueil')
  })

  it('« Comptes et accès » est un menu du DRH, hors du parcours guidé', () => {
    const comptes = RUBRIQUES.find(r => r.id === 'comptes')!
    assert.deepEqual(
      comptes.etapes.map(e => e.id),
      ['acces'],
    )
    assert.ok(!comptes.avance, 'ce n’est pas un paramètre avancé')
    assert.equal(etapesVisibles(comptes, 'simple', 'delegue').length, 0)
    assert.deepEqual(
      rubriquesVisibles('simple', 'delegue').map(r => r.label),
      ['Données', 'Tableau de bord', 'Affectations', 'Planification', 'Rapports', 'Paramètres avancés'],
    )
    assert.equal(etapeSuivante('acces', 'simple', 'drh', TOUT_PRET), undefined)
  })

  it('un délégué ne voit aucune page réservée au DRH', () => {
    for (const mode of ['simple', 'analyste'] as const) {
      for (const rubrique of RUBRIQUES) {
        for (const etape of etapesVisibles(rubrique, mode, 'delegue')) {
          assert.equal(pageReserveeAuDrh(etape.id), false, `${mode} ${etape.id}`)
        }
      }
    }
  })

  it('les paramètres avancés gardent leurs restrictions', () => {
    const avancees = RUBRIQUES.find(r => r.avance)!
    const delegue = etapesVisibles(avancees, 'simple', 'delegue').map(e => e.id)
    assert.deepEqual(delegue, ['methodology', 'audit'])
    const drhSimple = etapesVisibles(avancees, 'simple', 'drh').map(e => e.id)
    assert.ok(drhSimple.includes('settings') && !drhSimple.includes('engine') && !drhSimple.includes('acces'))
    assert.ok(etapesVisibles(avancees, 'analyste', 'drh').some(e => e.id === 'engine'))
  })
})

describe('bouton « Continuer »', () => {
  it('suit le parcours : données, tableau de bord, puis affectations', () => {
    const ordre: PageKey[] = []
    let page: PageKey = 'import'
    for (let i = 0; i < 40; i++) {
      ordre.push(page)
      const suivante = etapeSuivante(page, 'simple', 'drh', TOUT_PRET)
      if (!suivante) break
      page = suivante.etape.id
    }
    assert.deepEqual(ordre.slice(0, 5), ['import', 'prince', 'validation', 'overview', 'diagnostic'])
    assert.equal(ordre.at(-1), 'reports')
  })

  it('passe de la dernière étape d’un menu à la première du suivant', () => {
    assert.equal(etapeSuivante('nominations', 'simple', 'drh', TOUT_PRET)?.etape.id, 'hypotheses')
    assert.equal(etapeSuivante('quotas', 'simple', 'drh', TOUT_PRET)?.etape.id, 'mouvements')
  })

  it('n’existe ni sur un onglet de détail, ni dans les paramètres avancés, ni à la fin', () => {
    assert.equal(etapeSuivante('alea', 'simple', 'drh', TOUT_PRET), undefined)
    assert.equal(etapeSuivante('methodology', 'simple', 'drh', TOUT_PRET), undefined)
    assert.equal(etapeSuivante('reports', 'simple', 'drh', TOUT_PRET), undefined)
  })

  it('signale une étape que le jeu ne permet pas encore d’ouvrir', () => {
    const suivante = etapeSuivante('simulations', 'simple', 'drh', { donneesChargees: true, simulationPrete: false })
    assert.equal(suivante?.etape.id, 'voeux')
    assert.equal(suivante?.accessible, false)
    assert.equal(etapeSuivante('import', 'simple', 'drh', RIEN_DE_PRET)?.accessible, false)
  })

  it('saute les étapes réservées au DRH pour un délégué', () => {
    const delegue = RUBRIQUES.filter(r => !r.avance).flatMap(r => parcoursVisible(r, 'simple', 'delegue'))
    assert.ok(!delegue.some(e => e.id === 'prince'))
    assert.equal(etapeSuivante('import', 'simple', 'delegue', TOUT_PRET)?.etape.id, 'validation')
    assert.equal(etapeSuivante('overview', 'simple', 'delegue', TOUT_PRET)?.etape.id, 'diagnostic')
  })

  it('passe par le Fait de Prince après l’import, sauf s’il n’y a aucune décision', () => {
    assert.equal(etapeSuivante('import', 'simple', 'drh', TOUT_PRET)?.etape.id, 'prince')
    assert.equal(etapeSuivante('import', 'simple', 'drh', TOUT_PRET, ['prince'])?.etape.id, 'validation')
    // L'étape reste ouvrable depuis le parcours, et « Continuer » en repart normalement.
    assert.equal(etapeSuivante('prince', 'simple', 'drh', TOUT_PRET, ['prince'])?.etape.id, 'validation')
  })
})
