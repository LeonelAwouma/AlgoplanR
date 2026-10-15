/**
 * Tri des classeurs d'un dossier entre les compartiments établissements et
 * enseignants, d'après leurs en-têtes.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compartimentDe, estClasseur, repartir, type ClasseurLu } from '../components/donnees/domain/triDossier'
import { colonnesAttendues } from '../components/shared/api/backend/conversions/donnees'

const COLONNES = { etablissements: colonnesAttendues('etablissements'), enseignants: colonnesAttendues('enseignants') }

/** En-têtes des fichiers du serveur (domaine/donnees/colonnes.py). */
const ENTETES_ETABLISSEMENTS = [
  'Identifiant_Ecole',
  'Sous_Systeme',
  'Region',
  'Departement',
  'Commune',
  'Circonscription_IAEB',
  'Effectif_Eleves_Attendus',
  'Enseignants_Actuels',
  'Salles_Simple_Flux',
  'Salles_Double_Flux',
  'Accessibilite_Zone',
  'Securite_Zone',
  'Classes_Multigrades',
  'nom_etab',
]
const ENTETES_ENSEIGNANTS = [
  'Matricule_Enseignant',
  'nom',
  'prenom',
  'Sous_Systeme_Formation',
  'Ecole_Attache_Actuelle',
  'Age',
  'Anciennete_Carriere',
  'Anciennete_Poste_Actuel',
  'Situation_Matrimoniale',
  'Nombre_Enfants_A_Charge',
  'Voeu_1',
  'Voeu_2',
  'Voeu_3',
]

function lu(chemin: string, entetes: string[] | null): ClasseurLu<string> {
  return { fichier: chemin, chemin, entetes }
}

describe('tri des classeurs d’un dossier', () => {
  it('ne retient que les classeurs, sans les fichiers temporaires d’Excel', () => {
    assert.ok(estClasseur('Ecoles 2026.XLSX'))
    assert.ok(estClasseur('personnel.csv'))
    assert.ok(!estClasseur('~$Ecoles 2026.xlsx'))
    assert.ok(!estClasseur('notes.docx'))
  })

  it('range chaque classeur d’après ses colonnes, quel que soit son nom', () => {
    assert.equal(compartimentDe('fichier1.xlsx', ENTETES_ETABLISSEMENTS, COLONNES).type, 'etablissements')
    assert.equal(compartimentDe('fichier2.xlsx', ENTETES_ENSEIGNANTS, COLONNES).type, 'enseignants')
    // Intitulés courants plutôt que les noms officiels, accents et casse compris.
    assert.equal(compartimentDe('a.csv', ['Matricule', 'Nom', 'École attache', 'Âge'], COLONNES).type, 'enseignants')
    assert.equal(
      compartimentDe('b.csv', ['Code école', 'Région', 'Commune', 'Effectif'], COLONNES).type,
      'etablissements',
    )
  })

  it('départage une égalité par le nom du fichier, sinon ne range pas', () => {
    // « sous_systeme » est reconnu des deux côtés : un point chacun.
    const communes = ['sous_systeme']
    assert.equal(compartimentDe('enseignants.xlsx', communes, COLONNES).type, 'enseignants')
    assert.equal(compartimentDe('donnees.xlsx', communes, COLONNES).type, null)
    assert.equal(compartimentDe('vide.xlsx', ['Colonne inconnue'], COLONNES).type, null)
  })

  it('répartit un dossier et explique les classeurs ignorés', () => {
    const r = repartir(
      [
        lu('dossier/ecoles.xlsx', ENTETES_ETABLISSEMENTS),
        lu('dossier/personnel.xlsx', ENTETES_ENSEIGNANTS),
        lu('dossier/ecoles_ancien.xlsx', ENTETES_ETABLISSEMENTS.slice(0, 3)),
        lu('dossier/budget.xlsx', ['Ligne', 'Montant']),
        { fichier: 'dossier/abime.xlsx', chemin: 'dossier/abime.xlsx', entetes: null, erreur: 'Classeur illisible.' },
      ],
      COLONNES,
    )
    assert.equal(r.retenus.etablissements?.chemin, 'dossier/ecoles.xlsx')
    assert.equal(r.retenus.enseignants?.chemin, 'dossier/personnel.xlsx')
    assert.deepEqual(
      r.ignores.map(i => i.chemin),
      ['dossier/ecoles_ancien.xlsx', 'dossier/budget.xlsx', 'dossier/abime.xlsx'],
    )
  })
})
