'use client'

/**
 * Rapport prévisionnel : les tableaux du rapport DRH d'octobre 2026 (§3 à §9)
 * recalculés sur les données du jeu, pour le périmètre de la barre de filtres.
 *
 * Tableau national par scénario, retraites et recrutements par région, volet
 * redéploiement, priorités régionales et limites. Le jeu ne distinguant pas la
 * maternelle, seul le primaire est produit.
 */

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'

import type { FichePrioriteRegion, RapportPrevisionnel } from '@shared/api'
import { selectionLevel } from '@shared/kernel'
import { useSession } from '@shared/session'
import { Notice, Panel, Pill, fmt, fmtDec, type Tone } from '@shared/ui/commun'
import { ChargementEnCours, ErreurAction, EtatRequetes } from '@shared/ui/etats'

import { LIBELLE_SCENARIO, SCENARIOS, telechargerRapportPrevisionnel } from '../application/export-rapport-previsionnel'
import { useRapportPrevisionnel, type RequetePlanification } from '../application/hooks'

const TON_PRIORITE: Record<FichePrioriteRegion['priorite'], Tone> = { 1: 'alert', 2: 'warn', 3: 'ok' }

/** Cellule numérique : entier, ou décimal pour les taux d'encadrement. */
function cellule(v: number | null, decimal = false): string {
  return decimal ? fmtDec(v) : fmt(v)
}

