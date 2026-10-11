'use client'

/**
 * Document du rapport décisionnel (§19), tel qu'il s'affiche et s'imprime :
 * page de garde, indicateurs clés, figures et sections rédigées par le serveur.
 * `window.print()` ne masque que la navigation : le document reste identique.
 */

import Image from 'next/image'
import { FileText } from 'lucide-react'

import type {
  BesoinTerritoireEnfant,
  DecisionReport,
  Enonce,
  FluxTerritorial,
  SimulationResult,
  TerritorialTotals,
} from '@shared/api'
import { LIBELLE_SCOPE, MENTION_SIMULATION } from '@shared/kernel'
import { fmt, fmtDec, fmtPct } from '@shared/ui/commun'
import { AvantApres, BarresHorizontales } from '@shared/ui/graphiques'

export interface ProprietesDocumentRapport {
  rapport: DecisionReport
  scenarioNom: string
  totals: TerritorialTotals
  resultat: SimulationResult | null
  besoins: BesoinTerritoireEnfant[]
  reduction: Enonce | null
  flux: FluxTerritorial | null
}

/** Document du rapport. */
export function DocumentRapport({
  rapport,
  scenarioNom,
  totals,
  resultat,
  besoins,
  reduction,
  flux,
}: ProprietesDocumentRapport) {
  const indicateurs: { label: string; valeur: string }[] = [
    { label: 'Établissements analysés', valeur: fmt(totals.ecolesAnalysees) },
    { label: 'Établissements en déficit', valeur: fmt(totals.ecolesEnDeficit) },
    { label: 'Postes nécessaires', valeur: fmt(totals.postesNecessaires) },
    { label: 'Enseignants redéployables', valeur: fmt(totals.excedentMobilisable) },
    { label: 'Postes couverts par simulation', valeur: resultat ? fmt(resultat.postesCouverts) : '—' },
    { label: 'Besoin résiduel', valeur: resultat ? fmt(resultat.besoinResiduel) : '—' },
    { label: 'Taux de couverture', valeur: resultat ? fmtPct(resultat.tauxCouverture) : '—' },
    { label: 'Élèves par enseignant État', valeur: fmtDec(totals.elevesParEnseignantEtat, 1) },
  ]

  return (
    <article className="report">
      {/* Page de garde : identifie sans ambiguïté ce qui a été calculé, sur quel
          périmètre et sous quelles hypothèses de scénario. */}
      <header className="report-cover">
        <Image className="report-logo" src="/logo-full.png" alt="Logo AlgoPlanR" width={640} height={424} />
        <p className="report-eyebrow">Rapport d’affectation des enseignants</p>
        <h1 className="report-title">{rapport.perimetre}</h1>
        <p className="report-subtitle">
          Analyse des besoins, répartition territoriale et simulation de scénarios d’affectation
        </p>

        <dl className="report-meta">
          <div>
            <dt>Territoire</dt>
            <dd>{rapport.perimetre}</dd>
          </div>
          <div>
            <dt>Année scolaire</dt>
            <dd>{rapport.anneeScolaire}</dd>
          </div>
          <div>
            <dt>Scénario</dt>
            <dd>
              {scenarioNom}
              {resultat && ` — périmètre ${LIBELLE_SCOPE[resultat.scope].toLowerCase()}`}
            </dd>
          </div>
          <div>
            <dt>Établi le</dt>
            <dd>{new Date(rapport.genereLe).toLocaleString('fr-FR')}</dd>
          </div>
        </dl>

        <p className="report-mention">{MENTION_SIMULATION}</p>
      </header>

      <section className="report-kpi-section">
        <h2>Indicateurs clés</h2>
        <dl className="report-kpi">
          {indicateurs.map(i => (
            <div key={i.label}>
              <dt>{i.label}</dt>
              <dd>{i.valeur}</dd>
            </div>
          ))}
        </dl>
      </section>

      {besoins.length > 0 && (
        <section className="report-figure">
          <h2>Besoins par territoire</h2>
          <BarresHorizontales
            titre="Postes nécessaires par territoire, part couverte et part restante"
            series={[
              { cle: 'couverts', label: 'Couverts par redéploiement', couleur: 'var(--serie-1)' },
              { cle: 'restant', label: 'Restant à pourvoir', couleur: 'var(--serie-4)', motif: 'hachures' },
            ]}
            donnees={besoins.map(b => ({
              cle: b.territoire.code,
              label: b.territoire.nom,
              valeurs: { couverts: b.couverts, restant: b.restant },
            }))}
            uniteValeur="postes"
          />
        </section>
      )}

      {resultat && (
        <section className="report-figure">
          <h2>Avant / Après simulation</h2>
          <AvantApres
            lignes={[
              {
                label: 'Établissements en déficit',
                avant: resultat.before.ecolesEnDeficit,
                apres: resultat.after.ecolesEnDeficit,
              },
              {
                label: 'Postes restant à pourvoir',
                avant: resultat.before.postesVacants,
                apres: resultat.after.postesVacants,
              },
            ]}
          />
          {reduction && <p className="report-highlight">{reduction.texte}</p>}
          {flux && !flux.autonome && (
            <p>
              Sur ce périmètre, {fmt(flux.enseignantsRecus)} enseignant(s) seraient reçus et{' '}
              {fmt(flux.enseignantsSortants)} cédé(s) à d’autres territoires, soit un solde de{' '}
              {flux.solde > 0 ? '+' : ''}
              {fmt(flux.solde)}.
            </p>
          )}
        </section>
      )}

      {rapport.sections.map(section => (
        <section key={section.titre}>
          <h2>{section.titre}</h2>
          {section.paragraphes.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {section.points && (
            <ul>
              {section.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          {section.tableau && (
            <table>
              <thead>
                <tr>
                  {section.tableau.entetes.map(e => (
                    <th key={e} scope="col">
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.tableau.lignes.map((ligne, i) => (
                  <tr key={i}>
                    {ligne.map((cellule, j) => (
                      <td key={j}>{typeof cellule === 'number' ? cellule.toLocaleString('fr-FR') : cellule}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      <footer className="report-footer">
        <p>
          <FileText size={14} aria-hidden="true" /> Document produit par ALGOPLANR sur ce poste, à partir des fichiers
          importés. Aucune donnée n’a été transmise à un service externe pour l’établir.
        </p>
      </footer>
    </article>
  )
}
