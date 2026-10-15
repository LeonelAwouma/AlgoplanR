'use client'

/**
 * Règles de rotation et de redéploiement (§3.2 à §3.9) et taux d'attrition
 * du recrutement à prévoir (§2.6).
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
    cle: 'stabilitePourObligatoire',
    titre: 'Exiger la stabilité minimale pour un redéploiement obligatoire',
    texte: 'Un maître n’est déplacé d’office qu’après la même durée au poste qu’une demande de mutation.',
  },
  {
    cle: 'protegerProchesRetraite',
    titre: 'Protéger les enseignants proches de la retraite',
    texte: 'Ils ne reçoivent ni proposition hors vœux ni transfert imposé ; leurs vœux restent examinés.',
  },
  {
    cle: 'solutionProche',
    titre: 'Rechercher la solution la plus proche',
    texte:
      'Un candidat dont aucun vœu n’est satisfait reçoit le poste ouvert le plus proche de ses vœux, soumis à son accord.',
  },
  {
    cle: 'redeploiementObligatoire',
    titre: 'Simuler le redéploiement obligatoire',
    texte:
      'Les écoles restées non couvertes reçoivent un maître de l’école excédentaire la plus proche du même sous-système.',
  },
  {
    cle: 'regleZoneRouge',
    titre: 'Appliquer la règle de la zone rouge',
    texte:
      'Aucun poste en zone rouge n’est proposé hors vœux ni imposé : il n’est pourvu que par des volontaires ou par le recrutement.',
  },
  {
    cle: 'projectionN2',
    titre: 'Projeter le vivier sur l’année N+2',
    texte:
      'Les enseignants restés sans affectation sont rapprochés des postes qui doivent se libérer pendant l’année N+1.',
  },
  {
    cle: 'departageFeminin',
    titre: 'Nouveaux recrutés : à note égale, priorité à la candidate',
    texte:
      'Règle évoquée par le référentiel mais à vérifier au regard des dispositions applicables : désactivée par défaut.',
  },
]

export interface ProprietesReglesMobilite {
  parametres: EngineSettings
  maj: MajParametres
}

/** Panneaux « Rotation et redéploiement » et « Recrutement à prévoir ». */
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
          <Regle enonce="Chaque enseignant peut formuler au plus" htmlFor="r-voeux">
            <input
              id="r-voeux"
              type="number"
              min={1}
              max={3}
              value={m.nombreMaxVoeux}
              onChange={e => mobilite('nombreMaxVoeux', nombreSaisi(e.target.value))}
            />
            <span className="regle-unite">vœu(x)</span>
          </Regle>
          <Regle
            enonce="Les vœux de chaque enseignant sont examinés"
            precision="Dans l’ordre de l’enseignant, ajouter une école à sa liste ne peut jamais lui nuire. Par poids, un enseignant a intérêt à retirer une école difficile de sa liste."
            htmlFor="r-ordre"
          >
            <select
              id="r-ordre"
              value={m.ordreExamen}
              onChange={e => mobilite('ordreExamen', e.target.value as Regles['ordreExamen'])}
            >
              <option value="voeux">dans l’ordre choisi par l’enseignant (par défaut)</option>
              <option value="poids">de l’école la plus difficile à la plus facile (variante)</option>
            </select>
          </Regle>
          <Regle
            enonce="Un poste départage les candidats qui le demandent selon"
            precision="La note retient le score d’appariement Score(e, p) = Z1 × barème + Z2 × poids du poste + Z3 × proximité + Z4 × ajustements : à poste égal, le poids de l’individu l’emporte. Le score de priorité S = A + Z + B de l’ancien référentiel reste disponible en variante ; dans les deux cas l’appariement est l’acceptation différée."
            htmlFor="r-classement"
          >
            <select
              id="r-classement"
              value={m.classementCandidats}
              onChange={e => mobilite('classementCandidats', e.target.value as Regles['classementCandidats'])}
            >
              <option value="score_appariement">le score d’appariement Score(e, p) (note, par défaut)</option>
              <option value="score_priorite">le score de priorité S = A + Z + B (variante)</option>
            </select>
          </Regle>
          <Regle enonce="Un enseignant est considéré proche de la retraite à moins de" htmlFor="r-proche">
            <input
              id="r-proche"
              type="number"
              min={0}
              max={10}
              value={m.anneesAvantRetraite}
              onChange={e => mobilite('anneesAvantRetraite', nombreSaisi(e.target.value))}
            />
            <span className="regle-unite">ans de la retraite</span>
          </Regle>
        </div>
        <div className="switch-list">
          {INTERRUPTEURS.map(({ cle, titre, texte }) => (
            <Interrupteur key={cle} titre={titre} texte={texte} coche={m[cle]} onChange={v => mobilite(cle, v)} />
          ))}
        </div>
      </Panel>

      <Panel kicker="Recrutement à prévoir (§2.6)" title="Départs imprévisibles à anticiper">
        <div className="regles">
          <Regle
            enonce="Chaque année, hors retraites, quittent la profession"
            precision="Taux d’attrition τ* (définition UNESCO, indicateur ODD 4.c.6). Recrutement à prévoir = besoin restant après redéploiement + ⌈τ* × effectif ÷ 100⌉, par sous-système. La planification sur 5 ans a ses propres hypothèses."
            htmlFor="r-attrition"
          >
            <input
              id="r-attrition"
              type="number"
              min={0}
              max={20}
              step={0.1}
              value={parametres.recrutement.tauxAttritionHorsRetraite}
              onChange={e =>
                maj(s => ({ ...s, recrutement: { tauxAttritionHorsRetraite: nombreSaisi(e.target.value) } }))
              }
            />
            <span className="regle-unite">% des enseignants</span>
          </Regle>
        </div>
      </Panel>
    </>
  )
}
