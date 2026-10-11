/**
 * Couverture des routes : les fonctions d'infrastructure de tous les contextes
 * doivent déclarer exactement les routes du manifeste (documents de
 * conception), ni plus ni moins. Vérifie aussi, sur des exemples, que les
 * fonctions appellent bien leur route avec les bons paramètres.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import '../components/arbitrage/infrastructure/arbitrageApi'
import '../components/audit/infrastructure/auditApi'
import '../components/diagnostic/infrastructure/diagnosticApi'
import '../components/donnees/infrastructure/donneesApi'
import '../components/nominations/infrastructure/nominationsApi'
import '../components/parametrage/infrastructure/parametrageApi'
import '../components/planification/infrastructure/planificationApi'
import '../components/prince/infrastructure/princeApi'
import '../components/rapports/infrastructure/rapportsApi'
import '../components/recrutement/infrastructure/recrutementApi'
import '../components/simulation/infrastructure/simulationApi'
import '../components/shared/api/systeme'

import { lireDiagnostic } from '../components/diagnostic/infrastructure/diagnosticApi'
import { mettreEnOeuvreNomination } from '../components/nominations/infrastructure/nominationsApi'
import { ajusterQuota } from '../components/planification/infrastructure/planificationApi'
import { lireFlux } from '../components/simulation/infrastructure/simulationApi'
import { remplacerTransport, type RequeteApi } from '../components/shared/api/client'
import { FILTRES_VIDES } from '../components/shared/api/contrat/commun'
import { famillesInvalidees } from '../components/shared/api/invalidations'
import { routesDuManifeste } from '../components/shared/api/manifeste'
import { routesDeclarees } from '../components/shared/api/routes'

/** Transport qui enregistre les requêtes au lieu de les envoyer. */
function enregistrer(): { requetes: RequeteApi[]; retablir: () => void } {
  const requetes: RequeteApi[] = []
  const retablir = remplacerTransport(async requete => {
    requetes.push(requete)
    return {}
  })
  return { requetes, retablir }
}

let retablirTransport: (() => void) | null = null
afterEach(() => {
  retablirTransport?.()
  retablirTransport = null
})

describe('couverture des routes', () => {
  const declarees = routesDeclarees().map(r => `${r.methode} ${r.gabarit}`)
  const manifeste = routesDuManifeste()

  it('ne déclare aucune route deux fois', () => {
    const doublons = declarees.filter((r, i) => declarees.indexOf(r) !== i)
    assert.deepEqual(doublons, [])
  })

  it('déclare toutes les routes du manifeste', () => {
    const manquantes = manifeste.filter(r => !declarees.includes(r))
    assert.deepEqual(manquantes, [], `Routes du manifeste sans fonction d'appel :\n${manquantes.join('\n')}`)
  })

  it('ne déclare aucune route absente du manifeste', () => {
    const inconnues = declarees.filter(r => !manifeste.includes(r))
    assert.deepEqual(inconnues, [], `Routes hors manifeste :\n${inconnues.join('\n')}`)
  })
})

describe('appels des fonctions d’infrastructure', () => {
  it('transmet les filtres du diagnostic en paramètres de requête', async () => {
    const { requetes, retablir } = enregistrer()
    retablirTransport = retablir
    await lireDiagnostic(
      '7',
      { ...FILTRES_VIDES, territoire: { region: 'Centre', departement: null, commune: null }, zones: ['rurale'] },
      true,
    )
    assert.equal(requetes[0].chemin, 'jeux/7/diagnostic/')
    assert.equal(requetes[0].query.region, 'Centre')
    assert.deepEqual(requetes[0].query.zone, ['rurale'])
    assert.equal(requetes[0].query.sansPrince, true)
  })

  it('restreint les flux au territoire sélectionné', async () => {
    const { requetes, retablir } = enregistrer()
    retablirTransport = retablir
    await lireFlux(
      { jeu: '7', scenario: 'geo-departement' },
      { region: 'Est', departement: 'Lom-et-Djérem', commune: null },
    )
    assert.equal(requetes[0].chemin, 'jeux/7/scenarios/geo-departement/flux/')
    assert.equal(requetes[0].query.departement, 'Lom-et-Djérem')
  })

  it('envoie la mise en œuvre d’une nomination avec son acte', async () => {
    const { requetes, retablir } = enregistrer()
    retablirTransport = retablir
    await mettreEnOeuvreNomination(
      { jeu: '7', nomination: 'n-42' },
      { dateEffet: '2026-10-01', referenceActe: 'Arrêté 118', auteur: 'Agent DRH' },
    )
    assert.equal(requetes[0].methode, 'POST')
    assert.equal(requetes[0].chemin, 'jeux/7/nominations/n-42/mettre-en-oeuvre/')
    assert.deepEqual(requetes[0].corps, { dateEffet: '2026-10-01', referenceActe: 'Arrêté 118', auteur: 'Agent DRH' })
  })

  it('encode le code territorial d’un quota, qui contient des barres obliques', async () => {
    const { requetes, retablir } = enregistrer()
    retablirTransport = retablir
    await ajusterQuota('7', 'N+2', 'Centre/Mfoundi', {
      sousSysteme: 'francophone',
      retenu: 12,
      motif: 'Arbitrage budgétaire',
      auteur: 'DRH',
    })
    assert.equal(requetes[0].chemin, 'jeux/7/quotas/N%2B2/Centre%2FMfoundi/')
  })
})

describe('invalidations après une écriture', () => {
  it('vide tout le jeu après un import ou une actualisation', () => {
    assert.equal(famillesInvalidees('donnees'), 'tout')
  })

  it('invalide toujours le journal d’audit', () => {
    for (const nature of ['parametres', 'hypotheses', 'effectifs', 'scenarios', 'quotas', 'nominations'] as const) {
      const familles = famillesInvalidees(nature)
      assert.ok(familles !== 'tout' && familles.includes('audit'), nature)
    }
  })

  it('rafraîchit diagnostic, planification et vivier après une décision qui change les effectifs', () => {
    const familles = famillesInvalidees('effectifs')
    assert.ok(familles !== 'tout')
    for (const f of ['diagnostic', 'scenarios', 'planification', 'quotas', 'vivier', 'mouvements'] as const) {
      assert.ok(familles.includes(f), f)
    }
  })
})
