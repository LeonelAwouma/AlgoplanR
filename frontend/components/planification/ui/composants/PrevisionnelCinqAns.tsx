'use client'

/**
 * « Projection sur 5 ans » : tableau prévisionnel complet du périmètre (base, N+1 à N+5), en cinq groupes
 * (élèves, ressources humaines, besoins pédagogiques, scénarios de recrutement, encadrement).
 *
 * Tout vient du serveur (`planification/previsionnel/`) : le tableau, les graphiques et les exports lisent les mêmes
 * lignes. La vue Décideur donne les chiffres clés, la comparaison des scénarios et les graphiques ; la vue Analyste
 * ajoute le tableau complet, la nature de chaque valeur, les hypothèses et les données non disponibles.
 */

import { Download, FileText } from 'lucide-react'

import type { IdJeu, LignePrevisionnel, NatureValeur } from '@shared/api'
import { useSession } from '@shared/session'
import { KpiCard, Notice, Panel, Pill, fmt, fmtDec, type Tone } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { Aires, Colonnes } from '@shared/ui/graphiques'

import { exporterPrevisionnelExcel, exporterPrevisionnelWord } from '../../application/export-previsionnel'
import { usePrevisionnel, type RequetePlanification } from '../../application/hooks'
import {
  ENTETES_SCENARIOS,
  LIBELLE_NATURE,
  ORDRE_SCENARIOS,
  ligne,
  lignesFiabilite,
  lignesScenarios,
  pointsEleves,
  pointsEnseignants,
  pointsRecrutements,
  pointsRem,
  raisonsIndisponibles,
  renvoi,
  scenario,
  syntheseDecideur,
} from '../../domain/previsionnel'

const TIRET = '—'
const COULEURS_SCENARIOS = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-4)', 'var(--serie-5)']

const TON_NATURE: Record<NatureValeur, Tone> = {
  observe: 'neutral',
  estime: 'info',
  hypothese: 'warn',
  provisoire: 'warn',
}

/** Valeur d'une cellule ; une valeur absente est « non disponible », jamais 0. */
function cellule(l: LignePrevisionnel, v: number | null): string {
  if (v === null) return TIRET
  const n = l.decimal ? fmtDec(v, 1) : fmt(v)
  return l.unite === 'pourcentage' ? `${n} %` : n
}

const entier = (v: number | null) => (v === null ? 'Non disponible' : fmt(v))
const decimal = (v: number | null) => (v === null ? 'Non disponible' : fmtDec(v, 1))

