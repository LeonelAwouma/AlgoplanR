'use client'

/**
 * Hypothèses d'attrition hors retraite : méthode (taux unique, par
 * sous-système, par région), taux et niveau d'arrondi. Le serveur peut
 * proposer un taux à partir des données, sans l'enregistrer.
 */

import { Calculator } from 'lucide-react'

import type { Hypotheses, IdJeu, MethodeAttrition, ReferenceAttritionM1, SousSysteme } from '@shared/api'
import { LIBELLE_SOUS_SYSTEME, REGIONS_CAMEROUN } from '@shared/kernel'
import { Notice, Panel } from '@shared/ui/commun'
import { ErreurAction } from '@shared/ui/etats'

import { useEstimerAttrition } from '../../../application/hooks'
import { LIBELLE_METHODE_ATTRITION, STATUT_TAUX_ATTRITION } from '../../../domain/hypotheses'
import { Justification } from './Justification'

type Attrition = Hypotheses['attrition']

const SOUS_SYSTEMES: SousSysteme[] = ['francophone', 'anglophone']

export interface ProprietesHypothesesAttrition {
  jeu: IdJeu
  attrition: Attrition
  /** Référentiel M1 du rapport DRH (lecture seule), s'il est fourni par le serveur. */
  reference?: ReferenceAttritionM1 | null
  onChange: (attrition: Attrition) => void
}

const fr = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Bandeau du modèle M1 : attrition totale, retraites (calculées nominativement) et autres départs (appliqués). */
function BandeauM1({ reference, methode }: { reference: ReferenceAttritionM1; methode: MethodeAttrition }) {
  return (
    <Notice
      tone="info"
      title={`Modèle ${reference.modele} (${reference.perimetre}) : ${fr(reference.attritionTotalePct)} % d’attrition totale.`}
    >
      <ul className="hint">
        <li>
          Attrition totale : {fr(reference.attritionTotalePct)} % ± {fr(reference.intervalleConfiancePoints)} point (
          {reference.fenetreDonnees}, {reference.nombreRegions} régions, {reference.nombreTransitionsAnnuelles}{' '}
          transitions annuelles).
        </li>
        <li>
          dont {fr(reference.retraitesPct)} % de retraites : calculées nominativement d’après les dates de naissance,
          jamais par ce taux.
        </li>
        <li>
          et {fr(reference.autresDepartsPct)} % d’autres départs (mutations hors champ, abandons, décès) : c’est le taux
          appliqué ci-dessous par défaut.
        </li>
        <li>
          Statut du taux retenu : <strong>{STATUT_TAUX_ATTRITION[methode]}</strong> — jamais un taux observé sur ce jeu.
          Seule l’estimation à partir des données (bouton ci-dessous) est une valeur observée, et elle n’est pas
          enregistrée.
        </li>
      </ul>
    </Notice>
  )
}

/** Champ de taux en %. */
function Taux({
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
    <div className="field">
      <label htmlFor={id}>{libelle}</label>
      <input
        id={id}
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={valeur}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}

/** Panneau « Attrition hors retraite ». */
export function HypothesesAttrition({ jeu, attrition, reference, onChange }: ProprietesHypothesesAttrition) {
  const estimation = useEstimerAttrition(jeu)
  const e = estimation.data

  return (
    <Panel
      kicker="Attrition"
      title="Départs hors retraite"
      hint="Mutations hors champ, abandons, décès, détachements… Le modèle officiel M1 fixe 2,25 % par défaut (3,33 % d’attrition totale − 1,08 % de retraites calculées à part)."
    >
      {reference && <BandeauM1 reference={reference} methode={attrition.methode} />}
      <div className="param-grid">
        <div className="field">
          <label htmlFor="hy-methode">Méthode</label>
          <select
            id="hy-methode"
            value={attrition.methode}
            onChange={ev => onChange({ ...attrition, methode: ev.target.value as MethodeAttrition })}
          >
            {(Object.keys(LIBELLE_METHODE_ATTRITION) as MethodeAttrition[]).map(m => (
              <option key={m} value={m}>
                {LIBELLE_METHODE_ATTRITION[m]}
              </option>
            ))}
          </select>
        </div>
        {attrition.methode === 'taux_unique' && (
          <Taux
            id="hy-taux"
            libelle="Autres départs : taux annuel (%)"
            valeur={attrition.tauxUnique}
            onChange={v => onChange({ ...attrition, tauxUnique: v })}
          />
        )}
      </div>

      {attrition.methode === 'par_sous_systeme' && (
        <div className="param-grid">
          {SOUS_SYSTEMES.map(s => (
            <Taux
              key={s}
              id={`hy-taux-${s}`}
              libelle={`${LIBELLE_SOUS_SYSTEME[s]} (%)`}
              valeur={attrition.parSousSysteme[s] ?? attrition.tauxUnique}
              onChange={v => onChange({ ...attrition, parSousSysteme: { ...attrition.parSousSysteme, [s]: v } })}
            />
          ))}
        </div>
      )}

      {attrition.methode === 'par_region' && (
        <div className="param-grid">
          {REGIONS_CAMEROUN.map(r => (
            <Taux
              key={r}
              id={`hy-taux-${r}`}
              libelle={`${r} (%)`}
              valeur={attrition.parRegion[r] ?? attrition.tauxUnique}
              onChange={v => onChange({ ...attrition, parRegion: { ...attrition.parRegion, [r]: v } })}
            />
          ))}
        </div>
      )}

      <p className="hint">
        L’attrition est arrondie à l’entier le plus proche sur le territoire affiché : la somme des régions peut donc
        différer du total national de quelques unités. Le taux unique reste, quelle que soit la méthode, le taux de
        repli (région ou sous-système non renseigné).
      </p>

      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-sm"
          disabled={estimation.isPending}
          onClick={() => estimation.mutate()}
        >
          <Calculator size={13} aria-hidden="true" /> Estimer un taux à partir des données
        </button>
      </div>
      <ErreurAction erreur={estimation.error} />
      {e && (
        <Notice tone={e.tauxPropose == null ? 'warn' : 'info'} title="Estimation (non enregistrée).">
          {e.tauxPropose == null
            ? 'Les données ne permettent pas d’estimer un taux.'
            : `Taux proposé : ${e.tauxPropose.toLocaleString('fr-FR')} % (${e.methode}, sur ${e.base}).`}{' '}
          {e.avertissements.join(' ')}
        </Notice>
      )}

      <Justification
        id="hy-attrition"
        valeur={attrition}
        onChange={j => onChange({ ...attrition, source: j.source, justification: j.justification })}
      />
    </Panel>
  )
}
