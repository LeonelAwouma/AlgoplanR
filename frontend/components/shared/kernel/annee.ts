/** Année scolaire : « AAAA-AAAA », une rentrée en septembre. */

/** L'année scolaire en cours (de janvier à juillet, c'est celle qui a commencé l'an passé). */
export function anneeScolaireCourante(date: Date = new Date()): string {
  const debut = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1
  return `${debut}-${debut + 1}`
}

/** La saisie est-elle de la forme « AAAA-AAAA » avec deux années consécutives ? */
export function anneeScolaireValide(valeur: string): boolean {
  const m = /^(\d{4})\s*[-/–]\s*(\d{4})$/.exec(valeur.trim())
  return m !== null && Number(m[2]) === Number(m[1]) + 1
}
