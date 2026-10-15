'use client'

/**
 * Hypothèses d'attrition hors retraite : méthode (taux unique, par
 * sous-système, par région), taux et niveau d'arrondi. Le serveur peut
 * proposer un taux à partir des données, sans l'enregistrer.
 */

import { Calculator } from 'lucide-react'

import type { Hypotheses, IdJeu, MethodeAttrition, NiveauTerritorial, SousSysteme } from '@shared/api'
import { LIBELLE_SOUS_SYSTEME, REGIONS_CAMEROUN } from '@shared/kernel'
import { Notice, Panel } from '@shared/ui/commun'
import { ErreurAction } from '@shared/ui/etats'

import { useEstimerAttrition } from '../../../application/hooks'
import { LIBELLE_METHODE_ATTRITION } from '../../../domain/hypotheses'
import { Justification } from './Justification'

type Attrition = Hypotheses['attrition']

/** Niveaux d'arrondi proposés. */
const NIVEAUX_ARRONDI: { valeur: NiveauTerritorial; libelle: string }[] = [
  { valeur: 'national', libelle: 'National' },
  { valeur: 'region', libelle: 'Région' },
  { valeur: 'departement', libelle: 'Département' },
  { valeur: 'commune', libelle: 'Commune' },
]

const SOUS_SYSTEMES: SousSysteme[] = ['francophone', 'anglophone']

export interface ProprietesHypothesesAttrition {
  jeu: IdJeu
  attrition: Attrition
  onChange: (attrition: Attrition) => void
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
        max={20}
        step={0.1}
        value={valeur}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}

/** Panneau « Attrition hors retraite ». */
export function HypothesesAttrition({ jeu, attrition, onChange }: ProprietesHypothesesAttrition) {
  const estimation = useEstimerAttrition(jeu)
  const e = estimation.data

  return (
    <Panel
      kicker="Attrition"
      title="Départs hors retraite"
      hint="Démissions, décès, détachements… La méthode officielle de calcul est à confirmer : la valeur retenue doit être documentée."
    >
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
        <div className="field">
          <label htmlFor="hy-arrondi">Arrondi appliqué au niveau</label>
          <select
            id="hy-arrondi"
            value={attrition.niveauArrondi}
            onChange={ev => onChange({ ...attrition, niveauArrondi: ev.target.value as NiveauTerritorial })}
          >
            {NIVEAUX_ARRONDI.map(n => (
              <option key={n.valeur} value={n.valeur}>
                {n.libelle}
              </option>
            ))}
          </select>
        </div>
        {attrition.methode === 'taux_unique' && (
          <Taux
            id="hy-taux"
            libelle="Taux annuel (%)"
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
        Arrondie territoire par territoire, l’attrition des régions peut dépasser le total national de quelques unités :
        le niveau d’arrondi fixe où l’arrondi s’applique.
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
