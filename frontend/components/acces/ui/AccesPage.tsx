'use client'

/**
 * Accès des délégués — page réservée au DRH.
 *
 * Le DRH y remet un code à chaque région, valide ou refuse les entrées des
 * délégués, et retire un accès quand un délégué change. Un code n'est affiché
 * qu'une fois, au moment où il est créé : seule son empreinte est conservée.
 */

import { useState, type FormEvent } from 'react'
import { Ban, Check, Copy, KeyRound, RotateCcw, X } from 'lucide-react'
import type { DemandeEntree } from '../domain/types'
import { REGIONS_CAMEROUN, type RegionCameroun } from '@shared/kernel'
import { codeActif, demandesEnAttente } from '../domain/registre'
import { EmptyState, Notice, Panel, Pill, type Tone } from '@shared/ui/commun'
import type { Acces } from '../application/useAcces'

const messageDe = (err: unknown) => (err instanceof Error ? err.message : String(err))

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const ETAT_ENTREE: Record<DemandeEntree['statut'], { libelle: string; ton: Tone }> = {
  attente: { libelle: 'En attente de validation', ton: 'warn' },
  validee: { libelle: 'Entrée validée', ton: 'ok' },
  refusee: { libelle: 'Entrée refusée', ton: 'alert' },
}

