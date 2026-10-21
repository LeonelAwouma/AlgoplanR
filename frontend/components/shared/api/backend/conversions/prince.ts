/** Bilan d'un import de faits du Prince, du serveur Django → contrat. */

import type { BilanImportPrince } from '../../contrat'

/** Bilan tel que le sert le serveur (`contextes/prince/services.importer`). */
export interface BilanPrinceDjango {
  acceptees: unknown[]
  refusees: { id_ens?: string; id_etab?: string; motifs?: string[]; motif?: string }[]
  manquantes: string[]
}

export function versBilanPrince(bilan: BilanPrinceDjango): BilanImportPrince {
  const refus = bilan.refusees.map(
    l => `${l.id_ens ?? '?'} → ${l.id_etab ?? '?'} : ${(l.motifs ?? [l.motif ?? 'refusé']).join(', ')}`,
  )
  if (bilan.manquantes.length > 0) refus.push(`Identifiants absents du jeu : ${bilan.manquantes.join(', ')}`)
  return { acceptees: bilan.acceptees.length, refus, manquantes: [] }
}
