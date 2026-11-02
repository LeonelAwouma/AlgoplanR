/**
 * Méthode unique du minimum pédagogique commun, côté interface : les trois paramètres M, R et T sont lus, validés,
 * transmis au serveur et relus après rechargement ; les classes multigrades ne changent plus le besoin affiché.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { versDiagnostic, type EcoleDjango } from '../components/shared/api/backend/conversions/ecoles'
import { versConfigDjango, versEngineSettings } from '../components/shared/api/backend/conversions/parametres'
import { MESSAGE_EFFECTIF_INCONNU } from '../components/shared/kernel/libelles'
import { erreursBesoin, erreurNorme, erreurPlancher, erreurTolerance } from '../components/parametrage/domain/edition'
import { CONFIG } from './config-serveur'

const REGLES = versEngineSettings(CONFIG, '2026-2027')

/** École du serveur : 240 élèves, 4 maîtres, 6 salles. */
function ecole(patch: Partial<EcoleDjango> = {}): EcoleDjango {
  return {
    Identifiant_Ecole: 'E1',
    Sous_Systeme: 'Francophone',
    Region: 'Centre',
    Departement: 'Mfoundi',
    Commune: 'Yaoundé',
    Circonscription_IAEB: 'IAEB',
    Effectif_Eleves_Attendus: 240,
    Enseignants_Actuels: 4,
    Salles_Simple_Flux: 6,
    Salles_Double_Flux: 0,
    Accessibilite_Zone: 'Urbain',
    Securite_Zone: 'Verte',
    Classes_Multigrades: 'Non',
    nom_etab: 'École 1',
    type_etab: 'ECOLE',
    Pe: 4,
    me: 3,
    De: 4,
    BMAX: 6,
    Ke: 4,
    be: 0,
    xe: 0,
    se: 0,
    ae: 0,
    alpha: 5,
    sigma: 0,
    Wp: 1.5,
    beta: 5,
    Up: 6.5,
    niveau_difficulte: 3,
    nb_postes_ouverts: 0,
    est_necessiteuse: false,
    est_excedentaire: false,
    est_zone_rouge: false,
    ...patch,
  }
}

describe('Paramètres du minimum pédagogique commun', () => {
  it('les valeurs de référence sont M = 3, R = 60, T = 20', () => {
    assert.equal(REGLES.besoin.plancherPedagogique, 3)
    assert.equal(REGLES.besoin.elevesParMaitre, 60)
    assert.equal(REGLES.besoin.toleranceArrondi, 20)
  })

  it('M, R et T sont transmis au serveur, décimale de la norme comprise', () => {
    const config = versConfigDjango({
      besoin: { ...REGLES.besoin, plancherPedagogique: 4, elevesParMaitre: 74.4, toleranceArrondi: 25 },
    })
    assert.equal(config.besoin?.plancher_pedagogique, 4)
    assert.equal(config.besoin?.norme_eleves_par_maitre, 74.4)
    assert.equal(config.besoin?.effectif_premiere_section, 25)
  })

  it('chaque paramètre modifie ce qui est transmis', () => {
    const reference = JSON.stringify(versConfigDjango({ besoin: REGLES.besoin }))
    for (const [cle, valeur] of [
      ['plancherPedagogique', 5],
      ['elevesParMaitre', 74.4],
      ['toleranceArrondi', 0],
    ] as const) {
      const modifie = JSON.stringify(versConfigDjango({ besoin: { ...REGLES.besoin, [cle]: valeur } }))
      assert.notEqual(modifie, reference, `besoin.${cle} doit être transmis`)
    }
  })

  it('les valeurs enregistrées sont restituées après rechargement', () => {
    const enregistre = versConfigDjango({
      besoin: { ...REGLES.besoin, plancherPedagogique: 4, elevesParMaitre: 74.4, toleranceArrondi: 25 },
    })
    const relu = versEngineSettings({ ...CONFIG, besoin: { ...CONFIG.besoin, ...enregistre.besoin } })
    assert.equal(relu.besoin.plancherPedagogique, 4)
    assert.equal(relu.besoin.elevesParMaitre, 74.4)
    assert.equal(relu.besoin.toleranceArrondi, 25)
  })

  it('les réglages multigrades supprimés ne sont plus transmis', () => {
    const texte = JSON.stringify(versConfigDjango({ besoin: REGLES.besoin }))
    for (const cle of [
      'minimum_selon_multigrades',
      'niveaux_par_maitre_multigrade',
      'nombre_niveaux',
      'groupes_secours',
      'groupes_depuis_classes_ouvertes',
      'mobiliser_excedent_incertain',
    ]) {
      assert.ok(!texte.includes(cle), `${cle} ne doit plus être transmis`)
    }
  })

  it('valide les trois paramètres', () => {
    assert.deepEqual(erreursBesoin({ plancherPedagogique: 3, elevesParMaitre: 60, toleranceArrondi: 20 }), [])
    assert.deepEqual(erreursBesoin({ plancherPedagogique: 3, elevesParMaitre: 74.4, toleranceArrondi: 20 }), [])
    assert.notEqual(erreurPlancher(0), null)
    assert.notEqual(erreurPlancher(2.5), null)
    assert.notEqual(erreurPlancher(31), null)
    assert.equal(erreurPlancher(1), null)
    assert.notEqual(erreurNorme(0), null)
    assert.notEqual(erreurNorme(-5), null)
    assert.notEqual(erreurTolerance(-1, 60), null)
    assert.notEqual(erreurTolerance(60, 60), null)
    assert.equal(erreurTolerance(0, 60), null)
    assert.equal(erreursBesoin({ plancherPedagogique: 0, elevesParMaitre: 0, toleranceArrondi: -1 }).length, 3)
  })

  it('l’écran du Référentiel expose les trois paramètres et aucun réglage multigrade', () => {
    const source = readFileSync('components/parametrage/ui/composants/referentiel/ReglesBesoin.tsx', 'utf8')
    assert.ok(source.includes('Minimum pédagogique commun'))
    for (const champ of ['plancherPedagogique', 'elevesParMaitre', 'toleranceArrondi']) {
      assert.ok(source.includes(`besoin('${champ}'`), `${champ} doit être modifiable`)
    }
    for (const mort of [
      'niveauxParMaitre',
      'minimumSelonMultigrades',
      'groupesSecours',
      'groupesDepuisClassesOuvertes',
      'mobiliserExcedentIncertain',
    ]) {
      assert.ok(!source.includes(mort), `${mort} ne doit plus figurer à l’écran`)
    }
  })
})

