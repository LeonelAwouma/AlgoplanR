'use client'

/**
 * Degré d'aléa : dans quelle mesure le nombre d'enseignants de chaque école suit
 * son nombre d'élèves. C'est 1 − R² de la régression linéaire des enseignants sur
 * les élèves, calculée par le serveur (rapport DRH) : 0 signifie un alignement
 * linéaire parfait, 1 aucun alignement. La page détaille le degré national et
 * celui de chaque région, avec l'écart à la moyenne nationale.
 */

import { selectionLevel } from '@shared/kernel'
import { useSession } from '@shared/session'
import type { LigneAlea } from '@shared/api'
import { DataTable, KpiCard, Notice, Panel, fmt, fmtDec, type Colonne } from '@shared/ui/commun'
import { ChargementEnCours, EtatRequetes } from '@shared/ui/etats'

import { useScenarioAffiche } from '@components/simulation'

import { useDegreAlea } from '../application/hooks'

/** Écart en points, avec son signe : « +0,12 », « −0,05 ». */
function ecartAffiche(ecart: number | null): string {
  if (ecart == null) return '—'
  if (ecart === 0) return '0,00'
  return `${ecart > 0 ? '+' : '−'}${fmtDec(Math.abs(ecart), 2)}`
}

/** Lecture de l'écart à la moyenne nationale, sans seuil inventé. */
function lectureEcart(ecart: number | null): string {
  if (ecart == null) return 'Non comparable'
  if (ecart > 0) return 'Au-dessus de la moyenne nationale'
  if (ecart < 0) return 'En dessous de la moyenne nationale'
  return 'Égal à la moyenne nationale'
}

