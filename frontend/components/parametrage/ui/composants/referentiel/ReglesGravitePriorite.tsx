'use client'

/**
 * Règle de priorité des écoles (§3.1) : indice u = poids de vulnérabilité w (accessibilité + sécurité) + points de
 * besoin β selon le taux d'encadrement actuel. Seuls les coefficients t1 et t2 de w se règlent ; les points d'accessibilité, de
 * sécurité et de besoin sont des constantes du serveur.
 */

import type { EngineSettings, ReglesPriorite } from '@shared/api'
import { Panel } from '@shared/ui/commun'

import type { MajParametres } from '../../../domain/edition'
import { ChampNombre } from '../ChampsRegles'

/** Complément à 1 d'un coefficient (t2 = 1 − t1), arrondi au centième. */
function complement(t: number): number {
  return Math.round((1 - Math.min(1, Math.max(0, t))) * 100) / 100
}

export interface ProprietesReglesGravitePriorite {
  parametres: EngineSettings
  maj: MajParametres
}

/** Panneau « Priorité des écoles ». */
export function ReglesGravitePriorite({ parametres, maj }: ProprietesReglesGravitePriorite) {
  const priorite = (transformation: (p: ReglesPriorite) => ReglesPriorite) =>
    maj(s => ({ ...s, priorite: transformation(s.priorite) }))
  const p = parametres.priorite

  return (
    <>
      <Panel
        kicker="Priorité des écoles (§3.1)"
        title="Quelles écoles servir en premier"
        hint="Indice de priorité u = poids de vulnérabilité w (accessibilité + sécurité) + points de besoin β selon le taux d’encadrement actuel. Les coefficients t1 et t2 se règlent ici ; les points sont fixés par le serveur."
      >
        <div className="param-grid">
          {/* wp = t1·α + t2·σ avec t1 + t2 = 1 : modifier l'un recalcule l'autre. */}
          <ChampNombre
            id="r-coef-a"
            libelle="t1 — poids de l’accessibilité dans wp"
            max={1}
            pas={0.05}
            valeur={p.coefAccessibilite}
            onChange={v => priorite(x => ({ ...x, coefAccessibilite: v, coefSecurite: complement(v) }))}
          />
          <ChampNombre
            id="r-coef-s"
            libelle="t2 — poids de la sécurité dans wp (t2 = 1 − t1)"
            max={1}
            pas={0.05}
            valeur={p.coefSecurite}
            onChange={v => priorite(x => ({ ...x, coefSecurite: v, coefAccessibilite: complement(v) }))}
          />
        </div>
      </Panel>
    </>
  )
}