describe('Classes multigrades sans effet sur le besoin', () => {
  it('le besoin affiché est celui du serveur, quel que soit le statut multigrade', () => {
    for (const statut of ['renseigne', 'non_renseigne', 'invalide', 'incoherent', 'historique_oui'] as const) {
      const d = versDiagnostic(ecole({ multigrades_statut: statut, statut_besoin: 'confirme' }), 1, REGLES)
      assert.equal(d.calcul.minimumPedagogique, 3)
      assert.equal(d.calcul.dotation, 4)
      assert.equal(d.calcul.statutBesoin, 'confirme')
      assert.ok(!d.raisons.some(r => r.code === 'besoin_provisoire'), statut)
    }
  })

  it('l’information multigrade reste lue pour les statistiques', () => {
    const d = versDiagnostic(ecole({ Classes_Multigrades: '2', Me: 2, multigrades_statut: 'renseigne' }), 1, REGLES)
    assert.equal(d.school.classesMultigrades, 2)
    assert.equal(d.calcul.classesMultigradesLues, 2)
    assert.equal(d.calcul.statutMultigrades, 'renseigne')
  })

  it('un effectif d’élèves inconnu garde un besoin provisoire et un excédent en attente', () => {
    const d = versDiagnostic(
      ecole({ statut_besoin: 'provisoire', besoin_final_incertain: true, xe: 5, xe_sur: 0, xe_a_verifier: 5 }),
      1,
      REGLES,
    )
    assert.equal(d.calcul.statutBesoin, 'provisoire')
    assert.equal(d.calcul.excedentSur, 0)
    assert.equal(d.calcul.excedentAVerifier, 5)
    assert.equal(d.raisons.find(r => r.code === 'besoin_provisoire')?.texte, MESSAGE_EFFECTIF_INCONNU)
  })

  it('transmet le besoin selon le REM et l’indicateur de salles', () => {
    const d = versDiagnostic(ecole({ Ce: 4, xe_sur: 1, xe_a_verifier: 0, bmax_incertain: true }), 1, REGLES)
    assert.equal(d.calcul.besoinSelonRem, 4)
    assert.equal(d.calcul.excedentSur, 1)
    assert.equal(d.calcul.bmaxIncertain, true)
  })
})
