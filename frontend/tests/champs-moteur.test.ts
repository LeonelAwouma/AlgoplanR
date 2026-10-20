/**
 * Page « Configuration du moteur » : aucun champ inerte, et le motif de demande ne bonifie rien.
 *
 * Un réglage affiché mais ignoré par le calcul laisse croire qu'il agit. Chaque champ éditable listé dans
 * `champsMoteur.ts` doit donc modifier la configuration transmise au serveur.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CHEMINS_MOTEUR_EDITABLES } from '../components/parametrage/domain/champsMoteur'
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
    for (const cle of ['elevesParMaitre', 'toleranceArrondi', 'niveauxParMaitre', 'ageRetraite']) {
      assert.ok(transmis(['besoin', cle]), `besoin.${cle} doit être transmis`)
    }
    const config = versConfigDjango({ besoin: { ...reglages.besoin, doubleFluxAutorise: false } })
    assert.equal(config.besoin?.double_flux_autorise, false)
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
