'use client'

/**
 * Pondérations du barème individuel (étage 1) et du score d'appariement
 * enseignant ↔ poste (étage 2), avec leurs points complémentaires.
 */

import type { EngineSettings, ScoringConfig } from '@shared/api'
import { Panel } from '@shared/ui/commun'

import { LIBELLES_AJUSTEMENTS, LIBELLES_PROXIMITE } from '../../../domain/champsMoteur'
import {
  reequilibrerPaire,
  reequilibrerPoids,
  sommePoids,
  VALEURS_ALGORITHME,
  type MajParametres,
} from '../../../domain/edition'
import { ChampNombre } from '../ChampsRegles'

const LIBELLES_BAREME: Record<keyof ScoringConfig['poidsBaremeIndividuel'], string> = {
  carriereZone: 'C1 — carrière et zone difficile',
  anciennetePoste: 'C2 — ancienneté au poste',
  chargesFamiliales: 'C3 — charges familiales',
  formationContinue: 'C4 — formation continue',
  cohorteAge: 'C5 — cohorte d’âge',
}

const LIBELLES_APPARIEMENT: Record<keyof ScoringConfig['poidsScoreAppariement'], string> = {
  bareme: 'Z1 — barème individuel',
  poidsPoste: 'Z2 — poids du poste (indice u)',
  proximite: 'Z3 — proximité',
  ajustements: 'Z4 — ajustements contextuels',
}

/** Sous-sections numériques du barème, éditées champ par champ. */
type SectionPoints = 'pointsProximite' | 'ajustements' | 'seuils'

/** Curseur de pondération entre 0 et 1. */
function Curseur({
  id,
  libelle,
  valeur,
  onChange,
  max = 1,
}: {
  id: string
  libelle: string
  valeur: number
  onChange: (v: number) => void
  max?: number
}) {
  return (
    <div className="slider-row">
      <label htmlFor={id}>{libelle}</label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={0.01}
        value={valeur}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="slider-value">{valeur.toFixed(2)}</span>
    </div>
  )
}

/**
 * Somme d'un groupe de poids. Elle vaut 1 dès qu'un curseur a été déplacé ; un
 * jeu de règles importé peut s'en écarter, ce qui est alors signalé.
 */
function SommePoids({ poids }: { poids: Record<string, number> }) {
  const somme = sommePoids(poids)
  const juste = somme === 1
  return (
    <p className={juste ? 'hint somme-poids' : 'hint somme-poids somme-poids-ecart'} role="status">
      Somme des poids : <strong>{somme.toFixed(2)}</strong>
      {juste
        ? ' — augmenter un poids diminue les autres en proportion, pour que la somme reste égale à 1.'
        : ' — la somme devrait valoir 1 : déplacez un curseur pour rééquilibrer les poids.'}
    </p>
  )
}

/** Clés d'un objet, typées. */
function cles<T extends object>(objet: T): (keyof T & string)[] {
  return Object.keys(objet) as (keyof T & string)[]
}

