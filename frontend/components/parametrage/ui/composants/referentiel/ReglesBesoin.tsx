'use client'

/**
 * Règles du besoin d'une école : minimum pédagogique commun, norme d'encadrement et tolérance (méthode unique,
 * B = max(M ; max(1 ; ⌈(N − T) ÷ R⌉))), puis retraite et double flux. Avec la période du plan, qui fixe la date des départs à la retraite.
 */

import type { EngineSettings, ReglesBesoin as Regles } from '@shared/api'
import { Panel } from '@shared/ui/commun'

import { erreurNorme, erreurPlancher, erreurTolerance, nombreSaisi, type MajParametres } from '../../../domain/edition'
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
        kicker="Besoin d’une école"
        title="Minimum pédagogique commun"
        hint="Une seule méthode pour toutes les écoles : B = max(M ; max(1 ; ⌈(N − T) ÷ R⌉)). Les classes multigrades et les classes ouvertes n’interviennent pas dans le besoin. Après « Enregistrer », le diagnostic est recalculé et les simulations existantes sont signalées comme obsolètes."
      >
        <div className="regles">
          <Regle
            enonce="Minimum pédagogique commun M : toute école a au moins"
            precision="3 par défaut. Ce n’est pas un plafond : une école dont les effectifs le justifient a davantage d’enseignants (500 élèves : 8 avec M = 3, R = 60, T = 20)."
            htmlFor="r-plancher"
            erreur={erreurPlancher(b.plancherPedagogique)}
          >
            <input
              id="r-plancher"
              type="number"
              min={1}
              max={30}
              step={1}
              value={b.plancherPedagogique}
              aria-invalid={erreurPlancher(b.plancherPedagogique) !== null}
              onChange={e => besoin('plancherPedagogique', nombreSaisi(e.target.value))}
            />
            <span className="regle-unite">enseignants</span>
          </Regle>
          <Regle
            enonce="Norme d’encadrement R : un enseignant pour"
            precision="60 par défaut ; saisissez 74,4 pour le REM de référence du rapport MINEDUB d’octobre 2026. La décimale est conservée. Avec M = 3, R = 60 et T = 20 : 100 élèves donnent 3 enseignants, 300 élèves 5."
            htmlFor="r-norme"
            erreur={erreurNorme(b.elevesParMaitre)}
          >
            <input
              id="r-norme"
              type="number"
              min={20}
              max={120}
              step={0.1}
              value={b.elevesParMaitre}
              aria-invalid={erreurNorme(b.elevesParMaitre) !== null}
              onChange={e => besoin('elevesParMaitre', nombreSaisi(e.target.value))}
            />
            <span className="regle-unite">élèves</span>
          </Regle>
          <Regle
            enonce="Tolérance pédagogique T : les premiers"
            precision="20 par défaut. Ces élèves ne comptent pas dans le calcul : P = max(1 ; ⌈(N − T) ÷ R⌉). 0 : arrondi supérieur strict."
            htmlFor="r-tolerance"
            erreur={erreurTolerance(b.toleranceArrondi, b.elevesParMaitre)}
          >
            <input
              id="r-tolerance"
              type="number"
              min={0}
              max={59}
              value={b.toleranceArrondi}
              aria-invalid={erreurTolerance(b.toleranceArrondi, b.elevesParMaitre) !== null}
              onChange={e => besoin('toleranceArrondi', nombreSaisi(e.target.value))}
            />
            <span className="regle-unite">élèves</span>
          </Regle>
          <Regle
            enonce="Un enseignant part à la retraite à"
            precision="Cet âge exclut du vivier de mobilité les agents qui l’ont atteint, déclenche l’alerte du Prince et réduit le barème dans les cinq ans qui précèdent. La projection des départs N+1 à N+5 utilise, elle, l’âge légal des Hypothèses de calcul (Planification)."
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
        </div>
      </Panel>
    </>
  )
}
