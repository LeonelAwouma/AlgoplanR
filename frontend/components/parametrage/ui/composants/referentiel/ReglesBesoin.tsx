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
            enonce="La norme d’encadrement (REM de référence) est d’un maître pour"
            precision="Rapport MINEDUB d’octobre 2026 : 74,4 élèves (60 dans l’ancienne note de cadrage). La décimale est conservée. Le moteur compte une première section jusqu’à la tolérance ci-dessous (20 par défaut) : 402 élèves demandent max(1 ; ⌈(402 − 20) ÷ 74,4⌉) = 6 maîtres."
            htmlFor="r-norme"
          >
            <input
              id="r-norme"
              type="number"
              min={20}
              max={120}
              step={0.1}
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
            enonce="Une classe multigrade réunit"
            precision="Sert à estimer les groupes pédagogiques G = 6 − classes multigrades (deux années par classe, sans chevauchement). Le minimum pédagogique vaut m = max(plancher ; G) : 0, 1, 2 ou 3 classes multigrades donnent 6, 5, 4 ou 3 maîtres."
            htmlFor="r-niveaux"
          >
            <select
              id="r-niveaux"
              value={b.niveauxParMaitre}
              onChange={e => besoin('niveauxParMaitre', Number(e.target.value))}
            >
              <option value={1}>une seule année (aucun regroupement)</option>
              <option value={2}>deux années d’études</option>
              <option value={3}>trois années d’études</option>
            </select>
          </Regle>
          {b.plancherPedagogique !== undefined && (
            <Regle
              enonce="Le minimum pédagogique ne descend pas sous"
              precision="Plancher de référence d’AlgoPlanR (3 par défaut) : hypothèse métier à valider administrativement, pas une norme réglementaire du rapport."
              htmlFor="r-plancher"
            >
              <input
                id="r-plancher"
                type="number"
                min={1}
                max={30}
                step={1}
                value={b.plancherPedagogique}
                onChange={e => besoin('plancherPedagogique', nombreSaisi(e.target.value))}
              />
              <span className="regle-unite">maîtres</span>
            </Regle>
          )}
          {b.groupesSecours !== undefined && (
            <Regle
              enonce="Quand les classes multigrades ne sont pas renseignées, on suppose"
              precision="Hypothèse technique de continuité (6 : école complète de six années, un groupe par année), en attendant des données plus précises. Ce n’est pas une norme : les besoins qui en dépendent sont signalés « provisoires »."
              htmlFor="r-secours"
            >
              <input
                id="r-secours"
                type="number"
                min={1}
                max={30}
                step={1}
                value={b.groupesSecours}
                onChange={e => besoin('groupesSecours', nombreSaisi(e.target.value))}
              />
              <span className="regle-unite">groupes</span>
            </Regle>
          )}
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
          <Interrupteur
            titre="Minimum pédagogique école par école, selon ses classes multigrades"
            texte="Classes_Multigrades est un nombre entier : chaque classe multigrade économise un maître, sans descendre sous le plancher. Une cellule vide n’est jamais lue comme « aucune classe multigrade ». Désactivé, toutes les années sont supposées regroupées par deux (comparaison avec l’hypothèse de trois groupes)."
            coche={b.minimumSelonMultigrades}
            onChange={v => besoin('minimumSelonMultigrades', v)}
          />
          {b.groupesDepuisClassesOuvertes !== undefined && (
            <Interrupteur
              titre="Les classes ouvertes donnent le nombre réel de groupes"
              texte="Quand le fichier renseigne Classes_Ouvertes (groupes-classes qui fonctionnent séparément), ce nombre prime sur l’estimation. Ni les salles ni les enseignants affectés ne servent à compter les groupes."
              coche={b.groupesDepuisClassesOuvertes}
              onChange={v => besoin('groupesDepuisClassesOuvertes', v)}
            />
          )}
          {b.mobiliserExcedentIncertain !== undefined && (
            <Interrupteur
              titre="Mobiliser sans validation l’excédent incertain"
              texte="Désactivé (recommandé) : la part de l’excédent qui dépend d’une hypothèse sur les groupes pédagogiques n’entre pas au vivier ; elle attend une vérification administrative."
              coche={b.mobiliserExcedentIncertain}
              onChange={v => besoin('mobiliserExcedentIncertain', v)}
            />
          )}
        </div>
      </Panel>
    </>
  )
}
