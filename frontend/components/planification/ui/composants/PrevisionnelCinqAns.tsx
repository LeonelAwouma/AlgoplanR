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
  ENTETES_AUDIT_RETRAITES,
  ENTETES_RAPPROCHEMENT,
  ENTETES_SCENARIOS,
  LIBELLE_NATURE,
  ORDRE_SCENARIOS,
  avertissementsCoherence,
  controlesAuditRetraites,
  libelleNatures,
  ligne,
  lignesAuditRetraites,
  lignesContexte,
  lignesFiabilite,
  lignesRapprochement,
  lignesScenarios,
  natureCase,
  phraseContexte,
  pointsEleves,
  pointsEnseignants,
  pointsRecrutements,
  pointsRem,
  raisonsIndisponibles,
  renvoi,
  scenario,
  syntheseDecideur,
  syntheseRapprochement,
} from '../../domain/previsionnel'

const TIRET = '—'
const COULEURS_SCENARIOS = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-4)', 'var(--serie-5)']

const TON_NATURE: Record<NatureValeur, Tone> = {
  observe: 'neutral',
  projete: 'info',
  estime: 'info',
  hypothese: 'warn',
  provisoire: 'warn',
  conditionnel: 'warn',
  decision: 'info',
  realise: 'ok',
  non_disponible: 'neutral',
  sans_objet: 'neutral',
}

/** Décomposition du quota d'une année : du besoin calculé au recrutement réalisé, sans les confondre. */
const ETAPES_QUOTA: [string, string][] = [
  ['quota_avant_plafond', 'Besoin de recrutement calculé'],
  ['plafond', 'Plafond du périmètre'],
  ['plancher_retraites', 'Plancher : retraites de l’année'],
  ['quota_calcule', 'Quota calculé (proposition)'],
  ['depassement_plafond', 'Dépassement du plafond (remplacement des retraites)'],
  ['quota_plafond_prioritaire', 'Règle alternative : plafond prioritaire (non appliquée)'],
  ['quota_retenu', 'Quota retenu (décision administrative)'],
  ['nominations_realisees', 'Recrutements réalisés'],
]

