/**
 * Contexte « Accès » : authentification et contrôle des accès, décidés par le serveur.
 *
 * L'application n'est montée que derrière `PorteAcces`, qui ne la rend qu'avec
 * une session complète délivrée par le serveur (mot de passe personnel, région
 * confirmée pour un délégué). Les refus du serveur (session expirée, compte
 * suspendu…) ramènent à l'écran correspondant.
 *
 * API publique du contexte : les autres contextes et l'application n'importent
 * que ce fichier, jamais ses dossiers internes.
 */

export type { SessionAcces } from './domain/types'
export { PorteAcces, type ActionsAcces } from './application/PorteAcces'
export { useUtilisateur } from './application/utilisateur'