/** Page « Degré d'aléa ». */
export function AleaPage() {
  const { jeu, filtres, explorerTerritoire } = useSession()
  const { scenario, detail } = useScenarioAffiche()
  const alea = useDegreAlea(jeu, {
    niveau: selectionLevel(filtres.territoire),
    region: filtres.territoire.region,
    departement: filtres.territoire.departement,
    commune: filtres.territoire.commune,
    scenario: scenario ?? undefined,
  })

  if (!jeu) return <ChargementEnCours />
  if (!alea.data) return <EtatRequetes requetes={[alea]} />

  const { national, regions } = alea.data
  // Les régions calculables d'abord, de la plus inégale à la plus alignée ; les autres à la suite.
  const triees = [...regions].sort((a, b) => (b.alea ?? -1) - (a.alea ?? -1))
  const calculables = triees.filter(r => r.alea != null)

  const colonnes: Colonne<LigneAlea>[] = [
    {
      cle: 'region',
      entete: 'Région',
      tri: r => r.region,
      rendu: r => (
        <button type="button" className="row-action" onClick={() => explorerTerritoire(r.region)}>
          <strong>{r.region}</strong>
        </button>
      ),
    },
    {
      cle: 'alea',
      entete: 'Degré d’aléa',
      numerique: true,
      tri: r => r.alea ?? -1,
      rendu: r =>
        r.alea == null ? <span title={r.raison ?? undefined}>—</span> : <strong>{fmtDec(r.alea, 2)}</strong>,
    },
    {
      cle: 'ecart',
      entete: 'Écart au national',
      numerique: true,
      tri: r => r.ecartNational ?? -99,
      rendu: r => <span title={lectureEcart(r.ecartNational)}>{ecartAffiche(r.ecartNational)}</span>,
    },
    {
      cle: 'lecture',
      entete: 'Lecture',
      rendu: r => (r.alea == null ? (r.raison ?? 'Non calculable') : lectureEcart(r.ecartNational)),
    },
    {
      cle: 'ecoles',
      entete: 'Écoles prises en compte',
      numerique: true,
      tri: r => r.ecolesAvecEleves,
      rendu: r => `${fmt(r.ecolesAvecEleves)} sur ${fmt(r.ecoles)}`,
    },
  ]

  return (
    <div className="stack">
      <Notice tone="info" title="Situation après simulation.">
        Le degré d’aléa est calculé sur les effectifs d’enseignants après les mouvements du scénario{' '}
        <strong>{detail?.scenario.nom ?? 'retenu'}</strong>, et sur les effectifs d’élèves déclarés.
      </Notice>
      <Notice tone="warn" title="Limite : valeurs non directement comparables à celles du rapport de référence.">
        Le rapport « Diagnostic de la politique enseignante » calcule l’aléa (1 − R²) sur les seuls enseignants payés
        par l’État. Les données importées n’ont qu’une colonne d’enseignants (<code>Enseignants_Actuels</code>) et ne
        distinguent pas ce statut : l’aléa affiché ici ne doit pas être comparé aux valeurs historiques du rapport (0,87
        au national en 2024-2025, par exemple).
      </Notice>

      <div className="kpi-row">
        <KpiCard
          label={`Degré d’aléa — ${alea.data.perimetre}`}
          value={fmtDec(national.alea, 2)}
          hint={
            national.alea == null
              ? (national.raison ?? 'Non calculable sur ce périmètre.')
              : '1 − R² : 0 = les enseignants suivent parfaitement les élèves, 1 = aucun alignement.'
          }
          tone={national.alea == null ? undefined : 'info'}
        />
        <KpiCard
          label="Régions comparées"
          value={fmt(calculables.length)}
          hint={`Sur ${fmt(regions.length)} région(s) du périmètre ; les autres ont trop peu d’écoles avec effectif d’élèves.`}
        />
        <KpiCard
          label="Écoles prises en compte"
          value={fmt(national.ecolesAvecEleves)}
          hint={`Écoles dont l’effectif d’élèves est connu, sur ${fmt(national.ecoles)} écoles du périmètre.`}
        />
      </div>

      <Panel
        kicker="Régions"
        title="Degré d’aléa par région"
        hint="Du plus inégal au plus aligné. Cliquez sur une région pour l’explorer."
      >
        {calculables.length === 0 ? (
          <p className="hint">Aucune région n’a assez d’écoles avec un effectif d’élèves connu pour calculer l’aléa.</p>
        ) : (
          <div className="chart" role="group" aria-label="Degré d’aléa par région">
            <div className="bar-rows">
              {calculables.map(r => (
                <div className="bar-row" key={r.region}>
                  <div className="bar-label">
                    <button type="button" onClick={() => explorerTerritoire(r.region)} title={`Explorer ${r.region}`}>
                      {r.region}
                    </button>
                  </div>
                  <div
                    className="bar-track"
                    role="img"
                    aria-label={`${r.region} — degré d’aléa ${fmtDec(r.alea, 2)}`}
                    style={{ width: `${Math.max(2, (r.alea ?? 0) * 100)}%` }}
                  >
                    <span className="bar-seg" style={{ width: '100%', background: 'var(--serie-1)' }} />
                  </div>
                  <div className="bar-values">
                    <span>
                      <b>{fmtDec(r.alea, 2)}</b>
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="hint">Échelle de 0 à 1 ; l’aléa national est de {fmtDec(national.alea, 2)}.</p>
          </div>
        )}
        <DataTable
          lignes={triees}
          colonnes={colonnes}
          cle={r => r.region}
          taillePage={30}
          legende="Degré d’aléa de chaque région"
          messageVide="Aucune région sur ce périmètre."
        />
      </Panel>

      <Panel kicker="Méthode" title="Comment lire le degré d’aléa">
        <ul className="reason-list">
          <li>
            <span>
              <strong className="texte-fort">Formule.</strong> Aléa = 1 − R², où R² est le coefficient de détermination
              de la régression linéaire du nombre d’enseignants sur le nombre d’élèves, école par école. Seules les
              écoles dont l’effectif d’élèves est connu y entrent.
            </span>
          </li>
          <li>
            <span>
              <strong className="texte-fort">Lecture.</strong> 0 : la répartition suit parfaitement les effectifs. 1 :
              aucun alignement linéaire. Une région au-dessus de la moyenne nationale répartit ses enseignants moins
              fidèlement selon ses effectifs.
            </span>
          </li>
          <li>
            <span>
              <strong className="texte-fort">Limite.</strong> L’indicateur mesure l’absence d’ajustement linéaire, pas
              directement le nombre d’enseignants mal affectés : une forte corrélation n’implique pas une dotation
              pédagogique correcte. Il n’est pas calculable avec moins de trois écoles ayant un effectif d’élèves, ni
              quand tous les effectifs sont identiques.
            </span>
          </li>
          <li>
            <span>
              <strong className="texte-fort">À ne pas confondre</strong> avec le taux de déséquilibre des dotations
              (besoin + excédent) ÷ somme des cibles, utilisé pour comparer les simulations.
            </span>
          </li>
        </ul>
      </Panel>
    </div>
  )
}
