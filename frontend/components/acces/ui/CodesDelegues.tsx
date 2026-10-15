'use client'

/**
 * Codes des délégués — poste du DRH.
 *
 * Les codes, tirés au hasard par l'administration, sont livrés chiffrés avec l'installation ; le fichier
 * d'activation du DRH en apporte la clé et le carnet s'installe à la création de son mot de passe (clé de
 * secours montrée une seule fois à ce moment). Le DRH remet ensuite, région par région, un code d'activation (premier accès du poste du délégué) ou de récupération
 * (mot de passe oublié). Chaque code n'est montré qu'une fois ; aucun n'expire.
 */

import { useState, type FormEvent } from 'react'
import { Copy, KeyRound, LifeBuoy } from 'lucide-react'

import { messageErreur } from '../../shared/api'
import { Notice, Panel, Pill } from '../../shared/ui/commun'
import { useCodes, useDebloquerCarnet, useRemettreCode } from '../application/hooks'
import type { CodeRemis, UsageCode } from '../domain/types'
import { ChampMotDePasse } from './ChampMotDePasse'

const LIBELLE_USAGE: Record<UsageCode, string> = { activation: 'activation', recuperation: 'récupération' }

function Secret({ titre, valeur, consigne }: { titre: string; valeur: string; consigne: string }) {
  const [copie, setCopie] = useState(false)
  return (
    <div className="acces-code-cree" role="status">
      <p>
        <strong>{titre}</strong> {consigne}
      </p>
      <code className="acces-code">{valeur}</code>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => void navigator.clipboard?.writeText(valeur).then(() => setCopie(true))}
      >
        <Copy size={13} aria-hidden="true" /> {copie ? 'Copié' : 'Copier'}
      </button>
    </div>
  )
}

