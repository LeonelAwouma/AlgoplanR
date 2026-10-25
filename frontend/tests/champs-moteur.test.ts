/**
 * Page « Configuration du moteur » : aucun champ inerte, et le motif de demande ne bonifie rien.
 *
 * Un réglage affiché mais ignoré par le calcul laisse croire qu'il agit. Chaque champ éditable listé dans
 * `champsMoteur.ts` doit donc modifier la configuration transmise au serveur.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CHEMINS_MOTEUR_EDITABLES, SITUATIONS_REGLABLES } from '../components/parametrage/domain/champsMoteur'
import { versCandidatures } from '../components/shared/api/backend/conversions/simulation'
import { versConfigDjango, versEngineSettings } from '../components/shared/api/backend/conversions/parametres'
import { CONFIG } from './config-serveur'

type Objet = Record<string, unknown>

/** Copie des réglages dont la valeur au `chemin` est décalée. */
function modifier(base: Objet, chemin: readonly string[]): Objet {
  const copie = structuredClone(base)
  let noeud = copie
  for (const cle of chemin.slice(0, -1)) noeud = noeud[cle] as Objet
  const dernier = chemin[chemin.length - 1]
  noeud[dernier] = Number(noeud[dernier]) + 7
  return copie
}

describe('Configuration du moteur', () => {
  const reglages = versEngineSettings(CONFIG)
  const reference = JSON.stringify(versConfigDjango(reglages))
  const transmisAjustement = (cle: string) =>
    JSON.stringify(
      versConfigDjango(modifier(reglages as unknown as Objet, ['scoring', 'ajustements', cle]) as never),
    ) !== reference

  it('chaque champ éditable est transmis au serveur', () => {
    const inertes = CHEMINS_MOTEUR_EDITABLES.filter(
      chemin => JSON.stringify(versConfigDjango(modifier(reglages as unknown as Objet, chemin) as never)) === reference,
    ).map(chemin => chemin.join('.'))
    assert.deepEqual(inertes, [], `champs éditables sans effet sur la configuration du serveur : ${inertes.join(', ')}`)
  })

  it('le test détecte un champ inerte (garde-fou)', () => {
    const inerte = ['scoring', 'pointsParEnfant']
    assert.equal(JSON.stringify(versConfigDjango(modifier(reglages as unknown as Objet, inerte) as never)), reference)
  })

  it('la bonification ciblée est un réglage transmis ; l’ancien modèle S = A + Z + B n’existe plus', () => {
    assert.equal(reglages.scoring.ajustements.bonificationCiblee, 20)
    assert.ok(transmisAjustement('bonificationCiblee'))
    assert.equal(Object.hasOwn(reglages.mobilite, 'classementCandidats'), false)
    assert.equal(Object.hasOwn(reglages.mobilite, 'bonificationMotif'), false)
  })
})

describe('Règles du besoin (Référentiel)', () => {
  const reglages = versEngineSettings(CONFIG)
  const reference = JSON.stringify(versConfigDjango(reglages))
  const transmis = (chemin: string[]) =>
    JSON.stringify(versConfigDjango(modifier(reglages as unknown as Objet, chemin) as never)) !== reference

  it('les réglages lus par le moteur sont transmis', () => {
    for (const cle of [
      'elevesParMaitre',
      'toleranceArrondi',
      'niveauxParMaitre',
      'ageRetraite',
      'plancherPedagogique',
      'groupesSecours',
    ]) {
      assert.ok(transmis(['besoin', cle]), `besoin.${cle} doit être transmis`)
    }
    const config = versConfigDjango({ besoin: { ...reglages.besoin, doubleFluxAutorise: false } })
    assert.equal(config.besoin?.double_flux_autorise, false)
    const prudence = versConfigDjango({
      besoin: { ...reglages.besoin, mobiliserExcedentIncertain: true, groupesDepuisClassesOuvertes: true },
    })
    assert.equal(prudence.besoin?.mobiliser_excedent_incertain, true)
    assert.equal(prudence.besoin?.groupes_depuis_classes_ouvertes, true)
  })

  it('la norme de 74,4 garde sa décimale', () => {
    assert.equal(reglages.besoin.elevesParMaitre, 74.4)
    assert.equal(versConfigDjango(reglages).besoin?.norme_eleves_par_maitre, 74.4)
  })

  it('les réglages que le calcul n’utilise pas ne sont pas transmis (affichés « non appliqué »)', () => {
    for (const cle of ['deduireDepartsConnus', 'enseignantsParClasseRepli']) {
      assert.equal(transmis(['besoin', cle]), false, `besoin.${cle} n'est lu par aucun calcul`)
    }
    assert.equal(transmis(['sourceDesPostes']), false)
  })

  it('les valeurs du serveur sont relues dans les réglages', () => {
    const lus = versEngineSettings({ ...CONFIG, besoin: { ...CONFIG.besoin, norme_eleves_par_maitre: 45 } })
    assert.equal(lus.besoin.elevesParMaitre, 45)
  })
})

