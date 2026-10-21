/**
 * Données factices (MSW) testées sous Node, à travers le vrai client HTTP.
 *
 * Ces tests vérifient que :
 *   - chaque route en lecture du manifeste a une réponse factice ;
 *   - les listes sont filtrées et paginées comme le serveur le fera ;
 *   - le cycle de vie d'une nomination, les quotas et le journal d'audit
 *     évoluent comme le décrit le document des routes ;
 *   - une opération qui demande un vrai calcul est refusée, pas simulée.
 *
 * Ils lisent les fichiers générés par `pnpm --dir moteur-reference fixtures`
 * et sont ignorés tant que ces fichiers n'existent pas.
 */

import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import * as path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { setupServer } from 'msw/node'

import { listerEtablissements } from '../components/donnees/infrastructure/donneesApi'
import { lireSynthese } from '../components/diagnostic/infrastructure/diagnosticApi'
import {
  listerMouvements,
  listerNominations,
  mettreEnOeuvreNomination,
  proposerNomination,
  validerNomination,
} from '../components/nominations/infrastructure/nominationsApi'
import {
  ajusterQuota,
  lireTableauPlanification,
  listerQuotas,
  validerQuotas,
} from '../components/planification/infrastructure/planificationApi'
import { listerEvenementsAudit } from '../components/audit/infrastructure/auditApi'
import { creerScenario, executerScenario } from '../components/simulation/infrastructure/simulationApi'
import { ApiError, FILTRES_VIDES, type AnneePlan, type TableauPlanification } from '../components/shared/api'
import { desactiverConversions } from '../components/shared/api/backend'
import { routesDuManifeste } from '../components/shared/api/manifeste'
import { definirLecture, lireEtatInitial } from '../mocks/catalogue'
import { etat, initialiserEtat } from '../mocks/etat'
import { gestionnaires } from '../mocks/gestionnaires'

/** Données générées (compilé dans .test-build/tests, d'où les deux niveaux). */
const DOSSIER = path.resolve(__dirname, '..', '..', 'public', 'donnees-factices')
const ABSENTES = !existsSync(path.join(DOSSIER, 'index.json'))
const BASE = 'http://algoplanr.test'
const JEU = 'demonstration'
const AGENT = 'Agent de test'

const serveur = setupServer(...gestionnaires)

/** Rejette avec une `ApiError` du statut attendu. */
async function refuse(appel: Promise<unknown>, statut: number): Promise<void> {
  await assert.rejects(appel, (e: unknown) => e instanceof ApiError && e.statut === statut)
}

