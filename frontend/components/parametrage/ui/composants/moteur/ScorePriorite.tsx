'use client'

/**
 * Paramètres chiffrés du score de priorité S = A + Z + B (§3.3), qui départage
 * les candidats à une même école.
 */

import type { EngineSettings, ReglesMobilite } from '@shared/api'
import { Panel } from '@shared/ui/commun'

import type { MajParametres } from '../../../domain/edition'
import { ChampNombre } from '../ChampsRegles'

/** Règles numériques de mobilité qui composent le score. */
type RegleNumerique = {
  [K in keyof ReglesMobilite]: ReglesMobilite[K] extends number ? K : never
}[keyof ReglesMobilite]

/** Champs du score, dans l'ordre A, Z, B. */
const CHAMPS: { cle: RegleNumerique; libelle: string; max: number }[] = [
  { cle: 'pointsAncienneteBase', libelle: 'C2 — bonus de stabilité (dès la stabilité minimale)', max: 50 },
  { cle: 'ancienneteDebutPointsAns', libelle: 'C2 — progression au-delà de (ans au poste)', max: 20 },
  { cle: 'pointsParAnSupplementaire', libelle: 'C2 — points par année au-delà', max: 10 },
  { cle: 'plafondAnciennete', libelle: 'C2 — plafond (0 = sans plafond)', max: 100 },
  { cle: 'malusRetraite', libelle: 'C2 — décote à l’approche de la retraite', max: 20 },
  { cle: 'pointsAnneeNiveau1', libelle: 'Z — points par année en zone de niveau 1', max: 10 },
  { cle: 'pointsAnneeNiveau2', libelle: 'Z — points par année en zone de niveau 2', max: 10 },
  { cle: 'plancherZoneDifficile', libelle: 'Z — plancher (Z = max(plancher ; 2 n1 + n2))', max: 50 },
  { cle: 'bonificationMotif', libelle: 'B — bonification pour motif justifié', max: 50 },
]

/** Panneau « Score de priorité ». */
export function ScorePriorite({ parametres, maj }: { parametres: EngineSettings; maj: MajParametres }) {
  return (
    <Panel
      kicker="Score de priorité (§3.3)"
      title="Comment les candidats à une même école sont départagés"
      hint="S = A + Z + B. A : ancienneté au poste ; Z : service en zone difficile ; B : bonification sur l’école visée par un motif justifié. À score égal : ancienneté générale, puis âge, puis rang de tirage au sort."
    >
      <div className="param-grid">
        {CHAMPS.map(({ cle, libelle, max }) => (
          <ChampNombre
            key={cle}
            id={`e-score-${cle}`}
            libelle={libelle}
            max={max}
            valeur={parametres.mobilite[cle]}
            onChange={v => maj(s => ({ ...s, mobilite: { ...s.mobilite, [cle]: v } }))}
          />
        ))}
      </div>
    </Panel>
  )
}