/** Panneau « Projection sur 5 ans ». */
export function PrevisionnelCinqAns({ jeu, requete }: { jeu: IdJeu; requete: RequetePlanification }) {
  const { mode } = useSession()
  const requeteP = usePrevisionnel(jeu, requete)
  const p = requeteP.data
  if (!p) return <EtatRequetes requetes={[requeteP]} />

  const analyste = mode === 'analyste'
  const s = syntheseDecideur(p)
  const seriesScenarios = ORDRE_SCENARIOS.map((code, i) => ({
    cle: code,
    label: scenario(p, code)?.libelle ?? code,
    couleur: COULEURS_SCENARIOS[i],
  }))
  // Le REM n'est tracé que pour les années où il est calculable pour tous les scénarios : une valeur absente n'est
  // jamais dessinée à 0.
  const rem = pointsRem(p).filter(pt => ORDRE_SCENARIOS.every(c => pt.valeurs[c] !== undefined))
  const recrutementsBesoin = scenario(p, 'besoin')
  const raisons = raisonsIndisponibles(p)
  const f = p.fiabilite

  return (
    <Panel
      kicker="Planification – Projection sur 5 ans"
      title={`Tableau prévisionnel — ${p.perimetre}`}
      hint={`REM de référence : ${fmtDec(p.remReference, 1)} élèves par enseignant. ${fmt(p.ecoles)} école(s) dans le périmètre.`}
      actions={
        <>
          <button type="button" className="btn btn-sm" onClick={() => void exporterPrevisionnelExcel(p)}>
            <Download size={13} aria-hidden="true" /> Excel
          </button>{' '}
          <button type="button" className="btn btn-sm" onClick={() => void exporterPrevisionnelWord(p)}>
            <FileText size={13} aria-hidden="true" /> Word
          </button>
        </>
      }
    >
      <div className="stack">
        {p.messageMinimumProvisoire && (
          <Notice
            tone="warn"
            title={`${fmt(p.ecolesMinimumProvisoire)} école(s) au minimum pédagogique provisoire${
              f ? `, dont ${fmt(f.besoinProvisoire)} au besoin final provisoire` : ''
            }.`}
          >
            {p.messageMinimumProvisoire}
            {f && f.minimumProvisoireSansEffet > 0 && (
              <>
                {' '}
                Pour {fmt(f.minimumProvisoireSansEffet)} de ces écoles, le besoin final ne dépend pas de cette
                information : il est fixé par l’effectif d’élèves ou par les salles.
              </>
            )}
          </Notice>
        )}
        {p.avertissementPersonnels && (
          <Notice tone="neutral" title="Personnels enseignants.">
            {p.avertissementPersonnels}
          </Notice>
        )}
        {raisons.length > 0 && (
          <Notice tone="neutral" title="Valeurs non disponibles.">
            {raisons.map((r, i) => (
              <span key={r.raison} className="ligne-detail">
                <strong>({i + 1})</strong> {r.cellules.join(' ; ')}. {r.raison}
              </span>
            ))}
          </Notice>
        )}

        <div className="kpi-row">
          <KpiCard
            label="Élèves attendus"
            value={entier(s.elevesFin)}
            hint={`${entier(s.elevesBase)} à la base${p.anneeBase ? ` (${p.anneeBase})` : ''}, ${s.derniere} en fin d’horizon (croissance des hypothèses).`}
          />
          <KpiCard
            label="Départs sur l’horizon"
            value={fmt(s.departs)}
            hint={`Dont ${fmt(s.retraites)} retraites nominatives ; le reste par attrition hors retraite.`}
          />
          <KpiCard
            label="Recrutements S-besoin"
            value={entier(s.recrutementsBesoin)}
            hint={`Pour approcher le REM de référence ; ${entier(s.recrutementsPlafond)} sous plafond budgétaire.`}
          />
          <KpiCard
            label="REM actuel"
            value={decimal(s.remBase)}
            hint={`Référence ${fmtDec(s.remReference, 1)} ; ${recrutementsBesoin?.remFinal != null ? `${fmtDec(recrutementsBesoin.remFinal, 1)} en fin d’horizon avec S-besoin` : 'fin d’horizon non calculable'}.`}
          />
        </div>

        <h3 className="titre-section">Comparaison des scénarios</h3>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                {ENTETES_SCENARIOS.map((e, i) => (
                  <th key={e} scope="col" className={i > 0 ? 'num' : undefined}>
                    {e}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignesScenarios(p).map((l, k) => {
                const remScenario = ligne(p, `rem_${ORDRE_SCENARIOS[k]}`)
                const n = remScenario ? renvoi(raisons, remScenario, p.annees.length - 1) : null
                return (
                  <tr key={String(l[0])}>
                    <th scope="row">{l[0]}</th>
                    {l.slice(1).map((v, i) => (
                      <td key={i} className="num">
                        {v === null
                          ? `Non disponible${n ? ` (${n})` : ''}`
                          : typeof v === 'number'
                            ? i >= 3
                              ? fmtDec(v, 1)
                              : fmt(v)
                            : v}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="grid-2">
          <figure className="stack">
            <figcaption className="hint">
              Élèves attendus et enseignants nécessaires au REM de référence (C).
            </figcaption>
            <Colonnes
              titre="Élèves attendus"
              series={[{ cle: 'eleves', label: 'Élèves', couleur: 'var(--serie-1)' }]}
              donnees={pointsEleves(p)}
              vide="Effectif d’élèves non disponible."
            />
          </figure>
          <figure className="stack">
            <figcaption className="hint">
              Stock administratif S, enseignants disponibles U = S − H et enseignants nécessaires C (scénario retenu).
            </figcaption>
            <Aires
              titre="Enseignants"
              remplir={false}
              series={[
                { cle: 'stock', label: 'Stock S', couleur: 'var(--serie-1)' },
                { cle: 'disponibles', label: 'Disponibles U', couleur: 'var(--serie-2)' },
                { cle: 'necessaires', label: 'Nécessaires C', couleur: 'var(--serie-4)' },
              ]}
              donnees={pointsEnseignants(p)}
            />
          </figure>
          <figure className="stack">
            <figcaption className="hint">Recrutements annuels de chaque scénario.</figcaption>
            <Colonnes titre="Recrutements par scénario" series={seriesScenarios} donnees={pointsRecrutements(p)} />
          </figure>
          <figure className="stack">
            <figcaption className="hint">
              REM projeté de chaque scénario, avec la référence de {fmtDec(p.remReference, 1)}.
            </figcaption>
            <Aires
              titre="REM par scénario"
              remplir={false}
              formatValeur={v => fmtDec(v, 1)}
              series={[{ cle: 'reference', label: 'Référence', couleur: 'var(--violet)' }, ...seriesScenarios]}
              donnees={rem}
              vide={`REM non calculable pour les années projetées${
                raisons.length ? ` : voir (${raisons.map((_, i) => i + 1).join(', ')}) ci-dessus` : ''
              }.`}
            />
            {rem.length > 0 && rem.length < p.annees.length && (
              <p className="hint">
                Les années sans REM calculable ne sont pas tracées (voir les valeurs non disponibles).
              </p>
            )}
          </figure>
        </div>

        {analyste ? (
          <>
            <h3 className="titre-section">Tableau complet</h3>
            <div className="table-scroll table-scroll-libre">
              <table className="compare-table tableau-planification">
                <thead>
                  <tr>
                    <th scope="col">Indicateur</th>
                    {p.annees.map(a => (
                      <th key={a} scope="col" className="num">
                        {a}
                      </th>
                    ))}
                    <th scope="col">Nature</th>
                  </tr>
                </thead>
                {p.groupes.map(g => (
                  <tbody key={g.code}>
                    <tr className="ligne-forte">
                      <th scope="rowgroup" colSpan={p.annees.length + 2}>
                        {g.code}. {g.titre}
                      </th>
                    </tr>
                    {g.lignes.map(l => (
                      <tr key={l.cle}>
                        <th scope="row">
                          {l.libelle}
                          {l.detail && <small className="hint ligne-detail">{l.detail}</small>}
                        </th>
                        {l.valeurs.map((v, i) => {
                          const n = renvoi(raisons, l, i)
                          return (
                            <td
                              key={i}
                              className="num"
                              title={v === null ? (l.raisons?.[i] ?? 'Sans objet pour cette colonne') : undefined}
                            >
                              {n ? `Non disponible (${n})` : cellule(l, v)}
                            </td>
                          )
                        })}
                        <td>
                          <Pill tone={TON_NATURE[l.nature]}>{LIBELLE_NATURE[l.nature]}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>

            <div className="grid-2">
              <div>
                <h3 className="titre-section">Minimum pédagogique</h3>
                <div className="situation-block">
                  <Ligne libelle="Groupes observés" valeur={fmt(p.minimumPedagogique.observe)} />
                  <Ligne libelle="Groupes estimés (G = 6 − M)" valeur={fmt(p.minimumPedagogique.estime)} />
                  <Ligne
                    libelle="Groupes de secours (multigrades non renseignées)"
                    valeur={fmt(p.minimumPedagogique.secours)}
                  />
                  <Ligne libelle="Groupes indéterminés" valeur={fmt(p.minimumPedagogique.indetermine)} />
                  <Ligne libelle="Postes manquants : besoin confirmé" valeur={fmt(p.besoinsParStatut.confirme)} />
                  <Ligne libelle="Postes manquants : besoin estimé" valeur={fmt(p.besoinsParStatut.estime)} />
                  <Ligne libelle="Postes manquants : besoin provisoire" valeur={fmt(p.besoinsParStatut.provisoire)} />
                  <Ligne libelle="Écoles à l’effectif d’élèves inconnu" valeur={fmt(p.ecolesElevesInconnus)} />
                </div>
                {f && (
                  <>
                    <h3 className="titre-section">Fiabilité du besoin final</h3>
                    <div className="situation-block">
                      {lignesFiabilite(p).map(([libelle, n]) => (
                        <Ligne key={libelle} libelle={libelle} valeur={fmt(n)} />
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div>
                <h3 className="titre-section">Données non disponibles</h3>
                <div className="situation-block">
                  {p.nonDisponibles.map(d => (
                    <div key={d.indicateur} className="situation-line">
                      <span>
                        {d.indicateur}
                        <small className="hint ligne-detail">Source manquante : {d.sourceManquante}</small>
                      </span>
                      <strong>Non disponible</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <h3 className="titre-section">Hypothèses du calcul</h3>
            <div className="situation-block">
              {p.hypotheses.map(h => (
                <div key={h.code} className="situation-line">
                  <span>
                    {h.libelle} {h.aValider && <Pill tone="warn">À valider</Pill>}
                  </span>
                  <strong>{h.valeur}</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="hint">
            Le tableau complet (groupes A à E), la nature de chaque valeur, les hypothèses et les données non
            disponibles s’affichent en vue Analyste ; les exports Excel et Word les contiennent toujours.
          </p>
        )}
      </div>
    </Panel>
  )
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="situation-line">
      <span>{libelle}</span>
      <strong>{valeur}</strong>
    </div>
  )
}