describe(
  'Données factices',
  { skip: ABSENTES && 'données factices non générées (pnpm --dir moteur-reference fixtures)' },
  () => {
    let retablirConversions: () => void = () => {}
    before(async () => {
      // Les données factices répondent au format du contrat, sans conversion depuis le serveur Django.
      retablirConversions = desactiverConversions()
      process.env.NEXT_PUBLIC_API_URL = BASE
      definirLecture(async fichier => JSON.parse(readFileSync(path.join(DOSSIER, fichier), 'utf8')))
      initialiserEtat(await lireEtatInitial())
      serveur.listen({ onUnhandledRequest: 'error' })
    })
    after(() => {
      serveur.close()
      retablirConversions()
    })

    it('répond à chaque route en lecture du manifeste', async () => {
      const e = etat()
      const valeurs: Record<string, string> = {
        jeu: JEU,
        scenario: 'geo-departement',
        ecole: e.postesOuverts[0].schoolId,
        matricule: e.mouvements[0].personne.matricule ?? '',
        personne: e.vivier[0].id,
        poste: e.postesOuverts[0].id,
        nomination: e.nominations[0].id,
        mouvement: e.mouvements[0].id,
        evenement: e.audit[0].id,
        version: '1',
        actualisation: 'aucune',
        identifiant: 'drh',
      }
      // Aucune actualisation dans le jeu de démonstration : ses écarts n'existent pas. L'encadrement, le
      // turnover après l'algorithme, le degré d'aléa et la synthèse territoriale (lot 4) demandent le moteur :
      // les données factices le disent au lieu de l'inventer.
      const sansDonnees = new Set([
        'jeux/{jeu}/planification/alea/',
        'jeux/{jeu}/faits-prince/application/',
        'jeux/{jeu}/faits-prince/bases/{base}/',
        'jeux/{jeu}/actualisations/{actualisation}/ecarts/',
        'jeux/{jeu}/scenarios/{scenario}/encadrement/',
        'jeux/{jeu}/rapports/territorial/',
      ])
      const manquantes: string[] = []
      for (const route of routesDuManifeste()) {
        const [methode, gabarit] = route.split(' ')
        if (methode !== 'GET' || sansDonnees.has(gabarit)) continue
        const chemin = gabarit.replace(/\{(\w+)\}/g, (_: string, cle: string) => encodeURIComponent(valeurs[cle]))
        const query = gabarit.endsWith('comparer/')
          ? '?de=1&a=1'
          : gabarit === 'fichiers/colonnes/'
            ? '?type=enseignants'
            : ''
        const reponse = await fetch(`${BASE}/api/v1/${chemin}${query}`)
        if (!reponse.ok) manquantes.push(`${gabarit} (${reponse.status})`)
      }
      assert.deepEqual(manquantes, [])
    })

    it('sert la synthèse nationale et la synthèse d’une région', async () => {
      const nationale = await lireSynthese(JEU, FILTRES_VIDES, null)
      assert.equal(nationale.perimetre, 'Cameroun')
      const region = nationale.besoinsParEnfant[0]?.territoire.nom
      assert.ok(region, 'au moins une région en déficit')
      const regionale = await lireSynthese(
        JEU,
        { ...FILTRES_VIDES, territoire: { region, departement: null, commune: null } },
        'geo-departement',
      )
      assert.ok(regionale.perimetre.includes(region))
      assert.ok(regionale.totals.ecolesAnalysees < nationale.totals.ecolesAnalysees)
    })

    it('pagine et filtre une liste', async () => {
      const tout = await listerEtablissements(JEU, FILTRES_VIDES, { taille: 0 })
      const page = await listerEtablissements(JEU, FILTRES_VIDES, { page: 2, taille: 10 })
      assert.equal(page.total, tout.total)
      assert.equal(page.elements.length, Math.min(10, tout.total - 10))
      assert.deepEqual(page.elements[0], tout.elements[10])

      const region = tout.elements[0].school.region
      const filtree = await listerEtablissements(
        JEU,
        { ...FILTRES_VIDES, territoire: { region, departement: null, commune: null } },
        { taille: 0 },
      )
      assert.ok(filtree.total > 0 && filtree.total < tout.total)
      assert.ok(filtree.elements.every(d => d.school.region === region))
    })

    it('déroule le cycle de vie d’une nomination', async () => {
      const proposees = await listerNominations(JEU, { statut: ['proposee'], taille: 0 })
      const nomination = proposees.elements[0]
      assert.ok(nomination, 'une nomination proposée d’exemple')
      const ref = { jeu: JEU, nomination: nomination.id }

      const validee = await validerNomination(ref, { reference: 'DEC-TEST', auteur: AGENT })
      assert.equal(validee.statut, 'validee')
      assert.equal(validee.poste.statut, 'reserve')
      const prevus = await listerMouvements(JEU, { type: ['nomination'], statut: 'prevu', taille: 0 })
      assert.ok(
        prevus.elements.some(m => m.decision.id === nomination.id),
        'mouvement prévu au registre',
      )

      // Une personne engagée ne peut pas être proposée une seconde fois.
      const autrePoste = etat().postesOuverts.find(p => p.statut === 'libre')
      assert.ok(autrePoste)
      await refuse(
        proposerNomination(JEU, {
          personne: nomination.personne.id,
          poste: autrePoste.id,
          annee: 'N+1',
          motif: 'Doublon',
          auteur: AGENT,
        }),
        409,
      )

      const realisee = await mettreEnOeuvreNomination(ref, {
        dateEffet: '2026-10-01',
        referenceActe: 'ACTE-TEST',
        auteur: AGENT,
      })
      assert.equal(realisee.statut, 'mise_en_oeuvre')
      assert.equal(realisee.poste.statut, 'pourvu')
      const realises = await listerMouvements(JEU, { type: ['nomination'], statut: 'realise', taille: 0 })
      assert.ok(
        realises.elements.some(m => m.decision.id === nomination.id),
        'mouvement réalisé au registre',
      )

      // Une nomination mise en œuvre est définitive.
      await refuse(validerNomination(ref, { reference: 'DEC-BIS', auteur: AGENT }), 409)

      const journal = await listerEvenementsAudit(JEU, { type: ['nomination'], auteur: AGENT, taille: 0 })
      assert.deepEqual(
        journal.elements.map(e => e.action),
        ['mise_en_oeuvre', 'validee'],
        'les deux décisions, de la plus récente à la plus ancienne',
      )
    })

    it('ajuste, valide puis fige un quota', async () => {
      const [quota] = await listerQuotas(JEU, { annee: 'N+2' })
      assert.ok(quota)
      const corps = {
        sousSysteme: quota.sousSysteme,
        retenu: quota.calcule + 1,
        motif: 'Arbitrage budgétaire',
        auteur: AGENT,
      }
      const ajuste = await ajusterQuota(JEU, quota.annee, quota.codeTerritoire, corps)
      assert.equal(ajuste.statut, 'ajuste')
      assert.equal(ajuste.retenu, quota.calcule + 1)

      const valides = await validerQuotas(JEU, { annee: 'N+2', auteur: AGENT })
      assert.ok(valides.every(q => q.statut === 'valide'))
      await refuse(ajusterQuota(JEU, quota.annee, quota.codeTerritoire, corps), 409)
    })

    it('refuse un calcul qu’elles ne savent pas faire', async () => {
      const cree = await creerScenario(JEU, {
        personnalise: { nom: 'Essai', scope: 'departement', parametres: etat().parametres },
      })
      assert.equal(cree.calcule, false)
      await refuse(executerScenario({ jeu: JEU, scenario: cree.scenario.id }), 422)
    })

    it('reporte les décisions dans le tableau de planification', async () => {
      const annee = (tableau: TableauPlanification, a: AnneePlan) => tableau.annees.find(x => x.annee === a)!

      // Une nomination validée compte en « prévue » l'année de la nomination.
      const avant = await lireTableauPlanification(JEU)
      const [proposee] = (await listerNominations(JEU, { statut: ['proposee'], taille: 0 })).elements
      assert.ok(proposee, 'il reste une nomination proposée')
      await validerNomination({ jeu: JEU, nomination: proposee.id }, { reference: 'DEC-SUIVI', auteur: AGENT })
      const apres = await lireTableauPlanification(JEU)
      assert.equal(annee(apres, proposee.annee).nominationsPrevues, annee(avant, proposee.annee).nominationsPrevues + 1)

      // Un quota ajusté devient le quota retenu, réduit le besoin restant et s'ajoute aux effectifs suivants.
      const [quota] = await listerQuotas(JEU, { annee: 'N+4' })
      assert.ok(quota)
      const region = {
        region: quota.territoire,
        sousSysteme: quota.sousSysteme === 'non_renseigne' ? null : quota.sousSysteme,
      }
      const initial = await lireTableauPlanification(JEU, region)
      assert.equal(annee(initial, 'N+4').quotaRetenu, null, 'quota à fixer tant qu’il n’est pas ajusté')
      const retenu = quota.calcule + 2
      await ajusterQuota(JEU, 'N+4', quota.codeTerritoire, {
        sousSysteme: quota.sousSysteme,
        retenu,
        motif: 'Arbitrage budgétaire',
        auteur: AGENT,
      })
      const ajuste = await lireTableauPlanification(JEU, region)
      const n4 = annee(ajuste, 'N+4')
      assert.equal(n4.quotaRetenu, retenu)
      assert.equal(n4.besoinRestant, Math.max(0, n4.besoin - n4.ressourcesVivier - retenu))
      assert.equal(annee(ajuste, 'N+5').effectifDebut, annee(initial, 'N+5').effectifDebut + 2)
    })
  },
)
