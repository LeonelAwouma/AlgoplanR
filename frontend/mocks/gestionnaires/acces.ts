/**
 * Accès dans les données factices (développement de l'interface, sans serveur).
 *
 * Il n'y a ici aucun contrôle réel : le contrôle des accès est fait par le
 * serveur AlgoPlanR, jamais par l'interface. Toute connexion ouvre une session
 * complète du DRH de démonstration (les données factices sont nationales), pour
 * que les écrans restent explorables. Aucun mot de passe n'est enregistré.
 */

import { http } from 'msw'

import { REGIONS_CAMEROUN } from '../../components/shared/kernel/regions'
import { ok, sansContenu } from '../reponses'
import { api } from './outils'

const AUCUN_CODE = { total: 0, remis: 0, revoques: 0, disponibles: 0 }

const INACTIVITE_MIN = 20

const compte = {
  identifiant: 'drh',
  nom: 'DRH (démonstration)',
  role: 'DRH',
  region: null,
  etat: 'ACTIF',
  doit_changer_mot_de_passe: false,
  region_a_confirmer: false,
  region_confirmee_le: null,
  derniere_connexion: null,
}

function session() {
  const maintenant = new Date()
  const expire = new Date(maintenant.getTime() + INACTIVITE_MIN * 60_000)
  return {
    portee: 'COMPLETE',
    maintenant: maintenant.toISOString(),
    expire_inactivite_le: expire.toISOString(),
    expire_absolue_le: new Date(maintenant.getTime() + 12 * 3_600_000).toISOString(),
    inactivite_minutes: INACTIVITE_MIN,
    avertissement_minutes: 2,
  }
}

export const gestionnairesAcces = [
  http.get(api('acces/etat/'), () =>
    ok({
      poste_active: true,
      registre: 'active',
      poste: '00000000-0000-4000-8000-000000000000',
      profil: 'drh',
      region: null,
      identifiant: null,
    }),
  ),
  http.post(api('acces/connexion/'), () => ok({ compte, session: session(), jeton: 'jeton-factice' }, false, 201)),
  http.post(api('acces/deconnexion/'), () => sansContenu()),
  http.get(api('acces/session/'), () => ok({ compte, session: session() })),
  http.post(api('acces/session/activite/'), () => ok({ compte, session: session() })),
  http.get(api('acces/comptes/'), () => ok([compte])),
  http.get(api('acces/comptes/:identifiant/historique/'), () => ok({ compte, evenements: [] })),
  // Aucun carnet de codes dans les données factices : les codes ne se remettent que sur un vrai poste du DRH.
  http.get(api('acces/codes/'), () =>
    ok({
      present: false,
      verrouille: false,
      carnets: [],
      regions: REGIONS_CAMEROUN.map(region => ({ region, activation: AUCUN_CODE, recuperation: AUCUN_CODE })),
      remises: [],
    }),
  ),
]
