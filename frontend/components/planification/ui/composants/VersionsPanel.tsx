'use client'

/**
 * Versions de la planification, conservées à chaque recalcul, et comparaison
 * de deux versions indicateur par indicateur : c'est ainsi que l'on suit le
 * prévu et le réalisé d'une actualisation à l'autre.
 */

import { useState } from 'react'

import type { IdJeu } from '@shared/api'
import { Delta, fmt } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useComparaisonVersions, useVersionsPlanification } from '../../application/hooks'
import { libelleIndicateur } from '../../domain/indicateurs'

/** Onglet « Versions ». */
export function VersionsPanel({ jeu }: { jeu: IdJeu }) {
  const versions = useVersionsPlanification(jeu)
  const [de, setDe] = useState<number | null>(null)
  const [a, setA] = useState<number | null>(null)
  const comparaison = useComparaisonVersions(jeu, de, a)

  if (!versions.data) return <EtatRequetes requetes={[versions]} />
  if (versions.data.length === 0) return <p className="hint">Aucune version n’a encore été calculée.</p>

  const choix = (id: string, libelle: string, valeur: number | null, onChange: (v: number | null) => void) => (
    <div className="field">
      <label htmlFor={id}>{libelle}</label>
      <select id={id} value={valeur ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">— Choisir —</option>
        {versions.data.map(v => (
          <option key={v.version} value={v.version}>
            Version {v.version} — {new Date(v.calculeLe).toLocaleString('fr-FR')} ({v.declencheur})
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="stack">
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">Version</th>
            <th scope="col">Calculée le</th>
            <th scope="col">Déclencheur</th>
            <th scope="col">Par</th>
          </tr>
        </thead>
        <tbody>
          {versions.data.map(v => (
            <tr key={v.version}>
              <th scope="row">{v.version}</th>
              <td>{new Date(v.calculeLe).toLocaleString('fr-FR')}</td>
              <td>{v.declencheur}</td>
              <td>{v.auteur ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Comparer deux versions</h3>
      <div className="param-grid">
        {choix('pl-version-de', 'Version de référence', de, setDe)}
        {choix('pl-version-a', 'Version comparée', a, setA)}
      </div>

      {de !== null && a !== null && de !== a && (
        <>
          {!comparaison.data ? (
            <EtatRequetes requetes={[comparaison]} />
          ) : comparaison.data.ecarts.length === 0 ? (
            <p className="hint">Aucun écart entre ces deux versions.</p>
          ) : (
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">Année</th>
                  <th scope="col">Indicateur</th>
                  <th scope="col" className="num">
                    Version {de}
                  </th>
                  <th scope="col" className="num">
                    Version {a}
                  </th>
                  <th scope="col" className="num">
                    Écart
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparaison.data.ecarts.map(e => (
                  <tr key={`${e.annee}-${e.indicateur}`}>
                    <th scope="row">{e.annee}</th>
                    <td>{libelleIndicateur(e.indicateur)}</td>
                    <td className="num">{fmt(e.de)}</td>
                    <td className="num">{fmt(e.a)}</td>
                    <td className="num">
                      <Delta avant={e.de} apres={e.a} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
