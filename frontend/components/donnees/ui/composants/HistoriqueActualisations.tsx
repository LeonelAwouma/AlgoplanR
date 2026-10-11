'use client'

/** Historique des actualisations de l'exercice et écarts introduits par chacune. */

import { useState } from 'react'

import type { IdJeu } from '@shared/api'
import { Panel, fmt } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useActualisations, useEcartsActualisation } from '../../application/hooks'

/** Éléments listés par catégorie d'écart. */
const ELEMENTS_LISTES = 20

/** Détail des écarts d'une actualisation. */
function DetailEcarts({ jeu, actualisation }: { jeu: IdJeu; actualisation: string }) {
  const ecarts = useEcartsActualisation(jeu, actualisation)
  if (!ecarts.data) return <EtatRequetes requetes={[ecarts]} />
  const e = ecarts.data

  return (
    <div className="grid-2">
      <div>
        <h3>Arrivées ({fmt(e.arrivees.length)})</h3>
        <ul className="liste-compacte">
          {e.arrivees.slice(0, ELEMENTS_LISTES).map(a => (
            <li key={a.matricule}>
              {a.nom} ({a.matricule}) — {a.ecole}
            </li>
          ))}
        </ul>
        <h3>Départs ({fmt(e.departs.length)})</h3>
        <ul className="liste-compacte">
          {e.departs.slice(0, ELEMENTS_LISTES).map(d => (
            <li key={d.matricule}>
              {d.nom} ({d.matricule}) — {d.ecole}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Changements d’école ({fmt(e.changementsEcole.length)})</h3>
        <ul className="liste-compacte">
          {e.changementsEcole.slice(0, ELEMENTS_LISTES).map(c => (
            <li key={c.matricule}>
              {c.nom} : {c.ancienneEcole} → {c.nouvelleEcole}
            </li>
          ))}
        </ul>
        <h3>Décisions devenues invalides ({fmt(e.decisionsInvalidees.length)})</h3>
        <ul className="liste-compacte">
          {e.decisionsInvalidees.map(d => (
            <li key={`${d.type}-${d.id}`}>
              {d.type} {d.id} — {d.motif}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Panneau « Historique des actualisations ». */
export function HistoriqueActualisations({ jeu }: { jeu: IdJeu }) {
  const actualisations = useActualisations(jeu)
  const [choisie, setChoisie] = useState<string | null>(null)

  if (!actualisations.data) return <EtatRequetes requetes={[actualisations]} />

  return (
    <Panel kicker="Traçabilité" title={`${fmt(actualisations.data.length)} actualisation(s)`}>
      {actualisations.data.length === 0 ? (
        <p className="hint">Les données n’ont pas été actualisées depuis l’import initial.</p>
      ) : (
        <table className="compare-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Par</th>
              <th className="num">Arrivées</th>
              <th className="num">Départs</th>
              <th className="num">Changements</th>
              <th className="num">Décisions invalidées</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {actualisations.data.map(a => (
              <tr key={a.id} className={choisie === a.id ? 'ligne-active' : undefined}>
                <th scope="row">{new Date(a.realiseeLe).toLocaleString('fr-FR')}</th>
                <td>{a.realiseePar ?? '—'}</td>
                <td className="num">{fmt(a.resume.arrivees)}</td>
                <td className="num">{fmt(a.resume.departs)}</td>
                <td className="num">{fmt(a.resume.changementsEcole)}</td>
                <td className="num">{fmt(a.resume.decisionsInvalidees)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-expanded={choisie === a.id}
                    onClick={() => setChoisie(choisie === a.id ? null : a.id)}
                  >
                    {choisie === a.id ? 'Masquer' : 'Voir les écarts'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {choisie && <DetailEcarts jeu={jeu} actualisation={choisie} />}
    </Panel>
  )
}
