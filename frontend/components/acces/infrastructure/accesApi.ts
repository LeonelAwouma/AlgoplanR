/**
 * Accès à l'API du contexte « Accès » : activation du poste, connexion, session,
 * mot de passe, région, administration des comptes par le DRH.
 *
 * Routes :
 *   GET  acces/etat/               POST acces/activation/        POST acces/connexion/
 *   POST acces/deconnexion/        GET  acces/session/           POST acces/session/activite/
 *   POST acces/mot-de-passe/       POST acces/region/confirmer/
 *   GET  acces/comptes/            GET  acces/comptes/{identifiant}/historique/
 *   POST acces/comptes/{identifiant}/suspendre/        POST acces/comptes/{identifiant}/reactiver/
 *   POST acces/comptes/{identifiant}/reinitialiser-mot-de-passe/
 *   POST acces/comptes/{identifiant}/fermer-sessions/
 *   POST acces/code/               GET  acces/codes/             POST acces/codes/remettre/
 *   POST acces/carnet/             POST acces/carnet/secours/
 */

import { appeler, definirJeton, route } from '../../shared/api'
import type {
  ActivationAppliquee,
  CarnetImporte,
  CodeRemis,
  CompteServeur,
  EtatPoste,
  HistoriqueCompte,
  ReinitialisationCompte,
  ReponseSession,
  SyntheseCodes,
  UsageCode,
} from '../domain/types'

const ROUTES = {
  etat: route<EtatPoste>()('GET', 'acces/etat/'),
  activation: route<ActivationAppliquee, { fichier: Blob }>()('POST', 'acces/activation/', 'multipart'),
  connexion: route<ReponseSession, { identifiant: string; mot_de_passe: string }>()('POST', 'acces/connexion/'),
  deconnexion: route<void>()('POST', 'acces/deconnexion/'),
  session: route<ReponseSession>()('GET', 'acces/session/'),
  activite: route<ReponseSession>()('POST', 'acces/session/activite/'),
  motDePasse: route<ReponseSession, { actuel: string; nouveau: string; confirmation: string }>()(
    'POST',
    'acces/mot-de-passe/',
  ),
  confirmerRegion: route<ReponseSession, { region: string }>()('POST', 'acces/region/confirmer/'),
  comptes: route<CompteServeur[]>()('GET', 'acces/comptes/'),
  historique: route<HistoriqueCompte>()('GET', 'acces/comptes/{identifiant}/historique/'),
  suspendre: route<CompteServeur>()('POST', 'acces/comptes/{identifiant}/suspendre/'),
  reactiver: route<CompteServeur>()('POST', 'acces/comptes/{identifiant}/reactiver/'),
  reinitialiser: route<ReinitialisationCompte>()('POST', 'acces/comptes/{identifiant}/reinitialiser-mot-de-passe/'),
  fermerSessions: route<{ sessions_fermees: number }>()('POST', 'acces/comptes/{identifiant}/fermer-sessions/'),
  code: route<ReponseSession, { region: string; usage: UsageCode; code: string }>()('POST', 'acces/code/'),
  codes: route<SyntheseCodes>()('GET', 'acces/codes/'),
  remettreCode: route<CodeRemis, { region: string; usage: UsageCode; mot_de_passe: string; remis_a: string }>()(
    'POST',
    'acces/codes/remettre/',
  ),
  carnet: route<CarnetImporte, { fichier: Blob; phrase: string; mot_de_passe: string }>()(
    'POST',
    'acces/carnet/',
    'multipart',
  ),
  carnetSecours: route<{ cle_secours: string }, { cle_secours: string; mot_de_passe: string }>()(
    'POST',
    'acces/carnet/secours/',
  ),
}

/** Retient le jeton délivré par le serveur, s'il y en a un. */
function retenir(reponse: ReponseSession): ReponseSession {
  if (reponse.jeton) definirJeton(reponse.jeton)
  return reponse
}

export function lireEtatPoste(signal?: AbortSignal): Promise<EtatPoste> {
  return appeler(ROUTES.etat, { signal })
}

