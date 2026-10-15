'use client'

/**
 * Pondérations du barème individuel (étage 1) et du score d'appariement
 * enseignant ↔ poste (étage 2), avec leurs points complémentaires.
 */

import type { EngineSettings, ScoringConfig } from '@shared/api'
import { Panel } from '@shared/ui/commun'

import { reequilibrerPoids, sommePoids, type MajParametres } from '../../../domain/edition'
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

const LIBELLES_PROXIMITE: Record<keyof ScoringConfig['pointsProximite'], string> = {
  memeCommune: 'Même commune',
  memeIaeb: 'Même IAEB (dans le département)',
  memeDepartement: 'Même département',
  memeRegion: 'Même région',
  autre: 'Hors région',
}

const LIBELLES_AJUSTEMENTS: Record<keyof ScoringConfig['ajustements'], string> = {
  jeuneVersMultigrades: 'Jeune vers une école à classes multigrades',
  seniorVersEncadrement: 'Senior vers une structure d’encadrement',
  allegementSenior: 'Senior vers une école sans multigrade',
  transitionRuralUrbain: 'Rural vers urbain après 5 ans au poste',
  bonificationCiblee: 'Bonification ciblée (motif justifié)',
}

/** Sous-sections numériques du barème, éditées champ par champ. */
type SectionPoints = 'pointsProximite' | 'ajustements' | 'pointsCohorte' | 'seuils'

/** Curseur de pondération entre 0 et 1. */
function Curseur({
  id,
  libelle,
  valeur,
  onChange,
}: {
  id: string
  libelle: string
  valeur: number
  onChange: (v: number) => void
}) {
  return (
    <div className="slider-row">
      <label htmlFor={id}>{libelle}</label>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
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

  return (
    <>
      <Panel
        kicker="Barème individuel"
        title="Étage 1 — barème individuel"
        hint="C1 = ancienneté générale + points de zone difficile Z ; C2 = points d’ancienneté au poste A ; C3 = points de situation matrimoniale − points par enfant à charge ; C4 = formation continue (plafonnée) ; C5 = cohorte d’âge. Chaque critère est multiplié par son poids ; les cinq poids font 1. Le barème ordonne les départs imposés d’une école excédentaire (le plus élevé part le premier) et entre dans le score d’appariement. Un poids à 0 neutralise le critère."
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
          <ChampNombre
            id="e-enfant"
            libelle="C3 — points retirés par enfant à charge"
            max={10}
            valeur={scoring.pointsParEnfant}
            onChange={v => majScoring(s => ({ ...s, pointsParEnfant: v }))}
          />
          <ChampNombre
            id="e-formation"
            libelle="C4 — points par formation"
            max={10}
            valeur={scoring.pointsParFormation}
            onChange={v => majScoring(s => ({ ...s, pointsParFormation: v }))}
          />
          <ChampNombre
            id="e-formation-max"
            libelle="C4 — plafond"
            max={50}
            valeur={scoring.plafondFormation}
            onChange={v => majScoring(s => ({ ...s, plafondFormation: v }))}
          />
          {champSection('seuils', 'ageJeuneAns', 'C5 — jeune avant (ans)')}
          {champSection('seuils', 'ageSeniorAns', 'C5 — senior à partir de (ans)')}
          {champSection('pointsCohorte', 'jeune', 'C5 — points jeune')}
          {champSection('pointsCohorte', 'median', 'C5 — points médiane')}
          {champSection('pointsCohorte', 'senior', 'C5 — points senior')}
        </div>
      </Panel>

      <Panel
        kicker="Étage 2"
        title="Score d’appariement enseignant ↔ poste"
        hint="Score = Z1 × barème + Z2 × poids du poste u + Z3 × points de proximité + Z4 × ajustements. Il choisit, à proximité égale, le maître proposé en redéploiement obligatoire ; en variante (Référentiel), il classe aussi les candidats à une même école."
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
          {cles(LIBELLES_PROXIMITE).map(cle => champSection('pointsProximite', cle, LIBELLES_PROXIMITE[cle]))}
        </div>
        <p className="hint sous-titre-grille">Ajustements contextuels (points)</p>
        <div className="param-grid">
          {cles(LIBELLES_AJUSTEMENTS).map(cle => champSection('ajustements', cle, LIBELLES_AJUSTEMENTS[cle]))}
        </div>
      </Panel>
    </>
  )
}
