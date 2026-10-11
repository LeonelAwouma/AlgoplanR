'use client'

/** Fiche lisible des hypothèses en vigueur et historique de leurs versions. */

import type { IdJeu } from '@shared/api'
import { Panel } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useDocumentationHypotheses, useHistoriqueHypotheses } from '../../../application/hooks'

/** Panneau « Documentation des hypothèses ». */
export function DocumentationHypotheses({ jeu }: { jeu: IdJeu }) {
  const documentation = useDocumentationHypotheses(jeu)
  if (!documentation.data) return <EtatRequetes requetes={[documentation]} />

  return (
    <Panel
      kicker="Documentation"
      title="Hypothèses en vigueur, en clair"
      hint="Cette fiche est reprise dans le rapport et dans la méthodologie."
    >
      {documentation.data.sections.map(section => (
        <section key={section.titre} className="notion">
          <h3 className="notion-titre">{section.titre}</h3>
          {section.paragraphes.map((p, i) => (
            <p key={i} className="texte-courant">
              {p}
            </p>
          ))}
        </section>
      ))}
    </Panel>
  )
}

/** Panneau « Historique des hypothèses ». */
export function HistoriqueHypotheses({ jeu }: { jeu: IdJeu }) {
  const historique = useHistoriqueHypotheses(jeu)
  if (!historique.data) return <EtatRequetes requetes={[historique]} />

  return (
    <Panel kicker="Traçabilité" title="Versions successives des hypothèses">
      {historique.data.length === 0 ? (
        <p className="hint">Les hypothèses n’ont pas été modifiées depuis leur valeur par défaut.</p>
      ) : (
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Modifiées le</th>
              <th scope="col">Par</th>
              <th scope="col">Motif</th>
            </tr>
          </thead>
          <tbody>
            {historique.data.map(v => (
              <tr key={v.version}>
                <th scope="row">{v.version}</th>
                <td>{new Date(v.modifieesLe).toLocaleString('fr-FR')}</td>
                <td>{v.modifieesPar ?? '—'}</td>
                <td>{v.motif}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}
