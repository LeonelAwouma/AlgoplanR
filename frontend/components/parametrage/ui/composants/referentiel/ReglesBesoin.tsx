'use client'

/**
 * Règles du besoin d'une école (§2.2 à §2.4) : norme d'encadrement, tolérance,
 * minimum pédagogique, retraite, double flux. Avec la période du plan, qui fixe la date des départs à la retraite.
 */

import type { EngineSettings, ReglesBesoin as Regles } from '@shared/api'
import { Panel } from '@shared/ui/commun'

import { nombreSaisi, type MajParametres } from '../../../domain/edition'
import { Interrupteur, Regle } from '../ChampsRegles'

export interface ProprietesReglesBesoin {
  parametres: EngineSettings
  maj: MajParametres
}

/** Panneaux « Période » et « Besoin d'une école ». */
export function ReglesBesoin({ parametres, maj }: ProprietesReglesBesoin) {
  const besoin = <K extends keyof Regles>(cle: K, valeur: Regles[K]) =>
    maj(s => ({ ...s, besoin: { ...s.besoin, [cle]: valeur } }))
  const b = parametres.besoin

  return (
    <>
      <Panel kicker="Période" title="Sur quelle rentrée porte le plan">
        <div className="regles">
          <Regle
            enonce="Le plan prépare la rentrée de l’année scolaire"
            precision="Fixée à la création du jeu de données (écran d’import) : elle date les projections et les rapports. Pour la changer, importez à nouveau le jeu."
            htmlFor="r-annee"
          >
            <input id="r-annee" type="text" readOnly value={parametres.anneeScolaire} />
          </Regle>
        </div>
      </Panel>

      <Panel
        kicker="Besoin d’une école (§2.2 à §2.4)"
        title="Combien de maîtres il faut, et combien les salles permettent d’en affecter"
        hint="Ces règles décident, pour chaque école, s’il lui manque des maîtres, si elle en a de trop, ou s’il lui manque des salles."
      >
        <div className="regles">
          <Regle
            enonce="La norme d’encadrement est d’un maître pour"
            precision="Note de cadrage : 60 élèves. Le moteur compte une première section jusqu’à la tolérance ci-dessous (20 par défaut) : 250 élèves demandent ⌈(250 − 20) ÷ 60⌉ = 4 maîtres."
            htmlFor="r-norme"
          >
            <input
              id="r-norme"
              type="number"
              min={20}
              max={120}
              value={b.elevesParMaitre}
              onChange={e => besoin('elevesParMaitre', nombreSaisi(e.target.value))}
            />
            <span className="regle-unite">élèves</span>
          </Regle>
          <Regle
            enonce="Avant d’ouvrir un poste, on tolère un dépassement de"
            precision="0 : arrondi supérieur strict. Avec 20 élèves, une école de 250 élèves ne demande plus que 4 maîtres."
            htmlFor="r-tolerance"
          >
            <input
              id="r-tolerance"
              type="number"
              min={0}
              max={59}
              value={b.toleranceArrondi}
              onChange={e => besoin('toleranceArrondi', nombreSaisi(e.target.value))}
            />
            <span className="regle-unite">élèves</span>
          </Regle>
          <Regle
            enonce="Pour le minimum pédagogique, un maître tient"
            precision="Avec 2 niveaux par maître, une école complète de 6 niveaux a besoin d’au moins 3 maîtres, quel que soit son effectif."
            htmlFor="r-niveaux"
          >
            <select
              id="r-niveaux"
              value={b.niveauxParMaitre}
              onChange={e => besoin('niveauxParMaitre', Number(e.target.value))}
            >
              <option value={1}>un seul niveau</option>
              <option value={2}>deux niveaux (classes multigrades)</option>
              <option value={3}>trois niveaux</option>
            </select>
          </Regle>
          <Regle
            enonce="Un enseignant part à la retraite à"
            precision="Les départs connus à la rentrée sont déduits de l’effectif ; ceux de l’année suivante alimentent la projection N+2."
            htmlFor="r-retraite"
          >
            <input
              id="r-retraite"
              type="number"
              min={50}
              max={70}
              value={b.ageRetraite}
              onChange={e => besoin('ageRetraite', nombreSaisi(e.target.value))}
            />
            <span className="regle-unite">ans</span>
          </Regle>
        </div>
        <div className="switch-list">
          <Interrupteur
            titre="Le double flux est autorisé"
            texte="Une salle utilisée en double flux compte pour deux maîtres dans BMAX. Désactivé, chaque salle compte pour un seul maître."
            coche={b.doubleFluxAutorise}
            onChange={v => besoin('doubleFluxAutorise', v)}
          />
          <Interrupteur
            titre="Minimum pédagogique école par école, selon ses classes multigrades"
            texte="Quand le fichier renseigne les classes multigrades : une école sans multigrade a un maître par niveau ouvert, chaque classe multigrade en économise un, sans descendre sous le regroupement ci-dessus. Désactivé, le regroupement s’applique à toutes les écoles."
            coche={b.minimumSelonMultigrades}
            onChange={v => besoin('minimumSelonMultigrades', v)}
          />
        </div>
      </Panel>
    </>
  )
}
