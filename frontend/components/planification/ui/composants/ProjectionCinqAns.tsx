'use client'

/**
 * Onglet « Projection N+1 à N+5 » : lecture seule des chiffres du serveur.
 *
 * Rien ne se règle ni ne se calcule ici : les effectifs, départs, besoins, recrutements et le taux d’encadrement
 * viennent du tableau de planification du périmètre, calculé avec les hypothèses du jeu (retraite, attrition,
 * quotas). Pour les modifier,
 * il faut passer par « Hypothèses de calcul ». L'effectif de fin d'une année (S − R − A + Q) est celui de début de la
 * suivante.
 */

import { Download } from 'lucide-react'

import type { TableauPlanification } from '@shared/api'
import { exporterTableauXLSX } from '@shared/exports/export-xlsx'
import { KpiCard, Notice, Panel, fmt, fmtDec } from '@shared/ui/commun'
import { Colonnes, Combo } from '@shared/ui/graphiques'

import { AvisRetraites } from './AvisRetraites'

import {
  construireProjection,
  rupturesDeChainage,
  tauxAttritionApplique,
  totauxProjection,
  type LigneProjection,
} from '../../domain/projection'

const TIRET = '—'

const SERIE_EFFECTIF = [{ cle: 'fin', label: 'Effectif en fin d’année', couleur: 'var(--serie-1)' }]

/** Nombre entier, « — » s'il manque. */
const entier = (v: number | null): string => (v === null ? TIRET : fmt(v))

