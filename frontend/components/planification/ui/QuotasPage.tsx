'use client'

/**
 * Quotas de recrutement : calculés par le serveur, éventuellement ajustés par
 * l'administration avec un motif, puis validés (figés) année par année.
 */

import { useState } from 'react'
import { BadgeCheck, PencilLine } from 'lucide-react'

import { ANNEES_PLAN, type AnneePlan, type QuotaRecrutement } from '@shared/api'
import { LIBELLE_SOUS_SYSTEME, LIBELLE_STATUT_QUOTA, selectionLevel } from '@shared/kernel'
import { useSession } from '@shared/session'
import { DataTable, Delta, Panel, Pill, fmt, type Colonne, type Tone } from '@shared/ui/commun'
import { ChampAuteur, useAuteur } from '@shared/ui/ChampAuteur'
import { ChargementEnCours, EtatRequetes, ErreurAction } from '@shared/ui/etats'

import { useAjusterQuota, useHistoriqueQuotas, useQuotas, useValiderQuotas } from '../application/hooks'
import { AjustementQuota } from './composants/AjustementQuota'

/** Ton de la pastille de statut. */
const TON_STATUT: Record<QuotaRecrutement['statut'], Tone> = { calcule: 'neutral', ajuste: 'warn', valide: 'ok' }

/** Page « Quotas de recrutement ». */
export function QuotasPage() {
  const { jeu, filtres } = useSession()
  const [annee, setAnnee] = useState<AnneePlan>('N+1')
  const [ajuste, setAjuste] = useState<QuotaRecrutement | null>(null)
  const [auteur, setAuteur] = useAuteur()

  const quotas = useQuotas(jeu, {
    annee,
    niveau: selectionLevel(filtres.territoire),
    region: filtres.territoire.region,
    departement: filtres.territoire.departement,
    commune: filtres.territoire.commune,
  })
  const historique = useHistoriqueQuotas(jeu)
  const ajustement = useAjusterQuota(jeu)
  const validation = useValiderQuotas(jeu)

  if (!jeu) return <ChargementEnCours />
  if (!quotas.data) return <EtatRequetes requetes={[quotas]} />

  const tousValides = quotas.data.length > 0 && quotas.data.every(q => q.statut === 'valide')

  const colonnes: Colonne<QuotaRecrutement>[] = [
    { cle: 'territoire', entete: 'Territoire', rendu: q => q.territoire, tri: q => q.territoire },
    { cle: 'ss', entete: 'Sous-système', rendu: q => LIBELLE_SOUS_SYSTEME[q.sousSysteme], tri: q => q.sousSysteme },
    { cle: 'calcule', entete: 'Calculé', numerique: true, rendu: q => fmt(q.calcule), tri: q => q.calcule },
    {
      cle: 'retenu',
      entete: 'Retenu',
      numerique: true,
      rendu: q => (
        <span>
          <strong>{fmt(q.retenu)}</strong>
          {q.retenu !== q.calcule && <Delta avant={q.calcule} apres={q.retenu} />}
        </span>
      ),
      tri: q => q.retenu,
    },
    {
      cle: 'statut',
      entete: 'Statut',
      rendu: q => (
        <span>
          <Pill tone={TON_STATUT[q.statut]}>{LIBELLE_STATUT_QUOTA[q.statut]}</Pill>
          {q.motifAjustement && <small>{q.motifAjustement}</small>}
        </span>
      ),
      tri: q => q.statut,
    },
    {
      cle: 'action',
      entete: '',
      rendu: q =>
        q.statut === 'valide' ? (
          '—'
        ) : (
          <button
            type="button"
            className="row-action"
            onClick={() => {
              ajustement.reset()
              setAjuste(q)
            }}
          >
            <PencilLine size={12} aria-hidden="true" /> Ajuster
          </button>
        ),
    },
  ]

  return (
    <div className="stack">
      <Panel
        kicker="Quotas de recrutement"
        title="Quotas prévisionnels par territoire et sous-système"
        hint="Le quota calculé couvre le besoin que le vivier ne peut pas couvrir, augmenté de l’attrition. L’administration peut l’ajuster en le motivant, puis le valider."
      >
        <div className="param-grid">
          <div className="field">
            <label htmlFor="qu-annee">Année</label>
            <select id="qu-annee" value={annee} onChange={e => setAnnee(e.target.value as AnneePlan)}>
              {ANNEES_PLAN.map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <ChampAuteur auteur={auteur} onChange={setAuteur} />
        </div>
        <ErreurAction erreur={validation.error} />
        <div className="topbar-actions actions-formulaire">
          <button
            type="button"
            className="btn btn-primary"
            disabled={tousValides || auteur.trim() === '' || validation.isPending}
            onClick={() => validation.mutate({ annee, auteur: auteur.trim() })}
          >
            <BadgeCheck size={14} aria-hidden="true" /> Valider les quotas de {annee}
          </button>
          {tousValides && <Pill tone="ok">Quotas de {annee} validés</Pill>}
        </div>
      </Panel>

      {ajuste && (
        <AjustementQuota
          key={`${ajuste.annee}-${ajuste.codeTerritoire}-${ajuste.sousSysteme}`}
          quota={ajuste}
          enCours={ajustement.isPending}
          erreur={ajustement.error}
          auteurManquant={auteur.trim() === ''}
          onFermer={() => setAjuste(null)}
          onAjuster={(retenu, motif) =>
            ajustement.mutate(
              {
                annee: ajuste.annee,
                territoire: ajuste.codeTerritoire,
                corps: { sousSysteme: ajuste.sousSysteme, retenu, motif, auteur: auteur.trim() },
              },
              { onSuccess: () => setAjuste(null) },
            )
          }
        />
      )}

      <Panel kicker={annee} title={`${fmt(quotas.data.length)} quota(s)`} flush>
        <DataTable
          lignes={quotas.data}
          colonnes={colonnes}
          cle={q => `${q.codeTerritoire}-${q.sousSysteme}`}
          legende={`Quotas de recrutement ${annee}`}
          messageVide="Aucun quota pour cette année et ce périmètre."
        />
      </Panel>

      <Panel kicker="Traçabilité" title="Historique des quotas">
        {!historique.data ? (
          <EtatRequetes requetes={[historique]} />
        ) : (
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Année</th>
                <th scope="col">Territoire</th>
                <th scope="col">Évènement</th>
                <th scope="col" className="num">
                  Valeur
                </th>
                <th scope="col">Motif</th>
                <th scope="col">Par</th>
              </tr>
            </thead>
            <tbody>
              {historique.data
                .filter(e => e.annee === annee)
                .map((e, i) => (
                  <tr key={`${e.le}-${e.codeTerritoire}-${i}`}>
                    <th scope="row">{new Date(e.le).toLocaleString('fr-FR')}</th>
                    <td>{e.annee}</td>
                    <td>{e.codeTerritoire}</td>
                    <td>{e.evenement}</td>
                    <td className="num">{fmt(e.valeur)}</td>
                    <td>{e.motif ?? '—'}</td>
                    <td>{e.auteur ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
