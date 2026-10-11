'use client'

/**
 * Nouveaux recrutés (§3.8) : import des candidats au concours et déploiement
 * sur les postes restés vacants du scénario affiché. Le serveur lit le fichier,
 * puis déploie les candidats par ordre de note d'admission.
 */

import { useRef } from 'react'
import { RefreshCw, Upload } from 'lucide-react'

import { messageErreur, type AffectationRecrue } from '@shared/api'
import { useSession } from '@shared/session'
import { DataTable, KpiCard, Notice, Panel, fmt } from '@shared/ui/commun'
import { ChargementEnCours, ErreurAction } from '@shared/ui/etats'
import { useColonnesAttendues } from '@components/donnees'
import { SansScenario, useRecrutes, useScenarioAffiche } from '@components/simulation'

import { useImporterRecrues, useRecrues, useSupprimerRecrues } from '../application/hooks'

/** Lignes écartées détaillées dans l'avertissement. */
const ECARTEES_DETAILLEES = 5

/** Issue d'une affectation, en clair. */
function issueEnClair(a: AffectationRecrue): string {
  if (a.issue === 'choix') return `Choix ${a.rangChoix}`
  if (a.issue === 'departement') return 'Extension au département'
  return 'Extension à la région'
}

/** Page « Nouveaux recrutés ». */
export function RecrutesPage() {
  const { jeu } = useSession()
  const { scenario } = useScenarioAffiche()
  const recrues = useRecrues(jeu)
  const colonnes = useColonnesAttendues('recrues')
  const deploiement = useRecrutes(jeu, scenario)
  const importation = useImporterRecrues(jeu)
  const suppression = useSupprimerRecrues(jeu)
  const champFichier = useRef<HTMLInputElement>(null)

  if (!jeu || !recrues.data) return <ChargementEnCours />

  const nombre = recrues.data.length
  const lecture = importation.data
  const r = deploiement.data ?? null

  return (
    <div className="stack">
      <Notice tone="info" title="Déploiement des nouveaux recrutés (§3.8).">
        Les nouveaux recrutés ne sont déployés que sur les postes restés vacants après le redéploiement. Le mieux classé
        au concours choisit le premier parmi ses trois choix ; à défaut, un poste lui est proposé dans le département,
        puis dans la région, puis il entre dans un vivier national pour arbitrage. Seuls les postes du sous-système de
        son concours lui sont proposés.
      </Notice>

      <Panel
        kicker="Candidats au concours"
        title={nombre > 0 ? `${fmt(nombre)} candidat(s) chargé(s)` : 'Aucun candidat chargé'}
        actions={
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={importation.isPending}
              onClick={() => champFichier.current?.click()}
            >
              {importation.isPending ? (
                <RefreshCw size={13} className="spin" aria-hidden="true" />
              ) : (
                <Upload size={13} aria-hidden="true" />
              )}{' '}
              {nombre > 0 ? 'Remplacer le fichier' : 'Importer le fichier des candidats'}
            </button>
            {nombre > 0 && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={suppression.isPending}
                onClick={() => suppression.mutate()}
              >
                Retirer la liste
              </button>
            )}
          </>
        }
      >
        <input
          ref={champFichier}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv"
          className="champ-fichier-cache"
          aria-label="Fichier des candidats au concours"
          onChange={e => {
            const fichier = e.target.files?.[0]
            if (fichier) importation.mutate({ fichier })
            e.target.value = ''
          }}
        />

        {importation.error && <Notice tone="alert">{messageErreur(importation.error)}</Notice>}
        <ErreurAction erreur={suppression.error} />
        {lecture && lecture.manquantes.length > 0 && (
          <Notice tone="alert">Colonnes indispensables introuvables : {lecture.manquantes.join(', ')}.</Notice>
        )}
        {lecture && lecture.ecartees.length > 0 && (
          <Notice tone="warn">
            {fmt(lecture.ecartees.length)} ligne(s) écartée(s) :{' '}
            {lecture.ecartees
              .slice(0, ECARTEES_DETAILLEES)
              .map(e => `ligne ${e.ligne} (${e.motif})`)
              .join(', ')}
            .
          </Notice>
        )}

        <p className="hint">Colonnes attendues (une ligne par candidat admis) :</p>
        <ul className="reason-list">
          {(colonnes.data ?? []).map(c => (
            <li key={c.champ}>
              <span>
                <strong>{c.label}</strong>
                {c.requis ? ' — indispensable' : ''} · noms acceptés : {c.alias.slice(0, 4).join(', ')}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {nombre > 0 && !scenario && (
        <SansScenario texte="Le déploiement des recrutés s’effectue sur les postes restés vacants d’un scénario calculé." />
      )}

      {r && (
        <>
          <div className="kpi-row">
            <KpiCard
              label="Candidats affectés"
              value={fmt(r.affectations.length)}
              hint="Par ordre de note d’admission"
              tone="ok"
            />
            <KpiCard
              label="Sur un de leurs choix"
              value={fmt(r.affectations.filter(a => a.issue === 'choix').length)}
              hint="Les autres par extension territoriale"
            />
            <KpiCard
              label="Vivier national"
              value={fmt(r.vivierNational.length)}
              hint="Sans poste compatible dans leur région"
              tone="warn"
            />
            <KpiCard
              label="Postes encore vacants"
              value={fmt(r.postesRestants)}
              hint="Après redéploiement et recrutement"
              tone={r.postesRestants > 0 ? 'alert' : 'ok'}
            />
          </div>

          <Panel kicker="Affectations" title="Postes proposés aux nouveaux recrutés" flush>
            <DataTable
              lignes={r.affectations}
              colonnes={[
                {
                  cle: 'nom',
                  entete: 'Candidat',
                  rendu: a => (
                    <span>
                      <strong>{a.nom}</strong>
                      <small>{a.recrueId}</small>
                    </span>
                  ),
                  tri: a => a.nom,
                },
                {
                  cle: 'note',
                  entete: 'Note',
                  numerique: true,
                  rendu: a => a.note.toLocaleString('fr-FR'),
                  tri: a => a.note,
                },
                {
                  cle: 'ecole',
                  entete: 'Poste',
                  rendu: a => (
                    <span>
                      <strong>{a.nomEtab}</strong>
                      <small>{a.commune}</small>
                    </span>
                  ),
                  tri: a => a.nomEtab,
                },
                { cle: 'issue', entete: 'Issue', rendu: issueEnClair, tri: a => a.issue },
              ]}
              cle={a => a.recrueId}
              legende="Affectation des nouveaux recrutés"
            />
          </Panel>

          {r.vivierNational.length > 0 && (
            <Panel kicker="Vivier national" title="Candidats transmis pour arbitrage">
              <ul className="reason-list">
                {r.vivierNational.map(v => (
                  <li key={v.recrueId}>
                    <span>
                      <strong>{v.nom}</strong> ({v.note.toLocaleString('fr-FR')}) — {v.motif}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}
