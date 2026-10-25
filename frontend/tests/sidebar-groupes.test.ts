/**
 * Barre latérale : deux groupes de menus, sous-menus dépliables, menu de la page active ouvert, navigation au
 * clavier, et vues Décideur / Analyste ouvertes aux deux rôles sans changer les accès.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  GROUPES_SIDEBAR,
  RUBRIQUES,
  estDepliable,
  etapeSuivante,
  etapesVisibles,
  groupesVisibles,
  indexApresTouche,
  menusOuverts,
  pageReserveeAuDrh,
  rubriqueDePage,
  sousMenu,
  type RoleAcces,
  type ViewMode,
} from '../components/shared/ui/coquille/navigation'

const MODES: ViewMode[] = ['simple', 'analyste']
const ROLES: RoleAcces[] = ['drh', 'delegue']
const rub = (id: string) => RUBRIQUES.find(r => r.id === id)!
const labels = (mode: ViewMode, role: RoleAcces) =>
  groupesVisibles(mode, role).map(g => [g.groupe.label, g.rubriques.map(r => r.label)] as const)

describe('groupes de la barre latérale', () => {
  it('le DRH voit « Pilotage et opérations » puis « Administration », dans l’ordre demandé', () => {
    assert.deepEqual(labels('simple', 'drh'), [
      ['Pilotage et opérations', ['Tableau de bord', 'Données', 'Affectations', 'Planification', 'Rapports']],
      ['Administration', ['Comptes et accès', 'Paramètres avancés']],
    ])
  })

  it('le délégué ne voit pas « Comptes et accès », réservé au DRH', () => {
    assert.deepEqual(labels('simple', 'delegue')[1], ['Administration', ['Paramètres avancés']])
    assert.deepEqual(labels('analyste', 'delegue')[1], ['Administration', ['Paramètres avancés']])
  })

  it('chaque menu figure dans un seul groupe, et aucun menu n’est perdu', () => {
    const dansGroupes = GROUPES_SIDEBAR.flatMap(g => g.rubriques)
    assert.equal(new Set(dansGroupes).size, dansGroupes.length)
    assert.deepEqual([...dansGroupes].sort(), RUBRIQUES.map(r => r.id).sort())
  })

  it('aucun écran n’est supprimé : tous restent atteignables par un menu', () => {
    const atteignables = new Set(
      RUBRIQUES.flatMap(r => MODES.flatMap(m => ROLES.flatMap(ro => etapesVisibles(r, m, ro)))).map(e => e.id),
    )
    const tous = RUBRIQUES.flatMap(r => r.etapes.map(e => e.id))
    assert.deepEqual(
      tous.filter(id => !atteignables.has(id)),
      [],
    )
  })
})

describe('sous-menus dépliables', () => {
  it('Planification : hypothèses, projection sur 5 ans, quotas', () => {
    assert.deepEqual(
      sousMenu(rub('planification'), 'simple', 'drh').map(e => e.label),
      ['Hypothèses de calcul', 'Projection sur 5 ans', 'Quotas de recrutement'],
    )
  })

  it('Affectations contient besoins recalculés, scénarios, vœux, comparaison, commission et nominations', () => {
    const labelsAffectations = sousMenu(rub('affectations'), 'simple', 'drh').map(e => e.label)
    for (const attendu of [
      'Besoins recalculés',
      'Scénarios',
      'Vœux des enseignants',
      'Comparaison',
      'Commission d’arbitrage',
      'Nominations',
    ]) {
      assert.ok(labelsAffectations.includes(attendu), attendu)
    }
    // Les onglets de détail (analyste) restent dans la barre d’onglets de la page, pas dans la barre latérale.
    assert.ok(!labelsAffectations.includes('Journal de simulation'))
  })

  it('un menu à écran unique est un lien direct, un menu à plusieurs écrans se déplie', () => {
    assert.equal(estDepliable(rub('accueil'), 'simple', 'drh'), false)
    assert.equal(estDepliable(rub('comptes'), 'simple', 'drh'), false)
    assert.deepEqual(
      sousMenu(rub('comptes'), 'simple', 'drh').map(e => e.id),
      ['acces'],
    )
    for (const id of ['donnees', 'affectations', 'planification', 'rapports', 'avancees']) {
      assert.equal(estDepliable(rub(id), 'simple', 'drh'), true, id)
    }
  })

  it('« Fait de Prince » n’est dans le sous-menu Données que pour le DRH', () => {
    assert.ok(sousMenu(rub('donnees'), 'simple', 'drh').some(e => e.id === 'prince'))
    for (const mode of MODES) {
      assert.ok(!sousMenu(rub('donnees'), mode, 'delegue').some(e => e.id === 'prince'))
    }
  })

  it('le menu de la page active est ouvert, sans refermer les autres', () => {
    const a = menusOuverts(new Set(), 'quotas')
    assert.deepEqual([...a], ['planification'])
    const b = menusOuverts(a, 'nominations')
    assert.deepEqual([...b].sort(), ['affectations', 'planification'])
    assert.equal(menusOuverts(b, 'voeux'), b, 'déjà ouvert : même ensemble, aucun rendu inutile')
    // Un onglet de détail ouvre aussi le menu qui le contient.
    assert.ok(menusOuverts(new Set(), 'logs').has('affectations'))
    assert.equal(rubriqueDePage('quotas')?.id, 'planification')
  })
})

describe('navigation au clavier', () => {
  it('flèche bas / haut parcourent les entrées en boucle', () => {
    assert.equal(indexApresTouche('ArrowDown', 0, 4), 1)
    assert.equal(indexApresTouche('ArrowDown', 3, 4), 0)
    assert.equal(indexApresTouche('ArrowUp', 0, 4), 3)
    assert.equal(indexApresTouche('ArrowUp', 2, 4), 1)
  })

  it('Début et Fin vont à la première et à la dernière entrée', () => {
    assert.equal(indexApresTouche('Home', 2, 5), 0)
    assert.equal(indexApresTouche('End', 2, 5), 4)
  })

  it('sans focus dans la liste, la flèche bas ouvre la première entrée et la flèche haut la dernière', () => {
    assert.equal(indexApresTouche('ArrowDown', -1, 3), 0)
    assert.equal(indexApresTouche('ArrowUp', -1, 3), 2)
    assert.equal(indexApresTouche('ArrowDown', 0, 0), -1)
  })
})

describe('modes Décideur et Analyste pour le DRH et le délégué', () => {
  it('les deux rôles disposent des deux modes : le mode ne change que l’affichage, jamais les droits', () => {
    for (const role of ROLES) {
      for (const rubrique of RUBRIQUES) {
        const simple = etapesVisibles(rubrique, 'simple', role).map(e => e.id)
        const analyste = etapesVisibles(rubrique, 'analyste', role).map(e => e.id)
        // L’analyste voit au moins ce que voit le décideur, et rien de plus que ses droits ne permettent.
        for (const id of simple) assert.ok(analyste.includes(id), `${role} ${id}`)
        for (const id of analyste) {
          if (role === 'delegue') assert.equal(pageReserveeAuDrh(id), false, `${role} ${id}`)
        }
      }
    }
  })

  it('le délégué reçoit en Vue analyste les écrans détaillés qu’il avait déjà le droit de consulter', () => {
    const analyste = RUBRIQUES.flatMap(r => etapesVisibles(r, 'analyste', 'delegue')).map(e => e.id)
    for (const id of ['data', 'pool', 'posts', 'assignments', 'unassigned', 'logs'] as const) {
      assert.ok(analyste.includes(id), id)
    }
  })

  it('le parcours guidé d’un délégué ne propose jamais « Fait de Prince »', () => {
    for (const mode of MODES) {
      const etat = { donneesChargees: true, simulationPrete: true }
      assert.notEqual(etapeSuivante('import', mode, 'delegue', etat)?.etape.id, 'prince')
      assert.equal(etapeSuivante('import', mode, 'drh', etat)?.etape.id, 'prince')
    }
  })
})