describe('Vœux affichés', () => {
  const reglages = versEngineSettings(CONFIG)
  const detail = {
    total: 41.25,
    composantes: { Z1_bareme_individu: 60, Z2_poids_poste_Up: 20, Z3_proximite: 30, Z4_ajustements: 55 },
    ajustements_contextuels: 13.75,
  }
  const lignes = [
    { id_ens: 'M1', rang_voeu: 1, id_etab: 'E1', statut: 'NON_RETENU', motif: '', bareme: 60, detail_score: detail },
    { id_ens: 'M1', rang_voeu: 2, id_etab: 'E2', statut: 'AUCUN_POSTE', motif: '', bareme: 60, detail_score: null },
  ]

  it('reprennent le score d’appariement du serveur, sans bonification ni poids d’examen', () => {
    const [candidature] = versCandidatures(lignes, new Map(), new Map(), new Map(), reglages)
    const [v1, v2] = candidature.voeux
    assert.equal(v1.score, 41.25)
    assert.equal(v1.ajustementsContextuels, 13.75)
    assert.deepEqual(v1.composantes, { bareme: 60, poidsPoste: 20, proximite: 30, ajustements: 55 })
    assert.equal(v2.score, null)
    assert.equal(v2.composantes, null)
    assert.equal('bonification' in v1, false)
    assert.equal('poidsExamen' in v1, false)
  })
})

// --- Audit exhaustif : aucun réglage proposé n'est inerte sans le dire ---------------------------------------------

import { REGLAGES_FIXES } from '../components/parametrage/domain/champsMoteur'

/** Feuilles de l'arbre des réglages : les objets sont parcourus, les tableaux et valeurs simples sont des feuilles. */
function feuilles(noeud: unknown, chemin: string[] = []): string[][] {
  if (noeud !== null && typeof noeud === 'object' && !Array.isArray(noeud)) {
    return Object.entries(noeud as Objet).flatMap(([cle, v]) => feuilles(v, [...chemin, cle]))
  }
  return [chemin]
}

/** Copie dont la feuille au `chemin` est changée, quel que soit son type. */
function changer(base: Objet, chemin: readonly string[]): Objet {
  const copie = structuredClone(base)
  let noeud = copie
  for (const cle of chemin.slice(0, -1)) noeud = noeud[cle] as Objet
  const dernier = chemin[chemin.length - 1]
  const v = noeud[dernier]
  noeud[dernier] =
    typeof v === 'number' ? v + 7 : typeof v === 'boolean' ? !v : Array.isArray(v) ? [] : `${String(v)}-modifie`
  return copie
}

/** Un chemin est couvert par une entrée qui le désigne exactement ou désigne un de ses ancêtres. */
const couvert = (chemin: readonly string[], liste: readonly (readonly string[])[]) =>
  liste.some(c => c.length <= chemin.length && c.every((cle, i) => cle === chemin[i]))

describe('Audit des réglages', () => {
  const reglages = versEngineSettings(CONFIG) as unknown as Objet
  const reference = JSON.stringify(versConfigDjango(reglages as never))
  const transmis = (chemin: string[]) =>
    JSON.stringify(versConfigDjango(changer(reglages, chemin) as never)) !== reference
  const toutes = feuilles(reglages)

  it('chaque réglage est soit transmis au serveur, soit une constante du moteur déclarée', () => {
    const orphelins = toutes.filter(c => !transmis(c) && !couvert(c, REGLAGES_FIXES)).map(c => c.join('.'))
    assert.deepEqual(orphelins, [], `réglages ignorés par le serveur et non déclarés : ${orphelins.join(', ')}`)
  })

  it('aucune constante déclarée n’est en réalité transmise au serveur', () => {
    const faux = toutes.filter(c => transmis(c) && couvert(c, REGLAGES_FIXES)).map(c => c.join('.'))
    assert.deepEqual(faux, [], `déclarés fixes alors que le serveur les lit : ${faux.join(', ')}`)
  })

  it('la liste des constantes ne contient que des réglages qui existent', () => {
    for (const c of REGLAGES_FIXES) {
      assert.ok(
        toutes.some(f => f.length >= c.length && c.every((cle, i) => cle === f[i])),
        `réglage inconnu : ${c.join('.')}`,
      )
    }
  })

  it('les champs éditables de la page « Configuration du moteur » sont tous transmis', () => {
    const inertes = CHEMINS_MOTEUR_EDITABLES.filter(c => !transmis([...c])).map(c => c.join('.'))
    assert.deepEqual(inertes, [])
  })
})

describe('Points par situation matrimoniale', () => {
  it('seules les quatre situations connues du serveur sont réglables, et chacune est transmise', () => {
    assert.deepEqual([...SITUATIONS_REGLABLES].sort(), ['celibataire', 'divorce', 'marie', 'veuf'])
    const reglages = versEngineSettings(CONFIG)
    const reference = JSON.stringify(versConfigDjango(reglages))
    for (const cle of SITUATIONS_REGLABLES) {
      const modifie = structuredClone(reglages) as unknown as Objet
      ;(modifie.scoring as Objet).pointsSituationFamiliale = {
        ...((modifie.scoring as Objet).pointsSituationFamiliale as Objet),
        [cle]: 41,
      }
      assert.notEqual(JSON.stringify(versConfigDjango(modifie as never)), reference, `${cle} doit agir sur le serveur`)
    }
  })

  it('une situation que le serveur ne connaît pas n’est jamais envoyée (« Séparé(e) », « Union libre »)', () => {
    const reglages = versEngineSettings(CONFIG)
    const reference = JSON.stringify(versConfigDjango(reglages))
    const modifie = structuredClone(reglages) as unknown as Objet
    ;(modifie.scoring as Objet).pointsSituationFamiliale = {
      ...((modifie.scoring as Objet).pointsSituationFamiliale as Objet),
      separe: 30,
      concubinage: 30,
    }
    assert.equal(JSON.stringify(versConfigDjango(modifie as never)), reference)
  })
})
