/**
 * Présentation des caractéristiques d'une école.
 *
 * Convention d'affichage : une salle de classe physique reçoit un enseignant.
 * La colonne « Classes » des tableaux et des exports compte donc les salles de
 * classe de l'école, et non ses groupes d'élèves (qui peuvent être plus
 * nombreux quand des niveaux sont regroupés ou des salles manquent).
 */

import type { SchoolDiagnostic } from '../api/contrat'

/** Classes d'une école : ses salles de classe physiques, `null` si le fichier ne les renseigne pas. */
export function classesDe(d: SchoolDiagnostic): number | null {
  return d.school.nbSallesClasse
}

/** Valeur de tri des classes : une école sans salles renseignées passe en dernier. */
export function triClasses(d: SchoolDiagnostic): number {
  return classesDe(d) ?? -1
}
