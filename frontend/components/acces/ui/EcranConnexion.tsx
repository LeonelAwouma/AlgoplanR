'use client'

/**
 * Connexion par identifiant et mot de passe, vérifiés par le serveur.
 *
 * Deux recours, sans réseau : un délégué qui a oublié son mot de passe saisit le code de récupération remis par
 * le DRH ; un fichier signé de l'administration (récupération du DRH, nouveau catalogue de codes) s'importe ici.
 *
 * En mode verrouillage (après inactivité), l'identifiant est figé : seule la
 * personne déjà connectée peut reprendre sa session ; une autre doit d'abord se
 * déconnecter, ce qui ferme l'application.
 */

import { useState, type FormEvent } from 'react'
import { Lock, LogIn, RefreshCw } from 'lucide-react'

import { messageErreur } from '../../shared/api'
import { Notice } from '../../shared/ui/commun'
import { useConnexion } from '../application/hooks'
import type { EtatPoste, ReponseSession } from '../domain/types'
import { CadreAcces } from './CadreAcces'
import { ChampMotDePasse } from './ChampMotDePasse'
import { FormulaireCode } from './FormulaireCode'
import { FormulaireFichier } from './FormulaireFichier'

type Mode = 'connexion' | 'recuperation' | 'fichier'

export function EcranConnexion({
  onConnecte,
  verrouillage,
  motif,
  onChangerUtilisateur,
  poste,
  onCodeAccepte,
  onFichierApplique,
}: {
  onConnecte: (reponse: ReponseSession) => void
  /** Session verrouillée après inactivité : identifiant figé. */
  verrouillage?: { identifiant: string; nom: string }
  /** Raison du retour à cet écran (session expirée, compte suspendu…). */
  motif?: string | null
  onChangerUtilisateur?: () => void
  /** État du poste : identifiant du délégué pré-rempli, recours proposés. */
  poste?: EtatPoste | null
  onCodeAccepte?: (reponse: ReponseSession, code: string) => void
  onFichierApplique?: () => void
}) {
  const [mode, setMode] = useState<Mode>('connexion')
  const [identifiant, setIdentifiant] = useState(verrouillage?.identifiant ?? poste?.identifiant ?? '')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const connexion = useConnexion()

  async function valider(e: FormEvent) {
    e.preventDefault()
    setEnCours(true)
    setErreur(null)
    try {
      onConnecte(await connexion.mutateAsync({ identifiant, motDePasse }))
    } catch (err) {
      setErreur(messageErreur(err))
      setMotDePasse('')
      setEnCours(false)
    }
  }

  if (mode !== 'connexion' && !verrouillage) {
    return (
      <CadreAcces>
        <div className="login-form">
          <h1>{mode === 'recuperation' ? 'Mot de passe oublié' : 'Importer un fichier de l’administration'}</h1>
          <p className="hint">
            {mode === 'recuperation'
              ? 'Saisissez le code de récupération que le DRH vous a remis : vous créerez ensuite un nouveau mot de passe. Vos données sont conservées.'
              : 'Fichier signé par l’administration AlgoPlanR : récupération du compte du DRH ou nouveau catalogue de codes.'}
          </p>
        </div>
        {mode === 'recuperation' ? (
          <FormulaireCode
            usage="recuperation"
            regionImposee={poste?.region ?? null}
            onAccepte={(r, code) => onCodeAccepte?.(r, code)}
          />
        ) : (
          <FormulaireFichier
            libelle="Importer le fichier"
            onApplique={() => {
              setMode('connexion')
              onFichierApplique?.()
            }}
          />
        )}
        <button type="button" className="btn-link" onClick={() => setMode('connexion')}>
          Retour à la connexion
        </button>
      </CadreAcces>
    )
  }

  return (
    <CadreAcces superpose={!!verrouillage}>
      <form className="login-form" onSubmit={valider} aria-busy={enCours}>
        {verrouillage ? (
          <div className="login-verrou">
            <Lock size={20} aria-hidden="true" />
            <div>
              <h1>Session verrouillée</h1>
              <p>
                Après 20 minutes d’inactivité, la session de <strong>{verrouillage.nom}</strong> a été fermée. Saisissez
                votre mot de passe pour reprendre votre travail.
              </p>
            </div>
          </div>
        ) : (
          <h1>Connexion</h1>
        )}
        {motif && !verrouillage && <Notice tone="warn">{motif}</Notice>}

        <div className="field">
          <label htmlFor="acces-identifiant">Identifiant</label>
          <input
            id="acces-identifiant"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={!verrouillage}
            readOnly={!!verrouillage}
            disabled={enCours}
            value={identifiant}
            onChange={e => setIdentifiant(e.target.value)}
          />
        </div>
        <ChampMotDePasse
          id="acces-mot-de-passe"
          libelle="Mot de passe"
          valeur={motDePasse}
          onChange={setMotDePasse}
          autoComplete="current-password"
          autoFocus={!!verrouillage}
          desactive={enCours}
        />

        {erreur && <Notice tone="alert">{erreur}</Notice>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={enCours || !identifiant.trim() || !motDePasse}
          {...{ autoComplete: 'off' }}
        >
          {enCours ? (
            <RefreshCw size={15} className="spin" aria-hidden="true" />
          ) : (
            <LogIn size={15} aria-hidden="true" />
          )}
          {enCours ? 'Vérification…' : verrouillage ? 'Déverrouiller' : 'Se connecter'}
        </button>
        {verrouillage && onChangerUtilisateur && (
          <button type="button" className="btn-link" onClick={onChangerUtilisateur} disabled={enCours}>
            Changer d’utilisateur
          </button>
        )}
        {!verrouillage && (
          <>
            {poste?.profil !== 'drh' && onCodeAccepte && (
              <button type="button" className="btn-link" onClick={() => setMode('recuperation')} disabled={enCours}>
                Mot de passe oublié (délégué) : code de récupération
              </button>
            )}
            {onFichierApplique && (
              <button type="button" className="btn-link" onClick={() => setMode('fichier')} disabled={enCours}>
                Importer un fichier de l’administration
              </button>
            )}
            <p className="hint">
              {poste?.profil === 'region'
                ? `Poste de la région ${poste.region ?? ''} : connectez-vous avec l’identifiant du délégué et votre mot de passe personnel.`
                : 'Le DRH se connecte avec le compte créé par son fichier d’activation ; un délégué, avec l’identifiant de sa région.'}
            </p>
          </>
        )}
      </form>
    </CadreAcces>
  )
}
