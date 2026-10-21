'use client'

/**
 * Application des faits du Prince aux bases : combien de décisions sont acceptées, lesquelles portent une alerte,
 * lesquelles sont rejetées, et ce que cela change (enseignants, besoin total, écoles déficitaires).
 *
 * Le même résumé sert à l'état actuel et à l'aperçu d'un fichier, avant sa validation.
 */

import type { ApplicationPrince, DecisionApplicationPrince, IdJeu } from '@shared/api'
import { KpiCard, Notice, Panel, Pill, fmt } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useApplicationPrince } from '../../application/hooks'

/** Variation entre deux valeurs, avec son signe. */
function variation(avant: number, apres: number): string {
  const ecart = apres - avant
  if (ecart === 0) return '='
  return `${ecart > 0 ? '+' : '−'}${fmt(Math.abs(ecart))}`
}

/** Tableau « avant / après » des totaux. */
export function ComparaisonBases({ application }: { application: ApplicationPrince }) {
  const { avant, apres } = application
  const lignes: [string, number, number][] = [
    ['Enseignants déclarés', avant.enseignants, apres.enseignants],
    ['Besoin total (postes)', avant.besoinPostes, apres.besoinPostes],
    ['Écoles déficitaires', avant.ecolesDeficitaires, apres.ecolesDeficitaires],
  ]
  return (
    <table className="compare-table">
      <caption className="sr-only">Situation avant et après l’application des faits du Prince</caption>
      <thead>
        <tr>
          <th scope="col">Indicateur</th>
          <th scope="col">Avant</th>
          <th scope="col">Après</th>
          <th scope="col">Variation</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map(([libelle, a, b]) => (
          <tr key={libelle}>
            <th scope="row">{libelle}</th>
            <td>{fmt(a)}</td>
            <td>{fmt(b)}</td>
            <td>{variation(a, b)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Décisions à regarder : celles qui portent une alerte ou qui sont rejetées. */
function aSurveiller(application: ApplicationPrince): DecisionApplicationPrince[] {
  return application.decisions.filter(d => d.statut !== 'appliquee')
}

function ligneDecision(d: DecisionApplicationPrince) {
  const motifs = d.statut === 'rejetee' ? d.motifsRejet : d.alertes
  return (
    <li key={d.ordre}>
      <Pill tone={d.statut === 'rejetee' ? 'alert' : 'warn'}>
        {d.statut === 'rejetee' ? 'Rejetée' : 'Appliquée avec alerte'}
      </Pill>{' '}
      <strong>{d.enseignant}</strong> ({d.matricule}) → {d.nomEcoleDestination || d.ecoleDestination}
      {d.nouvelle && <small> · nouvelle</small>}
      <small className="motif-etroit">{motifs.join(' ; ')}</small>
    </li>
  )
}

/** Cartes de synthèse, comparaison avant / après, alertes et écarts d'effectifs d'une application. */
export function ResumeApplication({ application }: { application: ApplicationPrince }) {
  const { resume } = application
  const aVoir = aSurveiller(application)
  return (
    <div className="stack">
      <div className="kpi-row">
        <KpiCard
          label="Décisions identifiées"
          value={fmt(resume.identifiees)}
          hint="Lignes du fichier ou faits actifs."
        />
        <KpiCard
          label="Acceptées"
          value={fmt(resume.appliquees)}
          hint="Appliquées aux bases avant l’algorithme."
          tone="ok"
        />
        <KpiCard
          label="Alertes"
          value={fmt(resume.avecAlerte)}
          hint="Appliquées, mais à vérifier : école d’origine sans excédent, sous-système, capacité…"
          tone={resume.avecAlerte > 0 ? 'warn' : undefined}
        />
        <KpiCard
          label="Rejetées"
          value={fmt(resume.rejetees)}
          hint="Non appliquées : le motif figure dans le journal."
          tone={resume.rejetees > 0 ? 'alert' : undefined}
        />
      </div>

      <ComparaisonBases application={application} />

      {aVoir.length > 0 && (
        <div>
          <h3 className="titre-section">À vérifier</h3>
          <ul className="reason-list">{aVoir.map(ligneDecision)}</ul>
        </div>
      )}

      {application.ecartsEffectifs.length > 0 && (
        <Notice tone="alert" title="Effectifs à réconcilier avant de valider le jeu.">
          L’effectif déclaré de {fmt(application.ecartsEffectifs.length)} école(s) touchée(s) diffère du nombre de
          matricules qui leur sont rattachés (par exemple {application.ecartsEffectifs[0].nomEcole} :{' '}
          {fmt(application.ecartsEffectifs[0].enseignantsDeclares)} déclarés,{' '}
          {fmt(application.ecartsEffectifs[0].matriculesRattaches)} matricules). Les effectifs déclarés font foi ; seuls
          les transferts retenus les modifient (−1 à l’origine, +1 à la destination). Pour ces écoles, l’écart bloque la
          validation du jeu : un fait du Prince déplace un matricule réel.
        </Notice>
      )}
    </div>
  )
}

/** Panneau « Application aux bases » : l'état actuel des faits actifs. */
export function ApplicationAuxBases({ jeu }: { jeu: IdJeu }) {
  const application = useApplicationPrince(jeu)
  if (!application.data) return <EtatRequetes requetes={[application]} />

  return (
    <Panel
      kicker="Prétraitement"
      title="Faits du Prince appliqués aux bases"
      hint="Les décisions sont appliquées avant l’algorithme : chaque enseignant déplacé est rattaché à sa nouvelle école, les effectifs et les indicateurs des deux écoles sont recalculés, puis les besoins, le vivier et les postes ouverts sont calculés sur ces bases."
    >
      {application.data.resume.identifiees === 0 ? (
        <Notice tone="info" title="Aucun fait de Prince.">
          Les bases restent celles qui ont été importées : vous pouvez poursuivre. Les décisions saisies ou importées
          ci-dessous seront appliquées avant tout calcul.
        </Notice>
      ) : (
        <ResumeApplication application={application.data} />
      )}
    </Panel>
  )
}