function TableauNational({ rapport }: { rapport: RapportPrevisionnel }) {
  const n = rapport.national
  return (
    <Panel
      kicker="§3 · Tableau national"
      title={`Primaire — ${rapport.perimetre}`}
      hint={`Stock et départs suivent la trajectoire « sous plafond ». Taux d’encadrement obtenu = élèves de l’année ÷ stock après départs et recrutements (référence ${fmtDec(n.remReference)} élèves par enseignant).`}
      flush
    >
      <div className="table-scroll table-scroll-libre">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Ligne</th>
              {n.annees.map(a => (
                <th key={a} scope="col" className="num">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {n.lignes.map(l => (
              <tr key={l.libelle} className={l.libelle.startsWith('Recrutement') ? 'ligne-forte' : undefined}>
                <th scope="row">{l.libelle}</th>
                {l.valeurs.map((v, i) => (
                  <td key={i} className="num">
                    {cellule(v, l.decimal)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function RetraitesRegions({ rapport }: { rapport: RapportPrevisionnel }) {
  const r = rapport.retraitesRegions
  return (
    <Panel
      kicker="§4 · Quotas incompressibles"
      title="Départs à la retraite par région"
      hint="Comptés nominativement d’après l’âge ; les agents ayant déjà atteint l’âge légal sont imputés à la première année (CORR_60)."
      flush
    >
      <div className="table-scroll table-scroll-libre">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Région</th>
              {rapport.annees.map(a => (
                <th key={a} scope="col" className="num">
                  {a}
                </th>
              ))}
              <th scope="col" className="num">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {[...r.lignes, r.national].map(l => (
              <tr key={l.region} className={l === r.national ? 'ligne-forte' : undefined}>
                <th scope="row">{l.region}</th>
                {l.annees.map((v, i) => (
                  <td key={i} className="num">
                    {fmt(v)}
                  </td>
                ))}
                <td className="num">{fmt(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function ScenariosRegions({ rapport }: { rapport: RapportPrevisionnel }) {
  const s = rapport.scenariosRegions
  const p = rapport.parametres
  return (
    <Panel
      kicker="§5 · Recrutements par scénario"
      title={`Recrutements sur ${rapport.horizon} an(s), par région`}
      hint="S-min : retraites. S-maintien : tous les départs. S-besoin : besoin et rattrapage du déficit, jamais sous les retraites. Sous plafond : quota calculé. Le national additionne les régions sans compenser les excédents des unes par les besoins des autres."
      flush
    >
      <div className="table-scroll table-scroll-libre">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Région</th>
              {SCENARIOS.map(x => (
                <th key={x} scope="col" className="num">
                  {LIBELLE_SCENARIO[x]}
                </th>
              ))}
              <th scope="col" className="num">
                Taux d’encadrement base
              </th>
              <th scope="col" className="num">
                Taux d’encadrement final S-min
              </th>
              <th scope="col" className="num">
                Taux d’encadrement final S-besoin
              </th>
              <th scope="col" className="num">
                Taux d’encadrement final plafond
              </th>
            </tr>
          </thead>
          <tbody>
            {[...s.lignes, s.national].map(l => (
              <tr key={l.region} className={l === s.national ? 'ligne-forte' : undefined}>
                <th scope="row">{l.region}</th>
                {SCENARIOS.map(x => (
                  <td key={x} className="num">
                    {fmt(l[x])}
                  </td>
                ))}
                <td className="num">{fmtDec(l.remBase)}</td>
                <td className="num">{fmtDec(l.remFinal.min)}</td>
                <td className="num">{fmtDec(l.remFinal.besoin)}</td>
                <td className="num">{fmtDec(l.remFinal.plafond)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rapport.national.remIndisponible && (
        <Notice tone="warn" title="Taux d’encadrement obtenu : non disponible (« — »).">
          {rapport.national.remIndisponible}
        </Notice>
      )}
      <Notice tone="info" title="Point à arbitrer : le plancher « retraites » sous plafond.">
        {p.plancherRetraites
          ? `Le plancher est actif (PLANCHER_RET) : chaque région reçoit au moins ses retraites, y compris celles au-dessus de la norme. Le désactiver réserve le plafond (${fmt(p.plafond)} par an au national) aux régions en déficit.`
          : 'Le plancher est désactivé : le plafond est réservé aux régions en déficit, les retraites des régions au-dessus de la norme ne sont pas remplacées.'}
      </Notice>
    </Panel>
  )
}

function Redeploiement({ rapport }: { rapport: RapportPrevisionnel }) {
  const r = rapport.redeploiement
  const n = r.national
  return (
    <Panel
      kicker="§7 · Volet redéploiement"
      title="Écoles, arrondissements et cohorte"
      hint={`Sur ${fmt(n.ecoles)} écoles : ${fmt(n.ecolesDeficit)} en déficit, ${fmt(n.ecolesExcedent)} en excédent, ${fmt(n.ecolesEquilibre)} à l’équilibre et ${fmt(n.ecolesSansEleves)} sans élèves connus. Les excédents (${fmt(n.excedents)} postes) couvrent au plus ${fmt(n.redeployableArrondissement)} des ${fmt(n.deficits)} postes en déficit sans quitter l’arrondissement.`}
      flush
    >
      <div className="table-scroll table-scroll-libre">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Région</th>
              <th scope="col" className="num">
                Excédents
              </th>
              <th scope="col" className="num">
                Déficits
              </th>
              <th scope="col" className="num">
                Redéployable dans l’arrondissement
              </th>
              <th scope="col" className="num">
                Cohorte ≥ {fmt(r.seuilCohorte)} ans
              </th>
              <th scope="col" className="num">
                Retraites sur l’horizon
              </th>
            </tr>
          </thead>
          <tbody>
            {[...r.lignes, n].map(l => (
              <tr key={l.territoire} className={l === n ? 'ligne-forte' : undefined}>
                <th scope="row">{l.territoire}</th>
                <td className="num">{fmt(l.excedents)}</td>
                <td className="num">{fmt(l.deficits)}</td>
                <td className="num">{fmt(l.redeployableArrondissement)}</td>
                <td className="num">{fmt(l.cohorte)}</td>
                <td className="num">{fmt(l.retraites)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function Priorites({ rapport }: { rapport: RapportPrevisionnel }) {
  const p = rapport.parametres
  return (
    <Panel
      kicker="§8 · Priorités régionales"
      title="Problèmes à traiter par région"
      hint={`Priorité 1 si le taux d’encadrement du primaire dépasse la référence (${fmtDec(p.remReference)}) de plus de ${fmt(p.ecartRem)} points ; priorité 2 si les retraites de l’horizon dépassent ${fmtDec(p.seuilRetraites)} % du stock ou si l’encadrement est proche de la norme ; priorité 3 sinon.`}
    >
      <div className="stack">
        {rapport.priorites.map(f => (
          <article key={f.region}>
            <h3>
              {f.region} <Pill tone={TON_PRIORITE[f.priorite]}>Priorité {f.priorite}</Pill>
              {f.prioriteRapportDrh != null && f.prioriteRapportDrh !== f.priorite && (
                <small> (rapport DRH : priorité {f.prioriteRapportDrh})</small>
              )}
            </h3>
            <p>
              <strong>{f.situation}.</strong> Taux d’encadrement du primaire {fmtDec(f.remBase)} ; retraites de
              l’horizon {fmtDec(f.partRetraites)} % du stock.
            </p>
            <ol>
              {f.problemes.map(x => (
                <li key={x.titre}>
                  <strong>{x.titre}</strong> : {x.detail}
                </li>
              ))}
            </ol>
            <p>
              <strong>Orientation</strong> : {f.orientation}. Recrutements :{' '}
              {SCENARIOS.map(s => `${LIBELLE_SCENARIO[s]} ${fmt(f.recrutements[s])}`).join(', ')}.
            </p>
          </article>
        ))}
      </div>
    </Panel>
  )
}

/** Page « Rapport prévisionnel ». */
export function RapportPrevisionnelPage() {
  const { jeu, filtres } = useSession()
  const [horizon, setHorizon] = useState(3)
  const [seuilCohorte, setSeuilCohorte] = useState(5)
  const [exportEnCours, setExportEnCours] = useState(false)
  const [erreurExport, setErreurExport] = useState<unknown>(null)

  const requete: RequetePlanification = {
    niveau: selectionLevel(filtres.territoire),
    region: filtres.territoire.region,
    departement: filtres.territoire.departement,
    commune: filtres.territoire.commune,
  }
  const options = { horizon, seuilCohorte }
  const rapport = useRapportPrevisionnel(jeu, requete, options)

  if (!jeu) return <ChargementEnCours />

  const exporter = async (r: RapportPrevisionnel) => {
    setExportEnCours(true)
    setErreurExport(null)
    try {
      await telechargerRapportPrevisionnel(jeu, requete, options, r)
    } catch (e) {
      setErreurExport(e)
    } finally {
      setExportEnCours(false)
    }
  }

  return (
    <div className="stack">
      <Panel
        kicker="Rapport prévisionnel"
        title="Effectifs, postes et attrition — tableaux du rapport DRH"
        hint="Les tableaux du rapport d’octobre 2026, recalculés sur les données du jeu avec les hypothèses en vigueur. La maternelle n’étant pas distinguée dans le jeu, seul le primaire est produit."
        actions={
          rapport.data && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={exportEnCours}
              onClick={() => void exporter(rapport.data)}
            >
              <FileSpreadsheet size={13} aria-hidden="true" /> {exportEnCours ? 'Export…' : 'Exporter (Excel)'}
            </button>
          )
        }
      >
        <div className="param-grid">
          <div className="field">
            <label htmlFor="rp-horizon">Horizon</label>
            <select id="rp-horizon" value={horizon} onChange={e => setHorizon(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map(h => (
                <option key={h} value={h}>
                  {h} an{h > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rp-cohorte">Cohorte : années au poste</label>
            <input
              id="rp-cohorte"
              type="number"
              min={0}
              step={1}
              value={seuilCohorte}
              onChange={e => setSeuilCohorte(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
        <ErreurAction erreur={erreurExport} />
      </Panel>

      {!rapport.data ? (
        <EtatRequetes requetes={[rapport]} />
      ) : (
        <>
          <TableauNational rapport={rapport.data} />
          <RetraitesRegions rapport={rapport.data} />
          <ScenariosRegions rapport={rapport.data} />
          <Redeploiement rapport={rapport.data} />
          <Priorites rapport={rapport.data} />
          <Panel kicker="§9 · Limites" title="Limites et points à confirmer">
            <ul>
              {rapport.data.limites.map(l => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </div>
  )
}
