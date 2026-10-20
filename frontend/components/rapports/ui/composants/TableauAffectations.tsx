'use client'

/**
 * Tableau complet des propositions d'affectation du scénario affiché, pour le territoire filtré : toutes les
 * lignes, sans pagination, pour que le document du rapport imprimé ou exporté en PDF soit exhaustif.
 */

import type { SimulationResult } from '@shared/api'
import { MENTION_SIMULATION } from '@shared/kernel'
import { fmt } from '@shared/ui/commun'

import { ENTETES_AFFECTATIONS, lignesAffectations } from '../../domain/affectations'

/** Colonnes numériques, alignées à droite. */
const COLONNES_NUMERIQUES = new Set<number>([0, 13, 14])

export interface ProprietesTableauAffectations {
  /** Résultat du scénario affiché, restreint au territoire ; `null` en situation actuelle (aucune simulation). */
  resultat: SimulationResult | null
}

/** Section « Propositions d'affectation » du document du rapport. */
export function TableauAffectations({ resultat }: ProprietesTableauAffectations) {
  const lignes = resultat ? lignesAffectations(resultat.assignments) : []

  return (
    <section className="report-affectations">
      <h2>Propositions d’affectation</h2>
      {lignes.length === 0 ? (
        <p>Aucune proposition d’affectation pour ce scénario et ce périmètre.</p>
      ) : (
        <>
          <p>
            {fmt(lignes.length)} proposition(s) d’affectation, rangée(s) par région, département, commune et école de
            destination. {MENTION_SIMULATION}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {ENTETES_AFFECTATIONS.map((e, j) => (
                    <th key={e} scope="col" className={COLONNES_NUMERIQUES.has(j) ? 'num' : undefined}>
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne, i) => (
                  <tr key={i}>
                    {ligne.map((cellule, j) => (
                      <td key={j} className={COLONNES_NUMERIQUES.has(j) ? 'num' : undefined}>
                        {cellule}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
