/**
 * Contrôle d'accès : le DRH administre, un délégué régional n'entre qu'avec son
 * code, pour sa région, et seulement après validation de son entrée par le DRH.
 *
 * Le périmètre de données d'un délégué est testé avec le moteur de référence
 * (moteur-reference/tests/perimetre.test.ts) : c'est au serveur de l'imposer.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  DUREE_BLOCAGE_MS,
  ESSAIS_AVANT_BLOCAGE,
  REGISTRE_VIDE,
  attribuerCode,
  blocageRestantMs,
  codeActif,
  deciderEntree,
  demanderEntree,
  demandesEnAttente,
  estRegistre,
  genererCode,
  initialiserDrh,
  normaliserCode,
  retirerAcces,
  verifierDrh,
} from '../components/acces/domain/registre'

const T0 = new Date(Date.UTC(2026, 8, 30, 8, 0, 0))

// --- DRH -------------------------------------------------------------------------

test('Le DRH choisit son mot de passe à la première utilisation, une seule fois', async () => {
  await assert.rejects(initialiserDrh(REGISTRE_VIDE, 'court'), /au moins 8/)

  const registre = await initialiserDrh(REGISTRE_VIDE, 'Yaounde-2026!')
  assert.ok(await verifierDrh(registre, 'Yaounde-2026!'))
  assert.ok(!(await verifierDrh(registre, 'yaounde-2026!')), 'le mot de passe est sensible à la casse')
  assert.ok(!(await verifierDrh(REGISTRE_VIDE, 'Yaounde-2026!')), 'aucun accès tant que le compte n’existe pas')

  await assert.rejects(
    initialiserDrh(registre, 'AutreMotDePasse'),
    /existe déjà/,
    'un second DRH ne peut pas s’installer par-dessus',
  )
})

test('Aucun secret n’est conservé en clair', async () => {
  let registre = await initialiserDrh(REGISTRE_VIDE, 'Yaounde-2026!')
  const attribution = await attribuerCode(registre, 'Centre', 'Mme Abena', T0)
  registre = attribution.registre

  const contenu = JSON.stringify(registre)
  assert.ok(!contenu.includes('Yaounde-2026!'))
  assert.ok(!contenu.includes(attribution.codeEnClair))
  assert.ok(!contenu.includes(normaliserCode(attribution.codeEnClair)))
})

// --- Codes -------------------------------------------------------------------------

test('Un code se dicte et se saisit sans piège', () => {
  const code = genererCode()
  assert.match(code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/, 'huit caractères, sans 0/O ni 1/I/L')
  assert.equal(normaliserCode(' k7mq x2pd '), 'K7MQX2PD')
  assert.equal(normaliserCode('K7MQ-X2PD'), 'K7MQX2PD')
})

test('Un seul code actif par région : le nouveau remplace l’ancien et ses entrées', async () => {
  const premier = await attribuerCode(REGISTRE_VIDE, 'Est', 'M. Bello', T0)
  let registre = (await demanderEntree(premier.registre, 'Est', premier.codeEnClair, T0)).registre
  registre = deciderEntree(registre, registre.demandes[0].id, 'validee', T0)

  const second = await attribuerCode(registre, 'Est', 'Mme Fouda', T0)
  assert.equal(codeActif(second.registre, 'Est')?.titulaire, 'Mme Fouda')
  assert.equal(second.registre.demandes.length, 0, 'l’entrée validée de l’ancien délégué disparaît')

  const ancien = await demanderEntree(second.registre, 'Est', premier.codeEnClair, T0)
  assert.equal(ancien.resultat.type, 'refus', 'l’ancien code ne vaut plus rien')

  await assert.rejects(attribuerCode(REGISTRE_VIDE, 'Est', '   ', T0), /nom du délégué/)
})

// --- Entrée d'un délégué --------------------------------------------------------------

test('Un code exact ne suffit pas : l’entrée reste en attente jusqu’à la validation du DRH', async () => {
  const { registre: r0, codeEnClair } = await attribuerCode(REGISTRE_VIDE, 'Littoral', 'M. Lobe', T0)

  const premiere = await demanderEntree(r0, 'Littoral', codeEnClair, T0)
  assert.equal(premiere.resultat.type, 'attente')
  assert.equal(demandesEnAttente(premiere.registre).length, 1)

  // Tant que le DRH n'a rien décidé, revenir avec le bon code ne change rien.
  const retour = await demanderEntree(premiere.registre, 'Littoral', codeEnClair, T0)
  assert.equal(retour.resultat.type, 'attente')
  assert.equal(retour.registre.demandes.length, 1, 'aucune demande en double')

  const valide = deciderEntree(retour.registre, retour.registre.demandes[0].id, 'validee', T0)
  const entree = await demanderEntree(valide, 'Littoral', codeEnClair, T0)
  assert.equal(entree.resultat.type, 'validee')
  assert.equal(demandesEnAttente(valide).length, 0)
})

test('Le DRH peut refuser, puis revenir sur sa décision', async () => {
  const { registre: r0, codeEnClair } = await attribuerCode(REGISTRE_VIDE, 'Nord', 'M. Hamadou', T0)
  const r1 = (await demanderEntree(r0, 'Nord', codeEnClair, T0)).registre
  const id = r1.demandes[0].id

  const refuse = deciderEntree(r1, id, 'refusee', T0)
  assert.equal((await demanderEntree(refuse, 'Nord', codeEnClair, T0)).resultat.type, 'refusee')

  const retabli = deciderEntree(refuse, id, 'validee', T0)
  assert.equal((await demanderEntree(retabli, 'Nord', codeEnClair, T0)).resultat.type, 'validee')

  assert.throws(() => deciderEntree(r1, 'inconnue', 'validee', T0), /introuvable/)
})

test('Le code d’une région n’ouvre pas une autre région', async () => {
  const { registre, codeEnClair } = await attribuerCode(REGISTRE_VIDE, 'Ouest', 'Mme Kamdem', T0)
  const ailleurs = await demanderEntree(registre, 'Sud', codeEnClair, T0)
  assert.equal(ailleurs.resultat.type, 'refus')
  assert.equal(ailleurs.registre.demandes.length, 0)
})

test('Le message de refus ne dit pas si c’est la région ou le code qui est faux', async () => {
  const { registre } = await attribuerCode(REGISTRE_VIDE, 'Ouest', 'Mme Kamdem', T0)
  const mauvaisCode = await demanderEntree(registre, 'Ouest', 'AAAA-AAAA', T0)
  const sansCode = await demanderEntree(registre, 'Sud', 'AAAA-AAAA', T0)
  assert.equal(mauvaisCode.resultat.type, 'refus')
  assert.deepEqual(mauvaisCode.resultat, sansCode.resultat)
})

test('Retirer l’accès d’une région ferme la porte immédiatement', async () => {
  const { registre: r0, codeEnClair } = await attribuerCode(REGISTRE_VIDE, 'Adamaoua', 'M. Sadjo', T0)
  let registre = (await demanderEntree(r0, 'Adamaoua', codeEnClair, T0)).registre
  registre = deciderEntree(registre, registre.demandes[0].id, 'validee', T0)

  const retire = retirerAcces(registre, 'Adamaoua', T0)
  assert.equal(codeActif(retire, 'Adamaoua'), null)
  assert.equal((await demanderEntree(retire, 'Adamaoua', codeEnClair, T0)).resultat.type, 'refus')
})

test('Après cinq essais infructueux, la région est bloquée cinq minutes', async () => {
  const { registre: r0, codeEnClair } = await attribuerCode(REGISTRE_VIDE, 'Sud', 'M. Onana', T0)
  let registre = r0
  for (let i = 0; i < ESSAIS_AVANT_BLOCAGE; i++) {
    registre = (await demanderEntree(registre, 'Sud', 'ZZZZ-ZZZZ', T0)).registre
  }
  assert.ok(blocageRestantMs(registre, 'Sud', T0) > 0)

  const pendant = await demanderEntree(registre, 'Sud', codeEnClair, T0)
  assert.equal(pendant.resultat.type, 'refus', 'même le bon code est refusé pendant le blocage')
  assert.match(pendant.resultat.type === 'refus' ? pendant.resultat.motif : '', /Réessayez dans 5 minutes/)

  const apres = new Date(T0.getTime() + DUREE_BLOCAGE_MS + 1000)
  assert.equal(blocageRestantMs(registre, 'Sud', apres), 0)
  assert.equal((await demanderEntree(registre, 'Sud', codeEnClair, apres)).resultat.type, 'attente')
  assert.equal(blocageRestantMs(registre, 'Centre', T0), 0, 'les autres régions ne sont pas touchées')
})

test('Un fichier de registre abîmé est reconnu comme tel', () => {
  assert.ok(estRegistre(REGISTRE_VIDE))
  assert.ok(!estRegistre(null))
  assert.ok(!estRegistre({ version: 2, codes: [], demandes: [], echecs: {} }))
  assert.ok(!estRegistre({ version: 1, codes: 'x', demandes: [], echecs: {} }))
})