export function AccesPage({ acces }: { acces: Acces }) {
  const { registre, attribuer, retirer, decider } = acces

  const [region, setRegion] = useState<RegionCameroun | ''>('')
  const [titulaire, setTitulaire] = useState('')
  /** Code qui vient d'être créé : montré une seule fois, jamais relu depuis le registre. */
  const [codeCree, setCodeCree] = useState<{ region: RegionCameroun; titulaire: string; code: string } | null>(null)
  const [copie, setCopie] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  if (!registre) return null

  const enAttente = demandesEnAttente(registre)

  async function executer(action: () => Promise<void>) {
    setEnCours(true)
    setErreur(null)
    try {
      await action()
    } catch (err) {
      setErreur(messageDe(err))
    } finally {
      setEnCours(false)
    }
  }

  function creerCode(e: FormEvent) {
    e.preventDefault()
    if (!region || !registre) return
    const existant = codeActif(registre, region)
    if (
      existant &&
      !window.confirm(
        `La région ${region} a déjà un code, remis à ${existant.titulaire}.\n\nEn créer un nouveau retire l'ancien : ${existant.titulaire} ne pourra plus entrer.`,
      )
    ) {
      return
    }
    void executer(async () => {
      const code = await attribuer(region, titulaire)
      setCodeCree({ region, titulaire: titulaire.trim(), code })
      setCopie(false)
      setRegion('')
      setTitulaire('')
    })
  }

  function retirerAcces(r: RegionCameroun, nom: string) {
    if (!window.confirm(`Retirer l'accès de ${nom} (région ${r}) ?\n\nSon code ne permettra plus d'entrer.`)) return
    if (codeCree?.region === r) setCodeCree(null)
    void executer(() => retirer(r))
  }

  async function copier() {
    if (!codeCree) return
    try {
      await navigator.clipboard.writeText(codeCree.code)
      setCopie(true)
    } catch {
      setCopie(false)
    }
  }

  return (
    <>
      {erreur && <Notice tone="alert">{erreur}</Notice>}

      <Panel
        id="acces-attente"
        title="Entrées en attente de validation"
        hint="Un délégué qui saisit un code exact n'entre pas pour autant : il attend votre décision."
      >
        {enAttente.length === 0 ? (
          <EmptyState titre="Aucune entrée à valider">Les demandes des délégués régionaux apparaîtront ici.</EmptyState>
        ) : (
          <ul className="acces-demandes">
            {enAttente.map(d => (
              <li key={d.id}>
                <div>
                  <strong>{d.titulaire}</strong>
                  <span>
                    Région {d.region} — demande du {dateHeure(d.demandeLe)}
                  </span>
                </div>
                <div className="acces-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={enCours}
                    onClick={() => void executer(() => decider(d.id, 'validee'))}
                  >
                    <Check size={13} aria-hidden="true" /> Valider l’entrée
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={enCours}
                    onClick={() => void executer(() => decider(d.id, 'refusee'))}
                  >
                    <X size={13} aria-hidden="true" /> Refuser
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id="acces-codes"
        title="Codes d’accès par région"
        hint="Un seul code par région. Remettez-le au délégué de la main à la main ou par téléphone."
      >
        <form className="acces-form" onSubmit={creerCode}>
          <div className="field">
            <label htmlFor="acces-region">Région</label>
            <select id="acces-region" value={region} onChange={e => setRegion(e.target.value as RegionCameroun | '')}>
              <option value="">Choisissez une région</option>
              {REGIONS_CAMEROUN.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="field field-recherche">
            <label htmlFor="acces-titulaire">Nom du délégué régional</label>
            <input
              id="acces-titulaire"
              type="text"
              autoComplete="off"
              value={titulaire}
              onChange={e => setTitulaire(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={enCours || !region || !titulaire.trim()}>
            <KeyRound size={14} aria-hidden="true" /> Créer le code
          </button>
        </form>

        {codeCree && (
          <div className="acces-code-cree" role="status">
            <p>
              Code de <strong>{codeCree.titulaire}</strong>, région <strong>{codeCree.region}</strong> :
            </p>
            <p className="acces-code">{codeCree.code}</p>
            <div className="acces-actions">
              <button type="button" className="btn btn-sm" onClick={() => void copier()}>
                <Copy size={13} aria-hidden="true" /> {copie ? 'Copié' : 'Copier'}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setCodeCree(null)}>
                J’ai noté le code
              </button>
            </div>
            <p className="hint">
              Notez-le maintenant : il ne sera plus jamais affiché. En cas de perte, créez un nouveau code.
            </p>
          </div>
        )}

        <div className="table-scroll">
          <table className="acces-table">
            <thead>
              <tr>
                <th scope="col">Région</th>
                <th scope="col">Délégué</th>
                <th scope="col">Code créé le</th>
                <th scope="col">Entrée</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {REGIONS_CAMEROUN.map(r => {
                const code = codeActif(registre, r)
                const demande = code ? registre.demandes.find(d => d.codeId === code.id) : undefined
                return (
                  <tr key={r}>
                    <th scope="row">{r}</th>
                    <td>{code ? code.titulaire : <span className="acces-vide">Aucun code</span>}</td>
                    <td>{code ? dateHeure(code.creeLe) : '—'}</td>
                    <td>
                      {!code ? (
                        '—'
                      ) : demande ? (
                        <Pill tone={ETAT_ENTREE[demande.statut].ton}>{ETAT_ENTREE[demande.statut].libelle}</Pill>
                      ) : (
                        <Pill>Code pas encore utilisé</Pill>
                      )}
                    </td>
                    <td>
                      {code && (
                        <div className="acces-actions">
                          {demande && demande.statut !== 'validee' && (
                            <button
                              type="button"
                              className="row-action"
                              disabled={enCours}
                              onClick={() => void executer(() => decider(demande.id, 'validee'))}
                            >
                              {demande.statut === 'refusee' ? (
                                <>
                                  <RotateCcw size={12} aria-hidden="true" /> Rétablir
                                </>
                              ) : (
                                'Valider'
                              )}
                            </button>
                          )}
                          {demande?.statut === 'validee' && (
                            <button
                              type="button"
                              className="row-action"
                              disabled={enCours}
                              onClick={() => void executer(() => decider(demande.id, 'refusee'))}
                            >
                              Suspendre
                            </button>
                          )}
                          <button
                            type="button"
                            className="row-action row-action-danger"
                            disabled={enCours}
                            onClick={() => retirerAcces(r, code.titulaire)}
                          >
                            <Ban size={12} aria-hidden="true" /> Retirer l’accès
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Notice tone="neutral" title="Ce que voit un délégué.">
        Uniquement les établissements et les enseignants de sa région, avec toutes les analyses, simulations et
        rapports. Le Fait de Prince, le référentiel, la configuration du moteur et cette page vous sont réservés.
      </Notice>
    </>
  )
}