export function CodesDelegues() {
  const codes = useCodes()
  const deblocage = useDebloquerCarnet()
  const remise = useRemettreCode()

  const [secours, setSecours] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [demande, setDemande] = useState<{ region: string; usage: UsageCode } | null>(null)
  const [remisA, setRemisA] = useState('')
  const [codeRemis, setCodeRemis] = useState<CodeRemis | null>(null)
  const [cleSecours, setCleSecours] = useState<string | null>(null)

  const s = codes.data
  const erreur = deblocage.error ?? remise.error ?? codes.error

  function debloquer(e: FormEvent) {
    e.preventDefault()
    deblocage.mutate(
      { cleSecours: secours, motDePasse },
      {
        onSuccess: r => {
          setCleSecours(r.cle_secours)
          setSecours('')
          setMotDePasse('')
        },
      },
    )
  }

  function remettre(e: FormEvent) {
    e.preventDefault()
    if (!demande) return
    remise.mutate(
      { ...demande, motDePasse, remisA },
      {
        onSuccess: r => {
          setCodeRemis(r)
          setDemande(null)
          setMotDePasse('')
          setRemisA('')
        },
      },
    )
  }

  return (
    <Panel
      kicker="Postes des délégués"
      title="Codes d’accès des délégués"
      hint="Chaque délégué active son propre poste, hors réseau, avec un code de 8 caractères remis par vous."
    >
      <div className="stack">
        {cleSecours && (
          <Secret
            titre="Clé de secours du carnet."
            valeur={cleSecours}
            consigne="Notez-la et conservez-la hors de ce poste : elle seule rouvre le carnet si votre mot de passe est réinitialisé. Elle ne sera plus affichée."
          />
        )}
        {codeRemis && (
          <Secret
            titre={`Code de ${LIBELLE_USAGE[codeRemis.usage]} pour ${codeRemis.region}.`}
            valeur={`${codeRemis.code.slice(0, 4)}-${codeRemis.code.slice(4)}`}
            consigne="À communiquer au délégué (téléphone, en personne). Il choisira sa région, saisira ce code, puis créera son mot de passe personnel. Le code ne sera plus affiché."
          />
        )}
        {erreur && <Notice tone="alert">{messageErreur(erreur)}</Notice>}

        {s?.verrouille && (
          <form className="stack" onSubmit={debloquer}>
            <Notice tone="warn" title="Carnet verrouillé.">
              Votre mot de passe a été réinitialisé : saisissez la clé de secours du carnet pour le rouvrir. À défaut,
              demandez à l’administration un fichier de récupération : il réinstalle le carnet (les codes déjà remis
              restent enregistrés).
            </Notice>
            <div className="field">
              <label htmlFor="cle-secours">Clé de secours</label>
              <input
                id="cle-secours"
                className="mono"
                value={secours}
                onChange={e => setSecours(e.target.value)}
                autoComplete="off"
              />
            </div>
            <ChampMotDePasse
              id="secours-mdp"
              libelle="Votre mot de passe"
              valeur={motDePasse}
              onChange={setMotDePasse}
              autoComplete="current-password"
            />
            <button type="submit" className="btn" disabled={!secours || !motDePasse || deblocage.isPending}>
              <LifeBuoy size={14} aria-hidden="true" /> Débloquer le carnet
            </button>
          </form>
        )}

        {s && !s.present && (
          <Notice tone="info" title="Codes non installés.">
            Les codes des délégués sont livrés avec l’installation et s’ouvrent avec le fichier d’activation du DRH. Ce
            poste n’en a pas reçu la clé : demandez à l’administration un fichier d’activation ou de récupération qui
            l’inclut.
          </Notice>
        )}

        {s?.present && (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Région</th>
                  <th>Codes d’activation (disponibles / remis)</th>
                  <th>Codes de récupération (disponibles / remis)</th>
                  <th>Remettre</th>
                </tr>
              </thead>
              <tbody>
                {s.regions.map(r => (
                  <tr key={r.region}>
                    <td>
                      <strong>{r.region}</strong>
                    </td>
                    {(['activation', 'recuperation'] as UsageCode[]).map(u => (
                      <td key={u}>
                        {r[u].disponibles} / {r[u].remis}
                        {r[u].disponibles === 0 && (
                          <>
                            {' '}
                            <Pill tone="warn">épuisé</Pill>
                          </>
                        )}
                      </td>
                    ))}
                    <td>
                      <div className="acces-actions">
                        {(['activation', 'recuperation'] as UsageCode[]).map(u => (
                          <button
                            key={u}
                            type="button"
                            className="row-action"
                            disabled={s.verrouille || r[u].disponibles === 0}
                            onClick={() => {
                              setCodeRemis(null)
                              setDemande({ region: r.region, usage: u })
                            }}
                          >
                            <KeyRound size={13} aria-hidden="true" />{' '}
                            {u === 'activation' ? 'Activation' : 'Récupération'}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {demande && (
          <form className="stack" onSubmit={remettre}>
            <p>
              Remettre un code de <strong>{LIBELLE_USAGE[demande.usage]}</strong> au délégué de{' '}
              <strong>{demande.region}</strong>.
            </p>
            <div className="field">
              <label htmlFor="remis-a">Remis à (nom du délégué, facultatif)</label>
              <input id="remis-a" value={remisA} onChange={e => setRemisA(e.target.value)} />
            </div>
            <ChampMotDePasse
              id="remise-mdp"
              libelle="Votre mot de passe (pour ouvrir le carnet)"
              valeur={motDePasse}
              onChange={setMotDePasse}
              autoComplete="current-password"
            />
            <div className="acces-actions">
              <button type="submit" className="btn btn-primary" disabled={!motDePasse || remise.isPending}>
                Afficher le code
              </button>
              <button type="button" className="btn" onClick={() => setDemande(null)}>
                Annuler
              </button>
            </div>
          </form>
        )}

        {s && s.remises.length > 0 && (
          <details>
            <summary>Codes déjà remis ({s.remises.length})</summary>
            <ul className="historique-acces">
              {s.remises.map(r => (
                <li key={r.entree}>
                  <time dateTime={r.remis_le}>{new Date(r.remis_le).toLocaleString('fr-FR')}</time>
                  <span>
                    {r.region} — {LIBELLE_USAGE[r.usage]} ({r.entree})
                  </span>
                  {r.remis_a && <small>à {r.remis_a}</small>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Panel>
  )
}
