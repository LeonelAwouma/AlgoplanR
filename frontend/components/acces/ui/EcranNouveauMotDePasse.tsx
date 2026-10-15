'use client'

/**
 * Changement obligatoire du mot de passe temporaire, à la première connexion.
 *
 * Tant qu'il n'est pas fait, le serveur refuse toutes les autres routes : cet
 * écran ne protège rien à lui seul, il guide la saisie.
 *
 * Après un code d'activation ou de récupération, le code tient lieu de mot de
 * passe actuel : il n'est pas redemandé. Il est consommé par le serveur au moment
 * où le mot de passe personnel est enregistré, dans la même opération.
 */

import { useState, type FormEvent } from 'react'
import { Check, Copy, KeyRound, RefreshCw, X } from 'lucide-react'

import { ApiError, messageErreur } from '../../shared/api'
import { Notice } from '../../shared/ui/commun'
import { useChangerMotDePasse } from '../application/hooks'
import { motDePasseAcceptable, reglesMotDePasse } from '../domain/motDePasse'
import type { CompteServeur, ReponseSession } from '../domain/types'
import { CadreAcces } from './CadreAcces'
import { ChampMotDePasse } from './ChampMotDePasse'

export function EcranNouveauMotDePasse({
  compte,
  onChange,
  onAbandon,
  actuelConnu,
}: {
  compte: CompteServeur
  onChange: (reponse: ReponseSession) => void
  onAbandon: () => void
  /** Code d'accès venant d'être accepté par le serveur : il sert de mot de passe actuel. */
  actuelConnu?: string
}) {
  const [actuel, setActuel] = useState(actuelConnu ?? '')
  const [nouveau, setNouveau] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState<{ motif: string; details: string[] } | null>(null)
  const [enCours, setEnCours] = useState(false)
  const changement = useChangerMotDePasse()
  /** Carnet du DRH installé : la clé de secours est montrée une fois avant d'ouvrir l'application. */
  const [installe, setInstalle] = useState<ReponseSession | null>(null)
  const [copie, setCopie] = useState(false)

  const regles = reglesMotDePasse(nouveau, confirmation, compte.identifiant)
  const acceptable = motDePasseAcceptable(nouveau, confirmation, compte.identifiant)

  async function valider(e: FormEvent) {
    e.preventDefault()
    setEnCours(true)
    setErreur(null)
    try {
      const reponse = await changement.mutateAsync({ actuel, nouveau, confirmation })
      if (reponse.cle_secours) setInstalle(reponse)
      else onChange(reponse)
    } catch (err) {
      const details = err instanceof ApiError && Array.isArray(err.details) ? (err.details as string[]) : []
      setErreur({
        motif: err instanceof ApiError && details.length ? 'Nouveau mot de passe refusé.' : messageErreur(err),
        details,
      })
      setEnCours(false)
    }
  }

  if (installe?.cle_secours) {
    const cle = installe.cle_secours
    return (
      <CadreAcces>
        <div className="login-form">
          <h1>Clé de secours des codes</h1>
          <p className="hint">
            Votre mot de passe est enregistré et les codes des délégués sont installés sur ce poste. Notez cette clé de
            secours et conservez-la hors du poste : elle seule rouvre les codes si votre mot de passe est réinitialisé.
            Elle ne sera plus jamais affichée.
          </p>
          <code className="acces-code">{cle}</code>
          <button
            type="button"
            className="btn"
            onClick={() => void navigator.clipboard?.writeText(cle).then(() => setCopie(true))}
          >
            <Copy size={15} aria-hidden="true" /> {copie ? 'Copiée' : 'Copier la clé'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onChange(installe)}>
            J’ai noté la clé, continuer
          </button>
        </div>
      </CadreAcces>
    )
  }

  return (
    <CadreAcces>
      <form className="login-form" onSubmit={valider} aria-busy={enCours}>
        <h1>Créez votre mot de passe</h1>
        {actuelConnu ? (
          <p className="hint">
            Code accepté. Votre identifiant de connexion est <strong className="mono">{compte.identifiant}</strong> :
            notez-le. Choisissez maintenant votre mot de passe personnel ; le code ne servira plus sur ce poste.
          </p>
        ) : (
          <p className="hint">
            {compte.nom}, le mot de passe qui vous a été remis est temporaire et ne sert qu’une fois. Choisissez
            maintenant votre mot de passe personnel : l’application reste fermée tant qu’il n’est pas enregistré.
          </p>
        )}
        {!actuelConnu && (
          <ChampMotDePasse
            id="mdp-actuel"
            libelle="Mot de passe temporaire"
            valeur={actuel}
            onChange={setActuel}
            autoComplete="current-password"
            autoFocus
            desactive={enCours}
          />
        )}
        <ChampMotDePasse
          id="mdp-nouveau"
          libelle="Nouveau mot de passe"
          valeur={nouveau}
          onChange={setNouveau}
          autoComplete="new-password"
          desactive={enCours}
          decritPar="mdp-regles"
        />
        <ChampMotDePasse
          id="mdp-confirmation"
          libelle="Confirmez le nouveau mot de passe"
          valeur={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
          desactive={enCours}
        />
        <ul className="regles-mdp" id="mdp-regles" aria-label="Règles du mot de passe">
          {regles.map(r => (
            <li key={r.libelle} data-ok={r.ok}>
              {r.ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
              <span>{r.libelle}</span>
              <span className="sr-only">{r.ok ? ' : respectée' : ' : non respectée'}</span>
            </li>
          ))}
        </ul>
        {erreur && (
          <Notice tone="alert" title={erreur.motif}>
            {erreur.details.join(' ')}
          </Notice>
        )}
        <button type="submit" className="btn btn-primary" disabled={enCours || !actuel || !acceptable}>
          {enCours ? (
            <RefreshCw size={15} className="spin" aria-hidden="true" />
          ) : (
            <KeyRound size={15} aria-hidden="true" />
          )}
          {enCours ? 'Enregistrement…' : 'Enregistrer mon mot de passe'}
        </button>
        <button type="button" className="btn-link" onClick={onAbandon} disabled={enCours}>
          Se déconnecter
        </button>
      </form>
    </CadreAcces>
  )
}
