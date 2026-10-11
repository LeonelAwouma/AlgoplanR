'use client'

/**
 * Situation du périmètre : volumes observés, besoins et excédents, répartition
 * par territoire et distribution du rapport élèves par maître. Cette page ne
 * présente que des constats ; les propositions relèvent des simulations.
 */

import { useMemo } from 'react'

import { libelleNiveauSous, selectionLevel } from '@shared/kernel'
import { useSession } from '@shared/session'
import { Panel, fmt, fmtDec } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { Colonnes, Histogramme, construireClasses } from '@shared/ui/graphiques'
import { useParametres } from '@components/parametrage'
import { useScenarioAffiche } from '@components/simulation'

import { useDiagnostic, useSynthese, useVueTerritoriale } from '../application/hooks'
import { EnoncesSynthese } from './composants/EnoncesSynthese'
import { PointsAttention } from './composants/PointsAttention'

/** Nombre de classes de l'histogramme du REM. */
const CLASSES_REM = 9

/** Nombre de territoires mixtes cités. */
const MIXTES_CITES = 5

/** Valeur numérique, ou « Non renseigné ». */
function renseigne(valeur: number | null): string {
  return valeur == null ? 'Non renseigné' : fmt(valeur)
}

/** Page « Situation nationale ». */
export function SituationNationalePage() {
  const { jeu, filtres, mode, explorerTerritoire } = useSession()
  const { scenario } = useScenarioAffiche()

  const diagnostic = useDiagnostic(jeu, filtres)
  const synthese = useSynthese(jeu, filtres, scenario)
  const vue = useVueTerritoriale(jeu, filtres, null)
  const parametres = useParametres(jeu)

  /**
   * Distribution du rapport élèves par maître actuel, lue contre la norme
   * configurée : le repère sépare les écoles sous pression des autres. Le
   * découpage en classes est un choix de présentation du graphique.
   */
  const distribution = useMemo(
    () =>
      construireClasses(
        (diagnostic.data?.ecoles ?? []).map(d => d.calcul.remActuel).filter((v): v is number => v != null),
        CLASSES_REM,
      ),
    [diagnostic.data],
  )

  if (!diagnostic.data || !synthese.data || !vue.data) {
    return <EtatRequetes requetes={[diagnostic, synthese, vue]} />
  }

  const { totals } = diagnostic.data
  const niveauEnfants = libelleNiveauSous(selectionLevel(filtres.territoire))
  const mixtes = synthese.data.territoiresMixtes

  return (
    <div className="stack">
      <Panel kicker="Diagnostic automatique" title={`Situation — ${synthese.data.perimetre}`}>
        <EnoncesSynthese enonces={synthese.data.diagnosticTerritorial} afficherRegles={mode === 'analyste'} />
      </Panel>

      <div className="grid-2">
        <Panel kicker="Volumes" title="Ressources observées">
          <dl className="def-grid">
            <div>
              <dt>Établissements analysés</dt>
              <dd>{fmt(totals.ecolesAnalysees)}</dd>
            </div>
            <div>
              <dt>Classes</dt>
              <dd>{fmt(totals.classes)}</dd>
            </div>
            <div>
              <dt>Enseignants payés par l’État</dt>
              <dd>{fmt(totals.enseignantsEtat)}</dd>
            </div>
            <div>
              <dt>Autres enseignants</dt>
              <dd>{renseigne(totals.autresEnseignants)}</dd>
            </div>
            <div>
              <dt>Élèves</dt>
              <dd>{renseigne(totals.effectifTotalEleves)}</dd>
            </div>
            <div>
              <dt>Classes multigrades</dt>
              <dd>{fmt(totals.classesMultigrades)}</dd>
            </div>
          </dl>
        </Panel>

        <Panel kicker="Écarts" title="Besoins et excédents">
          <dl className="def-grid">
            <div>
              <dt>Postes nécessaires (calculés)</dt>
              <dd>{fmt(totals.postesNecessaires)}</dd>
            </div>
            <div>
              <dt>Postes officiellement déclarés</dt>
              <dd>{renseigne(totals.postesDeclares)}</dd>
            </div>
            <div>
              <dt>Écart déclaré / calculé</dt>
              <dd>{totals.postesDeclares == null ? '—' : fmt(totals.postesDeclares - totals.postesNecessaires)}</dd>
            </div>
            <div>
              <dt>Enseignants redéployables</dt>
              <dd>{fmt(totals.excedentMobilisable)}</dd>
            </div>
            <div>
              <dt>Élèves par enseignant État</dt>
              <dd>{fmtDec(totals.elevesParEnseignantEtat, 1)}</dd>
            </div>
            <div>
              <dt>Élèves par classe</dt>
              <dd>{fmtDec(totals.elevesParClasse, 1)}</dd>
            </div>
          </dl>
          {totals.effectifTotalEleves == null && (
            <p className="hint">
              Données élèves indisponibles — certains indicateurs pédagogiques ne peuvent pas être calculés.
            </p>
          )}
        </Panel>
      </div>

      <Panel
        kicker="Territoires"
        title="Répartition des besoins et des excédents"
        hint="Un territoire où les deux coexistent peut réduire son déficit sans mouvement longue distance."
      >
        <Colonnes
          titre={`Postes nécessaires et excédents mobilisables par ${niveauEnfants}`}
          series={[
            { cle: 'besoin', label: 'Postes nécessaires', couleur: 'var(--serie-4)', motif: 'hachures' },
            { cle: 'excedent', label: 'Enseignants redéployables', couleur: 'var(--serie-1)' },
          ]}
          donnees={vue.data.enfants.map(r => ({
            cle: r.territory.code,
            label: r.territory.nom,
            valeurs: { besoin: r.totals.postesNecessaires, excedent: r.totals.excedentMobilisable },
            onSelect: () => explorerTerritoire(r.territory.nom),
          }))}
          unite="postes"
        />
        {mixtes.length > 0 && (
          <p className="hint">
            Territoires où excédents et déficits coexistent :{' '}
            {mixtes
              .slice(0, MIXTES_CITES)
              .map(t => t.territory.nom)
              .join(', ')}
            .
          </p>
        )}
      </Panel>

      <Panel
        kicker="Encadrement"
        title="Comment se répartit le rapport élèves / maître (REM)"
        hint="Nombre d’établissements par tranche de REM actuel. Les établissements situés à droite du repère dépassent la norme de la note de cadrage : un REM supérieur signale une pression d’encadrement, un REM inférieur ne suffit pas à conclure à un excédent."
      >
        <Histogramme
          titre="Répartition des établissements par REM actuel"
          classes={distribution}
          repere={parametres.data ? { valeur: parametres.data.besoin.elevesParMaitre, label: 'Norme' } : undefined}
          vide="Aucun établissement exploitable pour construire cette distribution."
        />
      </Panel>

      <PointsAttention points={synthese.data.pointsAttention} />
    </div>
  )
}
