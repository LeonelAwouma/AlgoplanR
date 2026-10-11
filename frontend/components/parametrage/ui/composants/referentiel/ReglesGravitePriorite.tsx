'use client'

/**
 * Règles de gravité du besoin (seuils de sévérité) et de priorité des écoles
 * (§3.1) : indice u = poids de vulnérabilité w (accessibilité + sécurité) +
 * points de besoin β selon le REM actuel.
 */

import type { EngineSettings, ReglesPriorite } from '@shared/api'
import { Panel } from '@shared/ui/commun'

import type { MajParametres } from '../../../domain/edition'
import { ChampNombre, Regle } from '../ChampsRegles'

/** Complément à 1 d'un coefficient (t2 = 1 − t1), arrondi au centième. */
function complement(t: number): number {
  return Math.round((1 - Math.min(1, Math.max(0, t))) * 100) / 100
}

/** Points d'accessibilité, dans l'ordre d'affichage. */
const ACCESSIBILITES = [
  ['urbain', 'Accessibilité — urbain'],
  ['semi_urbain', 'Accessibilité — semi-urbain'],
  ['rural', 'Accessibilité — rural'],
  ['rural_enclave', 'Accessibilité — rural enclavé'],
] as const

/** Points de sécurité, dans l'ordre d'affichage. */
const SECURITES = [
  ['verte', 'Sécurité — zone verte'],
  ['jaune', 'Sécurité — zone jaune'],
  ['rouge', 'Sécurité — zone rouge'],
] as const

export interface ProprietesReglesGravitePriorite {
  parametres: EngineSettings
  maj: MajParametres
}

/** Panneaux « Gravité » et « Priorité des écoles ». */
export function ReglesGravitePriorite({ parametres, maj }: ProprietesReglesGravitePriorite) {
  const priorite = (transformation: (p: ReglesPriorite) => ReglesPriorite) =>
    maj(s => ({ ...s, priorite: transformation(s.priorite) }))
  const seuil = (cle: 'faible' | 'important', pourcentage: number) =>
    maj(s => ({ ...s, seuilsSeverite: { ...s.seuilsSeverite, [cle]: pourcentage / 100 } }))
  const p = parametres.priorite

  return (
    <>
      <Panel
        kicker="Gravité"
        title="Comment qualifier l’ampleur d’un besoin"
        hint="Le besoin d’une école est rapporté à sa cible K."
      >
        <div className="regles">
          <Regle enonce="Le besoin reste qualifié de faible tant qu’il ne dépasse pas" htmlFor="r-seuil-faible">
            <input
              id="r-seuil-faible"
              type="number"
              min={5}
              max={50}
              value={Math.round(parametres.seuilsSeverite.faible * 100)}
              onChange={e => seuil('faible', Number(e.target.value))}
            />
            <span className="regle-unite">% de la cible</span>
          </Regle>
          <Regle
            enonce="Il devient critique au-delà de"
            precision="Entre les deux valeurs, il est qualifié d’important."
            htmlFor="r-seuil-important"
          >
            <input
              id="r-seuil-important"
              type="number"
              min={10}
              max={90}
              value={Math.round(parametres.seuilsSeverite.important * 100)}
              onChange={e => seuil('important', Number(e.target.value))}
            />
            <span className="regle-unite">% de la cible</span>
          </Regle>
        </div>
      </Panel>

      <Panel
        kicker="Priorité des écoles (§3.1)"
        title="Quelles écoles servir en premier"
        hint="Indice de priorité u = poids de vulnérabilité w (accessibilité + sécurité) + points de besoin β selon le REM actuel. Valeurs à valider par la hiérarchie."
      >
        <div className="param-grid">
          {ACCESSIBILITES.map(([cle, libelle]) => (
            <ChampNombre
              key={cle}
              id={`r-acc-${cle}`}
              libelle={libelle}
              max={50}
              valeur={p.pointsAccessibilite[cle]}
              onChange={v => priorite(x => ({ ...x, pointsAccessibilite: { ...x.pointsAccessibilite, [cle]: v } }))}
            />
          ))}
          {SECURITES.map(([cle, libelle]) => (
            <ChampNombre
              key={cle}
              id={`r-sec-${cle}`}
              libelle={libelle}
              max={50}
              valeur={p.pointsSecurite[cle]}
              onChange={v => priorite(x => ({ ...x, pointsSecurite: { ...x.pointsSecurite, [cle]: v } }))}
            />
          ))}
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
          <ChampNombre
            id="r-n1"
            libelle="Niveau de difficulté 1 à partir de (points)"
            max={100}
            valeur={p.seuilNiveau1}
            onChange={v => priorite(x => ({ ...x, seuilNiveau1: v }))}
          />
          <ChampNombre
            id="r-n2"
            libelle="Niveau de difficulté 2 à partir de (points)"
            max={100}
            valeur={p.seuilNiveau2}
            onChange={v => priorite(x => ({ ...x, seuilNiveau2: v }))}
          />
        </div>

        <p className="hint sous-titre-grille">Points de besoin β selon le REM actuel (élèves par maître en poste)</p>
        <div className="param-grid">
          {p.tranchesBesoin.map((tranche, i) => (
            <ChampNombre
              key={tranche.remMax}
              id={`r-tr-${i}`}
              libelle={`REM jusqu’à ${tranche.remMax}`}
              max={50}
              valeur={tranche.points}
              onChange={v =>
                priorite(x => ({
                  ...x,
                  tranchesBesoin: x.tranchesBesoin.map((t, j) => (j === i ? { ...t, points: v } : t)),
                }))
              }
            />
          ))}
          <ChampNombre
            id="r-tr-au-dela"
            libelle="Au-delà, ou école sans maître"
            max={50}
            valeur={p.pointsBesoinAuDela}
            onChange={v => priorite(x => ({ ...x, pointsBesoinAuDela: v }))}
          />
        </div>
      </Panel>
    </>
  )
}