/** Applique un fichier d'activation signé par l'administration (crée les comptes, change une région…). */
export function activerPoste(fichier: Blob): Promise<ActivationAppliquee> {
  return appeler(ROUTES.activation, { corps: { fichier } })
}

/** @throws ApiError 401 (identifiants incorrects, compte bloqué) ou 403 (compte suspendu, révoqué…). */
export async function connecter(identifiant: string, motDePasse: string): Promise<ReponseSession> {
  definirJeton(null)
  return retenir(await appeler(ROUTES.connexion, { corps: { identifiant, mot_de_passe: motDePasse } }))
}

/** Ferme la session côté serveur ; le jeton est oublié même si le serveur ne répond pas. */
export async function deconnecter(): Promise<void> {
  try {
    await appeler(ROUTES.deconnexion)
  } finally {
    definirJeton(null)
  }
}

export function lireSession(signal?: AbortSignal): Promise<ReponseSession> {
  return appeler(ROUTES.session, { signal })
}

/** Signale une activité de la personne : le serveur repousse l'échéance d'inactivité. */
export function signalerActivite(): Promise<ReponseSession> {
  return appeler(ROUTES.activite)
}

export async function changerMotDePasse(
  actuel: string,
  nouveau: string,
  confirmation: string,
): Promise<ReponseSession> {
  return retenir(await appeler(ROUTES.motDePasse, { corps: { actuel, nouveau, confirmation } }))
}

export async function confirmerRegion(region: string): Promise<ReponseSession> {
  return retenir(await appeler(ROUTES.confirmerRegion, { corps: { region } }))
}

export function listerComptes(signal?: AbortSignal): Promise<CompteServeur[]> {
  return appeler(ROUTES.comptes, { signal })
}

export function lireHistorique(identifiant: string, signal?: AbortSignal): Promise<HistoriqueCompte> {
  return appeler(ROUTES.historique, { params: { identifiant }, signal })
}

export function suspendreCompte(identifiant: string): Promise<CompteServeur> {
  return appeler(ROUTES.suspendre, { params: { identifiant } })
}

export function reactiverCompte(identifiant: string): Promise<CompteServeur> {
  return appeler(ROUTES.reactiver, { params: { identifiant } })
}

export function reinitialiserMotDePasse(identifiant: string): Promise<ReinitialisationCompte> {
  return appeler(ROUTES.reinitialiser, { params: { identifiant } })
}

export function fermerSessionsCompte(identifiant: string): Promise<{ sessions_fermees: number }> {
  return appeler(ROUTES.fermerSessions, { params: { identifiant } })
}

/**
 * Délégué : code d'activation (poste vierge) ou de récupération (mot de passe oublié) remis par le DRH. La
 * session délivrée ne permet que de créer le mot de passe personnel.
 */
export async function saisirCode(region: string, usage: UsageCode, code: string): Promise<ReponseSession> {
  definirJeton(null)
  return retenir(await appeler(ROUTES.code, { corps: { region, usage, code } }))
}

/** DRH : codes disponibles et remis, par région (sans les codes). */
export function lireCodes(signal?: AbortSignal): Promise<SyntheseCodes> {
  return appeler(ROUTES.codes, { signal })
}

/** DRH : prochain code d'une région, à transmettre au délégué ; montré une seule fois. */
export function remettreCode(region: string, usage: UsageCode, motDePasse: string, remisA: string): Promise<CodeRemis> {
  return appeler(ROUTES.remettreCode, { corps: { region, usage, mot_de_passe: motDePasse, remis_a: remisA } })
}

/** DRH : importe le carnet signé de l'administration, chiffré ensuite sur le poste. */
export function importerCarnet(fichier: Blob, phrase: string, motDePasse: string): Promise<CarnetImporte> {
  return appeler(ROUTES.carnet, { corps: { fichier, phrase, mot_de_passe: motDePasse } })
}

/** DRH : rouvre le carnet verrouillé avec la clé de secours, qui est renouvelée. */
export function debloquerCarnet(cleSecours: string, motDePasse: string): Promise<{ cle_secours: string }> {
  return appeler(ROUTES.carnetSecours, { corps: { cle_secours: cleSecours, mot_de_passe: motDePasse } })
}