/** Écoles du rapprochement détaillées à l'écran ; les exports les contiennent toutes. */
const MAX_ECOLES_ECRAN = 50

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
  const audit = p.auditRetraites
  // Renvois des seules raisons qui expliquent un REM absent (pas celles des quotas ou des nominations).
  const renvoisRem = [
    ...new Set(
      ['rem_reel', ...ORDRE_SCENARIOS.map(c => `rem_${c}`)].flatMap(cle => {
        const l = ligne(p, cle)
        return l ? l.valeurs.map((_, i) => renvoi(raisons, l, i)).filter((n): n is number => n !== null) : []
      }),
    ),
  ].sort((a, b) => a - b)
  const n1 = p.annees[1] ?? 'N+1'
  const avertissements = avertissementsCoherence(p)
  const rappro = p.rapprochement

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
        {p.texteDonneesFictives && (
          <Notice tone="alert" title="Jeu fictif.">
            {p.texteDonneesFictives}
          </Notice>
        )}
        {avertissements.length > 0 && (
          <Notice
            tone={
              avertissements.some(a => a.code === 'retraites_non_calculables')
                ? 'alert'
                : avertissements.some(a => a.gravite === 'important')
                  ? 'warn'
                  : 'neutral'
            }
            title="Avertissements de cohérence."
          >
            {avertissements.map(a => (
              <span key={`${a.code}-${a.annee ?? ''}`} className="ligne-pleine">
                {a.message}
              </span>
            ))}
          </Notice>
        )}
        {p.contexte && (
          <Notice tone="neutral" title="Provenance et périmètre.">
            {phraseContexte(p)} {p.hypotheseTransition}
          </Notice>
        )}
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
              <span key={r.raison} className="ligne-pleine">
                <strong>({i + 1})</strong> {r.cellules.join(' ; ')}. {r.raison}
              </span>
            ))}
          </Notice>
        )}

        <div className="kpi-row">
          <KpiCard
            label="Élèves attendus"
            value={entier(s.elevesFin)}
            hint={`Projeté pour ${s.derniere}. Observé à la base${p.anneeBase ? ` (${p.anneeBase})` : ''} : ${entier(s.elevesBase)}.`}
          />
          <KpiCard
            label="Départs sur l’horizon"
            value={s.departs === null ? 'Non calculable' : fmt(s.departs)}
            hint={
              s.retraites === null
                ? 'Retraites non calculables : le fichier nominatif des enseignants est indisponible (aucun zéro affiché).'
                : `Projeté. Dont ${fmt(s.retraites)} retraites nominatives${
                    s.statutRetraites === 'partiel' ? ' (identifiées, total non exhaustif)' : ''
                  } ; le reste par attrition hors retraite.`
            }
          />
          <KpiCard
            label="Recrutements S-besoin"
            value={entier(s.recrutementsBesoin)}
            hint={`${
              s.statutRetraites === 'non_calculable'
                ? 'Simulation conditionnelle (aucun départ à la retraite modélisé). '
                : ''
            }Projeté, à décider : pour approcher le REM de référence ; ${entier(s.recrutementsPlafond)} sous plafond budgétaire.`}
          />
          <KpiCard
            label="REM à la base"
            value={decimal(s.remBase)}
            hint={`Observé (écoles à effectif connu). Référence ${fmtDec(s.remReference, 1)} ; ${recrutementsBesoin?.remFinal != null ? `projeté à ${fmtDec(recrutementsBesoin.remFinal, 1)} en fin d’horizon avec S-besoin` : 'fin d’horizon non calculable'}.`}
          />
        </div>

        <h3 className="titre-section">Du besoin calculé au recrutement réalisé</h3>
        <p className="hint">
          Un quota calculé est une proposition ; seul le quota retenu est une décision, et seules les nominations mises
          en œuvre sont des recrutements réalisés.
        </p>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Étape</th>
                {p.annees.slice(1).map(a => (
                  <th key={a} scope="col" className="num">
                    {a}
                  </th>
                ))}
                <th scope="col">Nature</th>
              </tr>
            </thead>
            <tbody>
              {ETAPES_QUOTA.map(([cle, libelle]) => {
                const l = ligne(p, cle)
                if (!l) return null
                return (
                  <tr key={cle}>
                    <th scope="row">{libelle}</th>
                    {l.valeurs.slice(1).map((v, i) => (
                      <td key={i} className="num" title={v === null ? (l.raisons?.[i + 1] ?? undefined) : undefined}>
                        {v === null ? TIRET : fmt(v)}
                      </td>
                    ))}
                    <td>
                      <Pill tone={TON_NATURE[natureCase(l, 1)]}>{LIBELLE_NATURE[natureCase(l, 1)]}</Pill>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {rappro && (
          <>
            <h3 className="titre-section">Rapprochement des effectifs</h3>
            <p className="hint">{rappro.methode}</p>
            <div className="situation-block">
              {syntheseRapprochement(p).map(([libelle, v]) => (
                <Ligne key={libelle} libelle={libelle} valeur={typeof v === 'number' ? fmt(v) : v} />
              ))}
            </div>
          </>
        )}

        <h3 className="titre-section">Comparaison des scénarios</h3>
        <p className="hint">Valeurs projetées en fin d’horizon, {s.derniere} ; aucune n’est observée.</p>
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
                const inconnu = scenario(p, ORDRE_SCENARIOS[k])?.fiabilite === 'non_calculable'
                return (
                  <tr key={String(l[0])}>
                    <th scope="row">{l[0]}</th>
                    {l.slice(1).map((v, i) => (
                      <td key={i} className="num">
                        {v === null
                          ? inconnu
                            ? 'Non calculable'
                            : `Non disponible${n ? ` (${n})` : ''}`
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
            <figcaption className="hint">
              Recrutements annuels de chaque scénario.
              {p.retraitesFiabilite?.statut === 'non_calculable' &&
                ' S-min et S-maintien ne sont pas tracés : retraites non calculables. S-besoin et Sous plafond sont des simulations conditionnelles.'}
            </figcaption>
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
                renvoisRem.length ? ` : voir (${renvoisRem.join(', ')}) ci-dessus` : ''
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
                              className={`num nature-${natureCase(l, i)}`}
                              title={
                                v === null
                                  ? (l.raisons?.[i] ?? 'Sans objet pour cette colonne')
                                  : LIBELLE_NATURE[natureCase(l, i)]
                              }
                            >
                              {n ? `Non disponible (${n})` : cellule(l, v)}
                            </td>
                          )
                        })}
                        <td className="colonne-nature">
                          <small>{libelleNatures(p, l)}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>

            <p className="hint">
              Nature des valeurs : la base est observée ; les années N+1 à N+5 sont projetées (en italique), sauf les
              hypothèses retenues et les actes enregistrés (quota retenu, nominations mises en œuvre). Survolez une case
              pour voir sa nature.
            </p>

            {audit && (
              <>
                <h3 className="titre-section">Audit des départs à la retraite</h3>
                <div className="table-scroll">
                  <table className="compare-table">
                    <thead>
                      <tr>
                        {ENTETES_AUDIT_RETRAITES.map((e, i) => (
                          <th key={e} scope="col" className={i > 0 ? 'num' : undefined}>
                            {e}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lignesAuditRetraites(p).map(l => (
                        <tr key={String(l[0])}>
                          <th scope="row">{l[0]}</th>
                          {l.slice(1).map((v, i) => (
                            <td key={i} className="num">
                              {v === null ? TIRET : typeof v === 'string' ? v : i >= 3 ? `${fmtDec(v, 1)} %` : fmt(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="situation-block">
                  {controlesAuditRetraites(p).map(([libelle, v]) => (
                    <Ligne key={libelle} libelle={libelle} valeur={typeof v === 'number' ? fmt(v) : v} />
                  ))}
                </div>
                <p className="hint">
                  La liste nominative des agents partants reste réservée aux utilisateurs habilités : page « Départs à
                  la retraite » de {n1.replace(/ \(.*\)$/, '')} à N+5.
                </p>
              </>
            )}

            {rappro && rappro.ecoles.length > 0 && (
              <>
                <h3 className="titre-section">Rapprochement école par école</h3>
                <p className="hint">
                  Écoles présentant une anomalie d’abord.
                  {rappro.ecoles.length > MAX_ECOLES_ECRAN &&
                    ` ${fmt(MAX_ECOLES_ECRAN)} premières écoles sur ${fmt(rappro.ecoles.length)} ; l’export Excel les contient toutes.`}
                </p>
                <div className="table-scroll">
                  <table className="compare-table">
                    <thead>
                      <tr>
                        {ENTETES_RAPPROCHEMENT.map((e, i) => (
                          <th key={e} scope="col" className={i > 1 && i < 12 ? 'num' : undefined}>
                            {e}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lignesRapprochement(p)
                        .slice(0, MAX_ECOLES_ECRAN)
                        .map((l, k) => (
                          <tr key={rappro.ecoles[k]?.idEcole ?? k}>
                            <th scope="row">{l[0]}</th>
                            {l.slice(1).map((v, i) => (
                              <td key={i} className={i > 0 && i < 11 ? 'num' : undefined}>
                                {typeof v === 'number' ? fmt(v) : v}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {p.contexte && (
              <>
                <h3 className="titre-section">Provenance et périmètre</h3>
                <div className="situation-block">
                  {lignesContexte(p).map(([libelle, v]) => (
                    <Ligne key={libelle} libelle={libelle} valeur={typeof v === 'number' ? fmt(v) : v} />
                  ))}
                </div>
              </>
            )}

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
