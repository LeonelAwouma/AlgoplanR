'use client'

/**
 * Règles de rotation et de redéploiement (§3.2 à §3.9). Le taux d'attrition hors retraite ne se règle pas ici :
 * il relève des hypothèses de planification (Planification → Hypothèses), source unique.
 */

import type { EngineSettings, ReglesMobilite as Regles } from '@shared/api'
import { Panel } from '@shared/ui/commun'

import { nombreSaisi, type MajParametres } from '../../../domain/edition'
import { Interrupteur, Regle } from '../ChampsRegles'

/** Règles de mobilité qui s'activent ou se désactivent. */
type RegleBooleenne = { [K in keyof Regles]: Regles[K] extends boolean ? K : never }[keyof Regles]

/** Interrupteurs des phases et protections de l'algorithme. */
const INTERRUPTEURS: { cle: RegleBooleenne; titre: string; texte: string }[] = [
  {
    cle: 'phaseVoeux',
    titre: 'Traiter les vœux des enseignants',
    texte:
      'Phase 1 : satisfaction des vœux par acceptation différée. Désactivée, seuls les redéploiements hors vœux et obligatoires sont simulés.',
  },
  {
    cle: 'regionsEtanches',
    titre: 'Affecter chaque enseignant dans sa région',
    texte:
      'Une affectation hors de la région de l’enseignant n’est pas retenue : l’enseignant reste dans le vivier et passe en commission d’arbitrage. Les décisions du prince et de la commission peuvent traverser les régions.',
  },
]

export interface ProprietesReglesMobilite {
  parametres: EngineSettings
  maj: MajParametres
}

/** Panneaux de rotation, de redéploiement et de règles de mobilité. */
export function ReglesMobilite({ parametres, maj }: ProprietesReglesMobilite) {
  const mobilite = <K extends keyof Regles>(cle: K, valeur: Regles[K]) =>
    maj(s => ({ ...s, mobilite: { ...s.mobilite, [cle]: valeur } }))
  const m = parametres.mobilite

  return (
    <>
      <Panel
        kicker="Rotation et redéploiement (§3.2 à §3.9)"
        title="Qui peut demander une mutation, et comment les situations restantes sont traitées"
      >
        <div className="regles">
          <Regle
            enonce="Une demande est recevable à partir de"
            precision="Durée de stabilité au poste, à confirmer : 5 ans imposés aux nouvelles recrues par leur contrat."
            htmlFor="r-stabilite"
          >
            <input
              id="r-stabilite"
              type="number"
              min={0}
              max={20}
              value={m.stabiliteMinimaleAns}
              onChange={e => mobilite('stabiliteMinimaleAns', nombreSaisi(e.target.value))}
            />
            <span className="regle-unite">ans au poste</span>
          </Regle>
        </div>
        <div className="switch-list">
          {INTERRUPTEURS.map(({ cle, titre, texte }) => (
            <Interrupteur key={cle} titre={titre} texte={texte} coche={m[cle]} onChange={v => mobilite(cle, v)} />
          ))}
        </div>
      </Panel>
    </>
  )
}
