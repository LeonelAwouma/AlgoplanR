/**
 * Contexte « Accès » : codes des délégués régionaux et session de la personne connectée.
 *
 * ACCÈS DÉSACTIVÉ (AlgoPlanR 1.0.0) : seul le type de la session sert encore,
 * pour donner à l'application les droits complets du DRH. Le reste du contexte
 * est conservé tel quel pour pouvoir rétablir le contrôle d'accès.
 *
 * API publique du contexte : les autres contextes et l'application n'importent
 * que ce fichier, jamais ses dossiers internes.
 */

export type { SessionAcces } from './domain/types'
export { useAcces, type Acces } from './application/useAcces'
export { demandesEnAttente } from './domain/registre'
