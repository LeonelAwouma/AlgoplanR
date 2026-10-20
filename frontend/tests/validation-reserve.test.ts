/** Validation avec réserve DRH : mention explicite dans les rapports ; faits du Prince devenus impossibles. */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { statutDonnees } from '../components/shared/api/backend/routes/rapports'
import { LIBELLE_STATUT_PRINCE } from '../components/shared/kernel/libelles'

describe('Statut des données dans les rapports', () => {
  it('un jeu non validé est dit non validé', () => {
    assert.match(statutDonnees(undefined).join(' '), /non validé/)
    assert.match(statutDonnees({ statut: 'brouillon' }).join(' '), /non validé/)
  })

  it('une validation normale est dite sans réserve', () => {
    const p = statutDonnees({ statut: 'valide', valide_par: 'Chef DRH', valide_le: '2026-10-20T10:00:00' }).join(' ')
    assert.match(p, /validé par Chef DRH/)
    assert.match(p, /sans réserve/)
    assert.doesNotMatch(p, /RÉSERVE/)
  })

  it('une validation avec réserve cite le motif, les contrôles en réserve et la règle de calcul', () => {
    const p = statutDonnees({
      statut: 'valide',
      valide_par: 'Chef DRH',
      valide_le: '2026-10-20T10:00:00',
      reserve_drh: {
        motif: 'Liste nominative en cours de mise à jour',
        auteur: 'Chef DRH',
        le: '2026-10-20T10:00:00',
        controles: [
          { libelle: 'Effectifs réconciliés pour les écoles touchées par un fait du Prince', detail: '2 écoles' },
        ],
      },
    }).join('\n')
    assert.match(p, /AVEC RÉSERVE DE LA DRH/)
    assert.match(p, /Liste nominative en cours de mise à jour/)
    assert.match(p, /Effectifs réconciliés/)
    assert.match(p, /effectifs déclarés/)
  })
})

describe('Faits du Prince devenus impossibles', () => {
  it('ont un libellé propre, distinct d’un fait introuvable', () => {
    assert.equal(LIBELLE_STATUT_PRINCE.invalide, 'Devenu impossible')
    assert.notEqual(LIBELLE_STATUT_PRINCE.invalide, LIBELLE_STATUT_PRINCE.enseignant_introuvable)
  })
})
