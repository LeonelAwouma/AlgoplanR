'use client'

/**
 * Restitution du rapport de qualité des données.
 *
 * Le score est présenté avec son détail : chaque point retiré est rattaché à un
 * problème nommé et compté. Les problèmes ne sont jamais masqués, y compris
 * lorsque le score global est bon.
 */

import { AlertTriangle, Check, CircleAlert, Info } from 'lucide-react'
import type { DataQualityReport } from '@shared/api'
import { Notice, Pill, fmt, fmtPct } from '@shared/ui/commun'

function couleurScore(score: number): string {
  if (score >= 85) return 'var(--ok)'
  if (score >= 70) return 'var(--serie-2)'
  if (score >= 50) return 'var(--warn)'
  return 'var(--alert)'
}

/** Résumé de l'isolement d'une région dans une base nationale (import d'un délégué régional). */
function BilanRegional({ bilan }: { bilan: NonNullable<DataQualityReport['importRegional']> }) {
  const lignes: [string, number][] = [
    ['Établissements dans le fichier national', bilan.etablissementsFichier],
    [`Établissements retenus (région ${bilan.region})`, bilan.etablissementsRetenus],
    ['Enseignants retenus', bilan.enseignantsRetenus],
    ['Enregistrements exclus (autres régions)', bilan.etablissementsAutresRegions + bilan.enseignantsAutresRegions],
    ['Enseignants non rattachés', bilan.enseignantsNonRattaches],
    ['Enseignants au rattachement ambigu', bilan.enseignantsAmbigus],
    ['Établissements écartés (code ou région inexploitable)', bilan.etablissementsEcartes],
  ]
  return (
    <section aria-labelledby="bilan-regional">
      <h4 id="bilan-regional">Import de la région {bilan.region} depuis la base nationale</h4>
      <p className="hint">
        Seuls les établissements de la région et les enseignants rattachés par le code de leur école ont été conservés ;
        les fichiers sources n’ont pas été modifiés. Un enseignant dont la région ne peut pas être établie de façon
        fiable n’est attribué à aucune région.
      </p>
      <dl className="bilan-regional">
        {lignes.map(([libelle, valeur]) => (
          <div key={libelle}>
            <dt>{libelle}</dt>
            <dd>{fmt(valeur)}</dd>
          </div>
        ))}
      </dl>
      {bilan.anomalies.length > 0 && (
        <details>
          <summary>
            Voir les rattachements écartés ({fmt(bilan.anomalies.length)}
            {bilan.anomaliesTronquees ? ' premiers' : ''})
          </summary>
          <ul className="check-list">
            {bilan.anomalies.map((a, i) => (
              <li key={`${a.fichier}-${a.ligne}-${i}`} className="check-warn">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>
                  {a.fichier === 'etablissements' ? 'Établissements' : 'Enseignants'}, ligne {a.ligne} : {a.motif}
                  {a.valeur ? ` (« ${a.valeur} »)` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

export function DataQualityPanel({ rapport, compact = false }: { rapport: DataQualityReport; compact?: boolean }) {
  const bloquants = rapport.missingFields.filter(f => f.bloquant)

  return (
    <div className="stack-tight">
      <div className="quality-score">
        <div
          className="quality-gauge"
          style={{ ['--gauge' as string]: rapport.score, ['--gauge-color' as string]: couleurScore(rapport.score) }}
          role="img"
          aria-label={`Score de qualité des données : ${rapport.score} sur 100, qualité ${rapport.appreciation}`}
        >
          <span>{rapport.score}</span>
        </div>
        <div>
          <p className="eyebrow">Qualité des données</p>
          <h3 style={{ fontSize: 18 }}>
            {rapport.score} % — {rapport.appreciation}
          </h3>
          <p className="hint" style={{ maxWidth: '60ch' }}>
            Le score part de 100 et retire des points pour chaque problème détecté. Il décrit la fiabilité des données
            importées, pas la situation des établissements.
          </p>
        </div>
      </div>

      {rapport.importRegional && <BilanRegional bilan={rapport.importRegional} />}

      <ul className="check-list">
        <li className="check-ok">
          <Check size={15} aria-hidden="true" />
          <span>
            <strong>{fmt(rapport.ecolesValides)}</strong> établissements exploitables sur {fmt(rapport.ecolesLues)}{' '}
            lignes lues
          </span>
        </li>
        <li className="check-ok">
          <Check size={15} aria-hidden="true" />
          <span>
            <strong>{fmt(rapport.enseignantsValides)}</strong> enseignants exploitables sur{' '}
            {fmt(rapport.enseignantsLus)} lignes lues
          </span>
        </li>
        <li className={rapport.territorialCompleteness.tauxComplet >= 0.98 ? 'check-ok' : 'check-warn'}>
          {rapport.territorialCompleteness.tauxComplet >= 0.98 ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <AlertTriangle size={15} aria-hidden="true" />
          )}
          <span>
            Complétude territoriale : <strong>{fmtPct(rapport.territorialCompleteness.tauxComplet)}</strong> des
            établissements ont région, département et commune renseignés
          </span>
        </li>
        <li className={rapport.donneesElevesDisponibles ? 'check-ok' : 'check-warn'}>
          {rapport.donneesElevesDisponibles ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <Info size={15} aria-hidden="true" />
          )}
          <span>
            {rapport.donneesElevesDisponibles
              ? 'Effectifs d’élèves disponibles : les indicateurs pédagogiques sont calculés'
              : 'Données élèves indisponibles — certains indicateurs pédagogiques ne peuvent pas être calculés'}
          </span>
        </li>
        {rapport.errors.map(e => (
          <li className="check-alert" key={e.code}>
            <CircleAlert size={15} aria-hidden="true" />
            <span>
              <strong>{fmt(e.count)}</strong> {e.label}
              {e.consequence ? ` — ${e.consequence}` : ''}
              {e.exemples.length > 0 && <span className="hint"> Exemples : {e.exemples.join(', ')}</span>}
            </span>
          </li>
        ))}
        {rapport.warnings.map(w => (
          <li className="check-warn" key={w.code}>
            <AlertTriangle size={15} aria-hidden="true" />
            <span>
              <strong>{fmt(w.count)}</strong> {w.label}
              {w.consequence ? ` — ${w.consequence}` : ''}
              {w.exemples.length > 0 && <span className="hint"> Exemples : {w.exemples.join(', ')}</span>}
            </span>
          </li>
        ))}
      </ul>

      {bloquants.length > 0 && (
        <Notice tone="alert" title="Information indispensable absente.">
          {bloquants.map(f => f.label).join(', ')} — {bloquants[0].consequence}
        </Notice>
      )}

      {!compact && (
        <>
          {rapport.missingFields.filter(f => !f.bloquant).length > 0 && (
            <details className="advanced">
              <summary>
                Informations facultatives absentes ({rapport.missingFields.filter(f => !f.bloquant).length})
              </summary>
              <ul style={{ fontSize: 12.5, color: 'var(--ink-soft)', paddingLeft: 18, margin: '6px 0 0' }}>
                {rapport.missingFields
                  .filter(f => !f.bloquant)
                  .map(f => (
                    <li key={`${f.dataset}-${f.champ}`} style={{ marginBottom: 4 }}>
                      <strong>{f.label}</strong> ({f.dataset}) — {f.consequence}
                    </li>
                  ))}
              </ul>
            </details>
          )}

          {rapport.reconciliationEffectifs && rapport.reconciliationEffectifs.ecolesEnEcart > 0 && (
            <details className="advanced">
              <summary>
                Écarts d’effectif ({fmt(rapport.reconciliationEffectifs.ecolesEnEcart)} école(s) sur{' '}
                {fmt(rapport.reconciliationEffectifs.ecolesComparees)})
              </summary>
              <p className="hint">{rapport.reconciliationEffectifs.regle}</p>
              <table className="compare-table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>École</th>
                    <th className="num">Déclarés</th>
                    <th className="num">Matricules rattachés</th>
                    <th className="num">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.reconciliationEffectifs.ecoles.slice(0, 50).map(e => (
                    <tr key={e.ecole}>
                      <th scope="row" style={{ fontWeight: 500 }}>
                        {e.nomEcole} <span className="mono hint">{e.ecole}</span>
                      </th>
                      <td className="num">{fmt(e.enseignantsDeclares)}</td>
                      <td className="num">{fmt(e.matriculesRattaches)}</td>
                      <td className="num">{e.ecart > 0 ? `+${fmt(e.ecart)}` : fmt(e.ecart)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">
                {rapport.reconciliationEffectifs.ecoles.length > 50 || rapport.reconciliationEffectifs.listeTronquee
                  ? 'Les 50 plus grands écarts sont affichés. '
                  : ''}
                Sur l’ensemble : écart net {fmt(rapport.reconciliationEffectifs.ecartTotal)}, écart absolu{' '}
                {fmt(rapport.reconciliationEffectifs.ecartAbsoluTotal)}.
              </p>
            </details>
          )}

          <details className="advanced">
            <summary>Comment ce score est-il obtenu ?</summary>
            <table className="compare-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Élément</th>
                  <th className="num">Points</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Score de départ</th>
                  <td className="num">100</td>
                </tr>
                {rapport.detailScore.map((d, i) => (
                  <tr key={`${d.label}-${i}`}>
                    <th scope="row" style={{ fontWeight: 500 }}>
                      {d.label}
                    </th>
                    <td className="num">{d.points}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Score final</th>
                  <td className="num">
                    <strong>{rapport.score}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </details>

          {rapport.duplicates.length > 0 && (
            <details className="advanced">
              <summary>Identifiants en double ({rapport.duplicates.length})</summary>
              <p className="hint mono" style={{ marginTop: 6 }}>
                {rapport.duplicates
                  .slice(0, 50)
                  .map(d => `${d.id} (${d.dataset}, ×${d.occurrences})`)
                  .join(' · ')}
              </p>
            </details>
          )}

          {rapport.unknownSchools.length > 0 && (
            <details className="advanced">
              <summary>Enseignants rattachés à une école inconnue ({rapport.unknownSchools.length})</summary>
              <p className="hint mono" style={{ marginTop: 6 }}>
                {rapport.unknownSchools
                  .slice(0, 50)
                  .map(u => `${u.teacherId} → ${u.schoolId}`)
                  .join(' · ')}
              </p>
            </details>
          )}
        </>
      )}

      {rapport.errors.length === 0 && rapport.warnings.length === 0 && (
        <Pill tone="ok">
          <Check size={12} aria-hidden="true" /> Aucun problème détecté sur ce jeu de données
        </Pill>
      )}
    </div>
  )
}