/** Panneaux « Barème individuel » et « Score d'appariement ». */
export function Ponderations({ parametres, maj }: { parametres: EngineSettings; maj: MajParametres }) {
  const scoring = parametres.scoring
  const majScoring = (transformation: (s: ScoringConfig) => ScoringConfig) =>
    maj(p => ({ ...p, scoring: transformation(p.scoring) }))

  /** Champ d'une sous-section numérique du barème. */
  const champSection = <S extends SectionPoints>(section: S, cle: keyof ScoringConfig[S] & string, libelle: string) => (
    <ChampNombre
      key={`${section}-${cle}`}
      id={`e-${section}-${cle}`}
      libelle={libelle}
      max={100}
      valeur={(scoring[section] as Record<string, number>)[cle]}
      onChange={v => majScoring(s => ({ ...s, [section]: { ...(s[section] as object), [cle]: v } }))}
    />
  )

  const priorite = parametres.priorite
  const appariement = scoring.poidsScoreAppariement
  const sommePaire = sommePoids({ a: appariement.bareme, b: appariement.poidsPoste })

  /** t1 + t2 = 1 : fixer l'un donne le complément à l'autre. */
  const majCoefficients = (accessibilite: number) =>
    maj(p => {
      const t1 = Math.round(Math.min(1, Math.max(0, accessibilite)) * 100) / 100
      return {
        ...p,
        priorite: { ...p.priorite, coefAccessibilite: t1, coefSecurite: Math.round((1 - t1) * 100) / 100 },
      }
    })
  const majPaire = (poidsEcole: number) =>
    majScoring(s => ({
      ...s,
      poidsScoreAppariement: reequilibrerPaire(s.poidsScoreAppariement, 'bareme', 'poidsPoste', poidsEcole),
    }))
  const retablirAlgorithme = () =>
    maj(p => ({
      ...p,
      priorite: {
        ...p.priorite,
        coefAccessibilite: VALEURS_ALGORITHME.coefAccessibilite,
        coefSecurite: VALEURS_ALGORITHME.coefSecurite,
      },
      scoring: { ...p.scoring, poidsScoreAppariement: { ...VALEURS_ALGORITHME.poidsScoreAppariement } },
    }))

  return (
    <>
      <Panel
        kicker="Barème individuel"
        title="Étage 1 — barème individuel"
        hint="C1 = ancienneté de carrière × multiplicateur de zone difficile ; C2 = ancienneté au poste ; C3 = points de situation matrimoniale − points par enfant à charge ; C4 = formation continue (plafonnée) ; C5 = cohorte d’âge. Chaque critère est multiplié par son poids ; les cinq poids font 1. Le barème ordonne les départs imposés d’une école excédentaire (le plus élevé part le premier) et entre dans le score d’appariement. Un poids à 0 neutralise le critère."
      >
        {cles(LIBELLES_BAREME).map(cle => (
          <Curseur
            key={cle}
            id={`e-bareme-${cle}`}
            libelle={LIBELLES_BAREME[cle]}
            valeur={scoring.poidsBaremeIndividuel[cle]}
            onChange={v =>
              majScoring(s => ({ ...s, poidsBaremeIndividuel: reequilibrerPoids(s.poidsBaremeIndividuel, cle, v) }))
            }
          />
        ))}
        <SommePoids poids={scoring.poidsBaremeIndividuel} />
        <div className="param-grid grille-espacee">
          {champSection('seuils', 'ageJeuneAns', 'C5 — jeune avant (ans)')}
          {champSection('seuils', 'ageSeniorAns', 'C5 — senior à partir de (ans)')}
        </div>
        <p className="hint">
          Fixés dans le moteur, donc non modifiables ici (non appliqués s’ils étaient saisis) : C3 retire{' '}
          {scoring.pointsParEnfant} points par enfant à charge ; C4 donne {scoring.pointsParFormation} points par
          formation, plafonnés à {scoring.plafondFormation} ; C5 vaut {scoring.pointsCohorte.jeune} (jeune),{' '}
          {scoring.pointsCohorte.median} (médiane) ou {scoring.pointsCohorte.senior} (senior).
        </p>
      </Panel>

      <Panel
        kicker="Étage 2"
        title="Poids de l’école (indice u)"
        hint="u = t1 × α + t2 × σ + β : α points d’accessibilité de l’école, σ points de sécurité, β points selon le nombre d’élèves par maître (REM). t1 et t2 pondèrent α et σ ; les valeurs de l’algorithme sont 0,30 et 0,70. Le poids de l’école u entre dans le score d’appariement par Z2, face au barème de l’enseignant Z1 : ce que l’un gagne, l’autre le perd."
      >
        <Curseur
          id="e-ecole-t1"
          libelle="t1 — accessibilité de l’école (α)"
          valeur={priorite.coefAccessibilite}
          onChange={v => majCoefficients(v)}
        />
        <Curseur
          id="e-ecole-t2"
          libelle="t2 — sécurité de l’école (σ)"
          valeur={priorite.coefSecurite}
          onChange={v => majCoefficients(1 - v)}
        />
        <p className="hint sous-titre-grille">Équilibre entre le barème de l’enseignant et le poids de l’école</p>
        <Curseur
          id="e-equilibre-bareme"
          libelle="Z1 — barème individuel de l’enseignant"
          valeur={appariement.bareme}
          max={sommePaire}
          onChange={v => majPaire(sommePaire - v)}
        />
        <Curseur
          id="e-equilibre-ecole"
          libelle="Z2 — poids de l’école (indice u)"
          valeur={appariement.poidsPoste}
          max={sommePaire}
          onChange={v => majPaire(v)}
        />
        <p className="hint somme-poids" role="status">
          Z1 + Z2 = <strong>{sommePaire.toFixed(2)}</strong> (constante) — le score d’appariement est recalculé avec ces
          poids à l’enregistrement.
        </p>
        <button type="button" className="btn btn-sm" onClick={retablirAlgorithme}>
          Valeurs de l’algorithme (t1 0,30 · t2 0,70 · Z 0,25 chacun)
        </button>
      </Panel>

      <Panel
        kicker="Étage 3"
        title="Score d’appariement enseignant ↔ poste"
        hint="Score = Z1 × barème + Z2 × poids du poste u + Z3 × points de proximité + Z4 × ajustements. Il classe les candidats à un même poste (acceptation différée) et choisit le meilleur poste libre des phases de proximité."
      >
        {cles(LIBELLES_APPARIEMENT).map(cle => (
          <Curseur
            key={cle}
            id={`e-app-${cle}`}
            libelle={LIBELLES_APPARIEMENT[cle]}
            valeur={scoring.poidsScoreAppariement[cle]}
            onChange={v =>
              majScoring(s => ({ ...s, poidsScoreAppariement: reequilibrerPoids(s.poidsScoreAppariement, cle, v) }))
            }
          />
        ))}
        <SommePoids poids={scoring.poidsScoreAppariement} />
        <p className="hint sous-titre-grille">Points de proximité</p>
        <div className="param-grid">
          {cles(LIBELLES_PROXIMITE).map(cle => champSection('pointsProximite', cle, LIBELLES_PROXIMITE[cle] ?? cle))}
        </div>
        <p className="hint sous-titre-grille">Ajustements contextuels (points)</p>
        <div className="param-grid">
          {cles(LIBELLES_AJUSTEMENTS).map(cle => champSection('ajustements', cle, LIBELLES_AJUSTEMENTS[cle]))}
        </div>
        <p className="hint">
          Bonification ciblée : l’agent cite dans son motif (colonne Motif_Bonification) l’une de ses écoles demandées ;
          les points ne vont qu’à cette école. Un motif qui ne désigne aucune école demandée ne rapporte aucun point.
        </p>
      </Panel>
    </>
  )
}
