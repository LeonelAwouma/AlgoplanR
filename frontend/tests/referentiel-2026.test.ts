/**
 * Référentiel d'octobre 2026 côté interface : Classes_Multigrades lu comme un entier par le serveur, cellule vide
 * jamais lue comme 0, provenance de G et phrase du mode « non renseigné » dans les explications du besoin.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { versDiagnostic, type EcoleDjango } from '../components/shared/api/backend/conversions/ecoles'
import { versEngineSettings } from '../components/shared/api/backend/conversions/parametres'
import { MESSAGE_MULTIGRADES_NON_RENSEIGNES } from '../components/shared/kernel/libelles'
import { CONFIG } from './config-serveur'

const REGLES = versEngineSettings(CONFIG, '2026-2027')

/** École du serveur : 240 élèves, 4 maîtres, 6 salles (BMAX 6). */
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
    me: 6,
    De: 6,
    BMAX: 6,
    Ke: 6,
    be: 2,
    xe: 0,
    se: 0,
    ae: 0,
    alpha: 5,
    sigma: 0,
    Wp: 1.5,
    beta: 5,
    Up: 6.5,
    niveau_difficulte: 3,
    nb_postes_ouverts: 2,
    est_necessiteuse: true,
    est_excedentaire: false,
    est_zone_rouge: false,
    ...patch,
  }
}

describe('Classes multigrades et minimum pédagogique', () => {
  it('lit le nombre de classes multigrades donné par le serveur', () => {
    const d = versDiagnostic(
      ecole({
        Classes_Multigrades: '2',
        Me: 2,
        Ge: 4,
        Ge_provenance: 'estime',
        multigrades_statut: 'renseigne',
        statut_besoin: 'estime',
        me: 4,
      }),
      1,
      REGLES,
    )
    assert.equal(d.school.classesMultigrades, 2)
    assert.equal(d.school.classesMultigradesRenseignees, true)
    assert.equal(d.calcul.groupesPedagogiques, 4)
    assert.equal(d.calcul.provenanceGroupes, 'estime')
    assert.equal(d.calcul.minimumPedagogique, 4)
    assert.ok(!d.raisons.some(r => r.code === 'besoin_provisoire'))
  })

  it('ne lit jamais une cellule vide comme « aucune classe multigrade »', () => {
    const d = versDiagnostic(
      ecole({
        Classes_Multigrades: '',
        Me: null,
        Ge: 6,
        Ge_provenance: 'secours',
        multigrades_statut: 'non_renseigne',
        minimum_provisoire: true,
        statut_besoin: 'provisoire',
      }),
      1,
      REGLES,
    )
    assert.equal(d.school.classesMultigradesRenseignees, false)
    assert.equal(d.calcul.classesMultigradesLues, null)
    assert.equal(d.calcul.minimumProvisoire, true)
    assert.equal(d.calcul.statutBesoin, 'provisoire')
    const raison = d.raisons.find(r => r.code === 'besoin_provisoire')
    assert.equal(raison?.texte, MESSAGE_MULTIGRADES_NON_RENSEIGNES)
  })

  it('signale une valeur illisible au lieu de la compter', () => {
    const d = versDiagnostic(
      ecole({ Classes_Multigrades: '2.5', Me: null, multigrades_statut: 'invalide', Ge_provenance: 'indetermine' }),
      1,
      REGLES,
    )
    assert.equal(d.school.classesMultigradesRenseignees, false)
    assert.equal(d.calcul.statutMultigrades, 'invalide')
  })

  it('transmet le besoin selon le REM et l’excédent à vérifier', () => {
    const d = versDiagnostic(ecole({ Ce: 4, xe_sur: 1, xe_a_verifier: 2, bmax_incertain: true }), 1, REGLES)
    assert.equal(d.calcul.besoinSelonRem, 4)
    assert.equal(d.calcul.excedentSur, 1)
    assert.equal(d.calcul.excedentAVerifier, 2)
    assert.equal(d.calcul.bmaxIncertain, true)
  })

  it('garde la norme décimale de 74,4', () => {
    assert.equal(REGLES.besoin.elevesParMaitre, 74.4)
  })
})
