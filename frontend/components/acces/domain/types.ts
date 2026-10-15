/**
 * Contrôle d'accès : comptes, sessions et rôles, tels que les sert le serveur.
 *
 * Toute décision d'accès est prise par le serveur (contextes/acces) : l'interface
 * ne fait qu'afficher l'écran qui correspond à la session qu'il a délivrée. Deux
 * rôles : le DRH consulte les dix régions et administre les délégués ; un
 * délégué régional ne voit et n'importe que les données de sa région.
 */

export type RoleServeur = 'DRH' | 'DELEGUE'
export type EtatCompte = 'ACTIF' | 'SUSPENDU' | 'REVOQUE'

/**
 * Portée de la session : tant que le mot de passe temporaire n'est pas changé,
 * ou que la région n'est pas confirmée, le serveur refuse toutes les autres routes.
 */
export type PorteeSession = 'CHANGEMENT_MDP' | 'CONFIRMATION_REGION' | 'COMPLETE'

export interface CompteServeur {
  identifiant: string
  nom: string
  role: RoleServeur
  region: string | null
  etat: EtatCompte
  doit_changer_mot_de_passe: boolean
  region_a_confirmer: boolean
  region_confirmee_le: string | null
  derniere_connexion: string | null
}

/** Échéances de la session, en heure du serveur. */
export interface EcheancesSession {
  portee: PorteeSession
  maintenant: string
  expire_inactivite_le: string
  expire_absolue_le: string
  inactivite_minutes: number
  avertissement_minutes: number
}

/** Réponse des routes de session ; `jeton` seulement quand le serveur en délivre un nouveau. */
export interface ReponseSession {
  compte: CompteServeur
  session: EcheancesSession
  jeton?: string
  /** Clé de secours du carnet, renvoyée une seule fois quand le carnet du DRH vient d'être installé. */
  cle_secours?: string
}

export interface EtatPoste {
  poste_active: boolean
  registre: 'vierge' | 'active' | 'invalide'
  /** Identifiant administratif du poste, à communiquer à l'administration pour un fichier lié à ce poste. */
  poste: string
  /** Poste du DRH, poste d'une région (délégué), ou poste encore vierge. */
  profil: 'drh' | 'region' | null
  region: string | null
  /** Identifiant du compte du délégué de ce poste. */
  identifiant: string | null
}

/** Usage d'un code remis par le DRH : première activation du poste, ou mot de passe oublié. */
export type UsageCode = 'activation' | 'recuperation'

export interface CompteurCodes {
  total: number
  remis: number
  revoques: number
  disponibles: number
}

export interface RemiseCodeServeur {
  entree: string
  region: string
  usage: UsageCode
  remis_le: string
  remis_a: string
  remis_par: string
}

/** État du carnet chiffré du DRH, sans aucun code. */
export interface SyntheseCodes {
  present: boolean
  verrouille: boolean
  carnets: number[]
  regions: ({ region: string } & Record<UsageCode, CompteurCodes>)[]
  remises: RemiseCodeServeur[]
}

/** Code remis à un délégué : montré une seule fois. */
export interface CodeRemis {
  code: string
  entree: string
  region: string
  usage: UsageCode
}

export interface CarnetImporte {
  numero: number | null
  codes_ajoutes: number
  total: number
  /** Nouvelle clé de secours du carnet, montrée une seule fois ; `null` si elle ne change pas. */
  cle_secours: string | null
}

export interface ActivationAppliquee {
  id: string
  type: string
  operations: string[]
  registre: EtatPoste['registre']
}

export interface EvenementCompte {
  type: string
  le: string
  auteur: string
  details: Record<string, unknown>
}

export interface HistoriqueCompte {
  compte: CompteServeur
  evenements: EvenementCompte[]
}

export interface ReinitialisationCompte {
  compte: CompteServeur
  /** Montré une seule fois, pour être transmis au délégué. */
  mot_de_passe_temporaire: string
}

/** Personne connectée, telle que la voit l'application. */
export type SessionAcces =
  | { role: 'drh'; identifiant: string; nom: string }
  | { role: 'delegue'; identifiant: string; nom: string; region: string }

export function sessionDepuisCompte(c: CompteServeur): SessionAcces {
  return c.role === 'DELEGUE' && c.region
    ? { role: 'delegue', identifiant: c.identifiant, nom: c.nom, region: c.region }
    : { role: 'drh', identifiant: c.identifiant, nom: c.nom }
}
