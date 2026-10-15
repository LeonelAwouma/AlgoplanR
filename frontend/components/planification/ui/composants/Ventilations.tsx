'use client'

/**
 * Ventilations du tableau de planification : par territoire enfant (pour
 * descendre région → département → commune) et par sous-système. Un seul
 * indicateur est montré à la fois, année par année.
 */

import { useState } from 'react'

import { ANNEES_PLAN, type AnneePlan, type IdJeu, type IndicateursAnnee } from '@shared/api'
import { LIBELLE_SOUS_SYSTEME } from '@shared/kernel'
import { fmt } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import {
  useVentilationSousSystemes,
  useVentilationTerritoriale,
  type RequetePlanification,
} from '../../application/hooks'
import { LIGNES_INDICATEURS, valeurAbsente, type CleIndicateur } from '../../domain/indicateurs'

/** Sélecteur de l'indicateur ventilé. */
function ChoixIndicateur({
  valeur,
  onChange,
  id,
}: {
  valeur: CleIndicateur
  onChange: (c: CleIndicateur) => void
  id: string
}) {
  return (
    <div className="field">
      <label htmlFor={id}>Indicateur</label>
      <select id={id} value={valeur} onChange={e => onChange(e.target.value as CleIndicateur)}>
        {LIGNES_INDICATEURS.map(l => (
          <option key={l.cle} value={l.cle}>
            {l.libelle}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Cellules d'une ligne, une par année, pour l'indicateur choisi. */
function Cellules({ annees, indicateur }: { annees: IndicateursAnnee[]; indicateur: CleIndicateur }) {
  const parAnnee = new Map<AnneePlan, IndicateursAnnee>(annees.map(a => [a.annee, a]))
  return (
    <>
      {ANNEES_PLAN.map(annee => {
        const v = parAnnee.get(annee)?.[indicateur]
        return (
          <td key={annee} className="num">
            {v == null ? valeurAbsente(indicateur) : fmt(v)}
          </td>
        )
      })}
    </>
  )
}

export interface ProprietesVentilationTerritoriale {
  jeu: IdJeu
  requete: RequetePlanification
  /** Descend d'un niveau sur le territoire cliqué. */
  onExplorer: (nom: string) => void
}

/** Ventilation par territoire enfant. */
export function VentilationTerritoriale({ jeu, requete, onExplorer }: ProprietesVentilationTerritoriale) {
  const ventilation = useVentilationTerritoriale(jeu, requete)
  const [indicateur, setIndicateur] = useState<CleIndicateur>('besoinRestant')

  if (!ventilation.data) return <EtatRequetes requetes={[ventilation]} />

  return (
    <div className="stack-tight">
      <div className="param-grid">
        <ChoixIndicateur id="pl-ind-terr" valeur={indicateur} onChange={setIndicateur} />
      </div>
      {ventilation.data.lignes.length === 0 ? (
        <p className="hint">Aucun territoire plus fin sous ce périmètre.</p>
      ) : (
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Territoire</th>
                {ANNEES_PLAN.map(a => (
                  <th key={a} scope="col" className="num">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventilation.data.lignes.map(l => (
                <tr key={l.territoire.code}>
                  <th scope="row">
                    <button type="button" className="row-action" onClick={() => onExplorer(l.territoire.nom)}>
                      {l.territoire.nom}
                    </button>
                  </th>
                  <Cellules annees={l.annees} indicateur={indicateur} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Ventilation par sous-système. */
export function VentilationSousSystemes({ jeu, requete }: { jeu: IdJeu; requete: RequetePlanification }) {
  const ventilation = useVentilationSousSystemes(jeu, requete)
  const [indicateur, setIndicateur] = useState<CleIndicateur>('besoinRestant')

  if (!ventilation.data) return <EtatRequetes requetes={[ventilation]} />

  return (
    <div className="stack-tight">
      <div className="param-grid">
        <ChoixIndicateur id="pl-ind-ss" valeur={indicateur} onChange={setIndicateur} />
      </div>
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">Sous-système</th>
            {ANNEES_PLAN.map(a => (
              <th key={a} scope="col" className="num">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ventilation.data.lignes.map(l => (
            <tr key={l.sousSysteme}>
              <th scope="row">{LIBELLE_SOUS_SYSTEME[l.sousSysteme]}</th>
              <Cellules annees={l.annees} indicateur={indicateur} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
