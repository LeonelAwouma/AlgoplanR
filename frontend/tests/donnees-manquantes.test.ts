/**
 * Données absentes des fichiers : signalées, jamais inventées. Capacité ≠ classes ouvertes ; année scolaire du jeu.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { versJeu } from '../components/shared/api/backend/conversions/donnees'
import { versDiagnostic, type EcoleDjango } from '../components/shared/api/backend/conversions/ecoles'
import { versTeacher, type EnseignantDjango } from '../components/shared/api/backend/conversions/enseignants'
import { versEngineSettings } from '../components/shared/api/backend/conversions/parametres'
import { anneeScolaireCourante, anneeScolaireValide } from '../components/shared/kernel/annee'
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

describe('Capacité en maîtres et classes ouvertes', () => {
  it('ne prend plus BMAX pour le nombre de classes ouvertes', () => {
    const d = versDiagnostic(ecole(), 1, REGLES)
    assert.equal(d.school.capaciteMaitres, 6)
    assert.equal(d.school.nombreClassesOuvertes, null)
    assert.equal(d.elevesParClasse, null, 'sans classes ouvertes, le ratio n’est pas calculable')
  })

  it('lit du serveur les élèves par classe et le taux d’encadrement, sans les recalculer', () => {
    const d = versDiagnostic(ecole({ Classes_Ouvertes: 5, eleves_par_classe: 48, rem: 40 }), 1, REGLES)
    assert.equal(d.school.nombreClassesOuvertes, 5)
    assert.equal(d.elevesParClasse, 48)
    assert.equal(d.elevesParEnseignant, 40)
    // Sans valeur du serveur, rien n'est inventé côté interface.
    const sans = versDiagnostic(ecole({ Classes_Ouvertes: 5 }), 1, REGLES)
    assert.equal(sans.elevesParClasse, null)
    assert.equal(sans.elevesParEnseignant, null)
  })
})

describe('Données absentes', () => {
  it('une école sans effectif d’élèves est en repli, avec un effectif inconnu et non nul', () => {
    const d = versDiagnostic(ecole({ effectif_connu: false, Effectif_Eleves_Attendus: 0 }), 1, REGLES)
    assert.equal(d.calcul.methode, 'repli_classes')
    assert.equal(d.school.effectifTotalEleves, null)
    assert.equal(d.elevesParEnseignant, null)
    assert.equal(versDiagnostic(ecole(), 1, REGLES).calcul.methode, 'norme_eleves')
  })

  it('une école sans salles a une capacité inconnue, pas nulle', () => {
    const d = versDiagnostic(ecole({ salles_connues: false, BMAX: 0, Ke: 0, be: 0 }), 1, REGLES)
    assert.equal(d.calcul.bmax, null)
    assert.equal(d.school.sallesRenseignees, false)
    assert.equal(d.school.nbSallesClasse, null)
    assert.equal(d.besoinTheorique, 0, 'le calcul numérique est inchangé')
  })

  it('un âge absent du fichier n’est pas affiché comme 35 ans', () => {
    const t = { Matricule_Enseignant: 'M1', Age: 35, age_connu: false } as unknown as EnseignantDjango
    assert.equal(versTeacher(t).age, null)
    assert.equal(versTeacher({ ...t, age_connu: true }).age, 35)
    assert.equal(versTeacher({ ...t, age_connu: undefined }).age, 35, 'anciennes données : l’âge est lu tel quel')
  })

  it('les données élèves sont indisponibles quand aucune école n’a d’effectif', () => {
    const base = {
      id: 'j',
      nom: 'Jeu',
      source: 'import',
      cree_le: '2026-10-01T10:00:00Z',
      nb_etablissements: 10,
      nb_enseignants: 50,
      nb_scenarios: 0,
      nb_faits_prince: 0,
      nb_arbitrages: 0,
      nb_recrues: 0,
    }
    const sans = { ecoles_sans_effectif: 10, ecoles_sans_salles: 0, enseignants_sans_age: 0 }
    assert.equal(versJeu({ ...base, donnees_manquantes: sans }).donneesElevesDisponibles, false)
    assert.equal(
      versJeu({ ...base, donnees_manquantes: { ...sans, ecoles_sans_effectif: 3 } }).donneesElevesDisponibles,
      true,
    )
  })
})

describe('Année scolaire', () => {
  it('vient du jeu, enregistrée à sa création, et non d’une constante', () => {
    const jeu = {
      id: 'j',
      nom: 'Jeu',
      source: 'import',
      cree_le: '2026-10-01T10:00:00Z',
      annee_scolaire: '2027-2028',
      nb_etablissements: 1,
      nb_enseignants: 1,
      nb_scenarios: 0,
      nb_faits_prince: 0,
      nb_arbitrages: 0,
      nb_recrues: 0,
    }
    assert.equal(versJeu(jeu).anneeScolaire, '2027-2028')
    assert.equal(versEngineSettings(CONFIG, '2027-2028').anneeScolaire, '2027-2028')
  })

  it('se calcule et se valide comme au serveur', () => {
    assert.equal(anneeScolaireCourante(new Date(2026, 9, 20)), '2026-2027')
    assert.equal(anneeScolaireCourante(new Date(2027, 2, 1)), '2026-2027')
    assert.equal(anneeScolaireCourante(new Date(2027, 7, 15)), '2027-2028')
    assert.ok(anneeScolaireValide('2027-2028') && anneeScolaireValide(' 2027 / 2028 '))
    for (const mauvaise of ['2027', '2027-2029', '2028-2027', '2027-28', '']) assert.ok(!anneeScolaireValide(mauvaise))
  })
})
