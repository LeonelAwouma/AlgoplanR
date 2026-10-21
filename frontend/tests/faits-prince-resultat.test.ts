/**
 * Faits du Prince dans le résultat d'un scénario (export Excel) et libellés d'école : référence / destination décidée.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { versTeacher, type EnseignantDjango } from '../components/shared/api/backend/conversions/enseignants'
import { versFaitsPrince, type AffectationDjango } from '../components/shared/api/backend/conversions/simulation'
import type { SchoolDiagnostic } from '../components/shared/api'

function affectation(patch: Partial<AffectationDjango>): AffectationDjango {
  return {
    phase: 'effet_de_prince',
    id_poste: 'ECO011_P_PRINCE_1',
    id_etab: 'ECO011',
    nom_etab: 'École 11',
    commune_poste: 'Yaoundé',
    departement_poste: 'Mfoundi',
    region_poste: 'Centre',
    zone_poste: 'Urbain',
    sous_systeme: 'Francophone',
    id_ens: 'MAT1',
    nom_ens: 'Mballa',
    prenom_ens: 'Paul',
    commune_origine: 'Mbalmayo',
    departement_origine: 'Nyong',
    region_origine: 'Centre',
    sous_systeme_ens: 'Francophone',
    bareme: 40,
    score_affectation: 30,
    motif_derogation: 'Décision n°12',
    arbitrage: 'fait_du_prince',
    id_etab_origine: 'ECO019',
    ...patch,
  }
}

const ECOLES = new Map([
  ['ECO019', { school: { nom: 'École 19', commune: 'Mbalmayo', departement: 'Nyong', region: 'Centre' } }],
  ['ECO011', { school: { nom: 'École 11', commune: 'Yaoundé', departement: 'Mfoundi', region: 'Centre' } }],
]) as unknown as Map<string, SchoolDiagnostic>

describe('Faits du Prince du résultat', () => {
  it('sont les affectations de phase effet_de_prince, avec école de référence et destination décidée', () => {
    const faits = versFaitsPrince(
      [affectation({}), affectation({ phase: 'phase1_voeu_1', id_ens: 'MAT2' })],
      ECOLES,
      '2026-10-20T08:00:00Z',
    )
    assert.equal(faits.length, 1)
    const { fait, statut } = faits[0]
    assert.equal(statut, 'applique')
    assert.equal(fait.teacherId, 'MAT1')
    assert.equal(fait.enseignant, 'Paul Mballa')
    assert.equal(fait.origine.nom, 'École 19')
    assert.equal(fait.destination.nom, 'École 11')
    assert.equal(fait.reference, 'Décision n°12')
    assert.equal(fait.decideLe, '2026-10-20T08:00:00Z')
  })

  it('portent leurs alertes', () => {
    const [f] = versFaitsPrince([affectation({ alertes_prince: ['Capacité dépassée'] })], ECOLES, '')
    assert.equal(f.statut, 'applique_avec_alerte')
    assert.equal(f.motif, 'Capacité dépassée')
  })
})

describe('École de référence', () => {
  const base = { Matricule_Enseignant: 'MAT1', Ecole_Attache_Actuelle: 'ECO011' } as unknown as EnseignantDjango

  it('distingue la destination décidée de l’école du fichier', () => {
    const t = versTeacher({ ...base, fait_prince: true, ecole_reference: 'ECO019', nom_ecole_reference: 'École 19' })
    assert.equal(t.faitPrinceId, 'MAT1')
    assert.equal(t.idEtabAttache, 'ECO011')
    assert.equal(t.idEtabReference, 'ECO019')
    assert.equal(t.nomEtabReference, 'École 19')
  })

  it('un enseignant non déplacé n’a pas de fait du Prince', () => {
    const t = versTeacher({ ...base, fait_prince: false, ecole_reference: 'ECO011', nom_ecole_reference: 'École 11' })
    assert.equal(t.faitPrinceId, undefined)
  })
})