/** Évolution signée (+12, −3). */
function signe(v: number | null): string {
  if (v === null) return TIRET
  return v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(-v)}` : '0'
}

/** Exporte la projection affichée en Excel. */
function exporter(perimetre: string, lignes: LigneProjection[], retraitesInconnues: boolean) {
  void exporterTableauXLSX(
    `projection-n1-n5-${perimetre}.xlsx`,
    [
      'Année',
      'Effectif au début',
      'Retraites',
      'Attrition',
      'Directeurs déchargés',
      'Recrutements',
      'Effectif à la fin',
      'Évolution',
      'Besoin',
      'Quota calculé',
      'Taux d’encadrement projeté (élèves/enseignant)',
    ],
    lignes.map(l => [
      l.annee,
      l.effectifDebut,
      retraitesInconnues ? 'Non calculable' : l.departsRetraite,
      l.departsAttrition,
      l.directeursDecharges ?? '',
      l.recrutement ?? '',
      l.effectifFin ?? '',
      l.variation ?? '',
      l.besoin,
      l.quotaCalcule,
      l.rem ?? '',
    ]),
  )
}

/** Panneau « Projection N+1 à N+5 ». */
export function ProjectionCinqAns({ tableau }: { tableau: TableauPlanification }) {
  const lignes = construireProjection(tableau.annees)
  // Retraites non calculables : jamais un zéro, ni dans la colonne, ni dans le cumul.
  const retraitesInconnues = tableau.retraitesFiabilite?.statut === 'non_calculable'
  const totaux = totauxProjection(lignes)
  const ruptures = rupturesDeChainage(lignes)
  const taux = tauxAttritionApplique(lignes)
  // La courbe n'est tracée que si le taux est connu chaque année : une année non disponible n'est jamais dessinée à 0.
  const avecRem = lignes.length > 0 && lignes.every(l => l.rem !== null)
  const raisonRem = lignes.find(l => l.rem === null && l.remRaison)?.remRaison ?? null
  const donneesGraphique = lignes
    .filter(l => l.effectifFin !== null)
    .map(l => ({
      cle: l.annee,
      label: l.annee,
      valeurs: { fin: l.effectifFin ?? 0, ...(l.rem !== null ? { rem: l.rem } : {}) },
    }))
  const remMax = Math.max(1, ...lignes.map(l => l.rem ?? 0))
  const derniere = lignes[lignes.length - 1]?.annee ?? 'N+5'
  const duree = lignes.length === 1 ? 'une année' : `${lignes.length} ans`
  const quotasRetenus = lignes.some(l => l.quotaRetenu !== null)

  return (
    <div className="stack">
      <AvisRetraites fiabilite={tableau.retraitesFiabilite} />

      <Notice tone="info" title="Lecture seule : chiffres du serveur.">
        Cette projection est calculée par le serveur à partir des hypothèses du jeu
        {taux !== null ? ` (attrition hors retraite : ${fmtDec(taux, 2)} % par an)` : ''}. Elle ne se modifie pas ici :
        les hypothèses se règlent dans « Hypothèses de calcul ». Une projection n’est pas un engagement. L’effectif de
        fin est le stock administratif (début − retraites − attrition + recrutements) : les directeurs déchargés y
        restent et ne sont retirés que des enseignants disponibles pour tenir une classe, une seule fois.
      </Notice>

      {quotasRetenus && (
        <Notice tone="warn" title="Des quotas retenus modifient les effectifs.">
          Un quota retenu différent du quota calculé se reporte sur l’effectif des années suivantes. L’attrition de ces
          années reste calculée sur l’effectif avant ce report : l’égalité « taux × effectif de début » n’est alors
          qu’approchée. Le chaînage complet des quotas retenus n’est pas encore traité.
        </Notice>
      )}

      {ruptures.length > 0 && (
        <Notice tone="alert" title="Enchaînement des effectifs rompu.">
          L’effectif de fin ne reprend pas l’effectif de début de l’année suivante après {ruptures.join(', ')} : ces
          chiffres sont à signaler, ils ne devraient pas différer.
        </Notice>
      )}

      {totaux && (
        <div className="kpi-row">
          <KpiCard
            label="Évolution des effectifs"
            value={signe(totaux.variation)}
            hint={`De ${fmt(totaux.effectifInitial)} enseignants au début de N+1 à ${entier(totaux.effectifFinal)} à la fin de ${derniere}.`}
          />
          <KpiCard
            label="Départs à la retraite"
            value={retraitesInconnues ? 'Non calculable' : fmt(totaux.departsRetraite)}
            hint={
              retraitesInconnues
                ? 'Fichier nominatif des enseignants indisponible : aucun zéro n’est affiché.'
                : `Cumul sur ${duree}, comptés nominativement d’après l’âge${
                    tableau.retraitesFiabilite?.statut === 'partiel' ? ' (identifiées : total non exhaustif)' : ''
                  }.`
            }
          />
          <KpiCard
            label="Départs par attrition"
            value={fmt(totaux.departsAttrition)}
            hint={`Cumul sur ${duree} : taux des hypothèses × effectif de début de chaque année.`}
          />
          <KpiCard
            label="Recrutements"
            value={entier(totaux.recrutements)}
            hint="Quota retenu ou, à défaut, quota calculé, si les hypothèses supposent les quotas précédents réalisés ; sinon aucun."
          />
        </div>
      )}

      <Panel
        kicker={`Projection N+1 à ${derniere}`}
        title={`Effectifs, départs et recrutements — ${tableau.perimetre}`}
        hint={`Version ${tableau.version}, calculée le ${new Date(tableau.calculeLe).toLocaleString('fr-FR')}.`}
        actions={
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => exporter(tableau.perimetre, lignes, retraitesInconnues)}
          >
            <Download size={13} aria-hidden="true" /> Exporter (Excel)
          </button>
        }
        flush
      >
        <div className="table-scroll table-scroll-libre">
          <table className="compare-table tableau-planification">
            <thead>
              <tr>
                <th scope="col">Année</th>
                <th scope="col" className="num">
                  Effectif au début
                </th>
                <th scope="col" className="num">
                  Retraites
                </th>
                <th scope="col" className="num">
                  Attrition
                </th>
                <th scope="col" className="num">
                  Directeurs déchargés
                </th>
                <th scope="col" className="num">
                  Recrutements
                </th>
                <th scope="col" className="num">
                  Effectif à la fin
                </th>
                <th scope="col" className="num">
                  Évolution
                </th>
                <th scope="col" className="num">
                  Besoin
                </th>
                <th scope="col" className="num">
                  Quota calculé
                </th>
                <th scope="col" className="num">
                  Taux d’encadrement projeté
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(l => (
                <tr key={l.annee}>
                  <th scope="row">{l.annee}</th>
                  <td className="num">{fmt(l.effectifDebut)}</td>
                  <td className="num">{retraitesInconnues ? TIRET : fmt(l.departsRetraite)}</td>
                  <td className="num">{fmt(l.departsAttrition)}</td>
                  <td className="num">{entier(l.directeursDecharges)}</td>
                  <td className="num">{entier(l.recrutement)}</td>
                  <td className="num">{entier(l.effectifFin)}</td>
                  <td className="num">{signe(l.variation)}</td>
                  <td className="num">{fmt(l.besoin)}</td>
                  <td className="num">{fmt(l.quotaCalcule)}</td>
                  <td className="num">
                    {l.rem !== null ? (
                      fmtDec(l.rem, 1)
                    ) : l.remRaison ? (
                      <abbr title={l.remRaison}>Non disponible</abbr>
                    ) : (
                      TIRET
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        kicker="Évolution"
        title="Effectif en fin d’année et élèves par enseignant"
        hint="Les colonnes donnent l’effectif en fin d’année ; la courbe, le taux d’encadrement projeté (élèves des écoles dont l’effectif est connu ÷ enseignants au début de l’année), à titre indicatif."
      >
        {avecRem ? (
          <Combo
            titre="Effectif en fin d’année et taux d’encadrement projeté"
            series={SERIE_EFFECTIF}
            courbe={{
              cle: 'rem',
              label: 'Taux d’encadrement projeté',
              couleur: 'var(--violet)',
              format: v => fmtDec(v, 1),
              max: remMax * 1.1,
            }}
            donnees={donneesGraphique}
            vide="Aucun effectif projeté sur ce périmètre."
          />
        ) : (
          <Colonnes
            titre="Effectif en fin d’année"
            series={SERIE_EFFECTIF}
            donnees={donneesGraphique}
            vide="Aucun effectif projeté sur ce périmètre."
          />
        )}
        {!avecRem && raisonRem && (
          <p className="hint">Taux d’encadrement projeté non disponible pour certaines années : {raisonRem}</p>
        )}
      </Panel>
    </div>
  )
}
