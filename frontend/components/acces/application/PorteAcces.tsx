'use client'

/**
 * Porte d'accès : rien de l'application n'est monté tant que le serveur n'a pas
 * délivré une session complète.
 *
 *   chargement → activation du poste → connexion → nouveau mot de passe
 *     → confirmation de la région (délégué) → application ⇄ verrouillage
 *
 * Postes autonomes : un poste vierge s'active par le fichier signé du DRH, ou
 * par la région et le code d'activation d'un délégué ; un code (activation ou
 * récupération) mène directement à la création du mot de passe personnel.
 *
 * Chaque étape reflète la portée de la session décidée par le serveur ; si un
 * refus arrive pendant le travail (session expirée, compte suspendu…), l'écran
 * correspondant reprend la main. L'interface ne protège rien par elle-même : le
 * serveur refuse toute requête hors de la portée de la session.
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { ApiError, lireJeton, messageErreur, surEvenementAcces } from '../../shared/api'
import { viderCache } from '../../shared/api/backend'
import { useSession } from '../../shared/session'
import { EcranDemarrage } from '../../shared/ui/EcranDemarrage'
import { Notice } from '../../shared/ui/commun'
import {
  sessionDepuisCompte,
  type CompteServeur,
  type EtatPoste,
  type ReponseSession,
  type SessionAcces,
} from '../domain/types'
import { deconnecter, lireEtatPoste, lireSession } from '../infrastructure/accesApi'
import { AvertissementInactivite } from '../ui/AvertissementInactivite'
import { EcranActivationPoste } from '../ui/EcranActivationPoste'
import { EcranConfirmationRegion } from '../ui/EcranConfirmationRegion'
import { EcranConnexion } from '../ui/EcranConnexion'
import { EcranNouveauMotDePasse } from '../ui/EcranNouveauMotDePasse'
import { useInactivite } from './useInactivite'
import { ContexteUtilisateur } from './utilisateur'

type Etat =
  | { ecran: 'chargement' }
  | { ecran: 'injoignable'; motif: string }
  | { ecran: 'activation'; poste: EtatPoste }
  | { ecran: 'connexion'; motif: string | null; poste: EtatPoste | null }
  | { ecran: 'mot_de_passe'; compte: CompteServeur; code?: string }
  | { ecran: 'region'; compte: CompteServeur }
  | { ecran: 'application'; compte: CompteServeur; verrouillee: boolean }

const MOTIFS: Record<string, string> = {
  session_invalide: 'Votre session a été fermée (compte modifié, suspendu ou réaffecté). Reconnectez-vous.',
  non_authentifie: 'Connectez-vous pour accéder à l’application.',
}

/** Écran correspondant à la portée de la session délivrée par le serveur. */
function etatDepuis(reponse: ReponseSession, code?: string): Etat {
  const { compte, session } = reponse
  if (session.portee === 'CHANGEMENT_MDP') return { ecran: 'mot_de_passe', compte, code }
  if (session.portee === 'CONFIRMATION_REGION') return { ecran: 'region', compte }
  return { ecran: 'application', compte, verrouillee: false }
}

export interface ActionsAcces {
  deconnecter: () => void
}

export function PorteAcces({ children }: { children: (session: SessionAcces, actions: ActionsAcces) => ReactNode }) {
  const [etat, setEtat] = useState<Etat>({ ecran: 'chargement' })
  const [derniere, setDerniere] = useState<ReponseSession | null>(null)
  // Lu par l'abonnement aux refus du serveur, sans le réabonner à chaque changement d'écran.
  const verrouilleeRef = useRef(false)
  useEffect(() => {
    verrouilleeRef.current = etat.ecran === 'application' && etat.verrouillee
  }, [etat])
  const client = useQueryClient()
  const { fermerJeu } = useSession()

  /** Oublie tout ce que la personne précédente a chargé : cache des requêtes, jeu ouvert. */
  const oublierDonnees = useCallback(() => {
    client.clear()
    viderCache()
    fermerJeu()
  }, [client, fermerJeu])

  const versConnexion = useCallback(async (motif: string | null = null) => {
    try {
      const poste = await lireEtatPoste()
      setEtat(poste.poste_active ? { ecran: 'connexion', motif, poste } : { ecran: 'activation', poste })
    } catch (err) {
      setEtat({ ecran: 'injoignable', motif: messageErreur(err) })
    }
  }, [])

  // Démarrage : reprend la session de la fenêtre si le serveur la reconnaît encore.
  useEffect(() => {
    let actif = true
    void (async () => {
      if (lireJeton()) {
        try {
          const reponse = await lireSession()
          if (!actif) return
          setDerniere(reponse)
          setEtat(etatDepuis(reponse))
          return
        } catch (err) {
          if (!(err instanceof ApiError) || err.statut === 0) {
            if (actif) setEtat({ ecran: 'injoignable', motif: messageErreur(err) })
            return
          }
        }
      }
      if (actif) await versConnexion()
    })()
    return () => {
      actif = false
    }
  }, [versConnexion])

  const verrouiller = useCallback(() => {
    verrouilleeRef.current = true
    setEtat(e => (e.ecran === 'application' ? { ...e, verrouillee: true } : e))
  }, [])

  // Refus du serveur pendant le travail : l'écran suit la portée réelle de la session.
  useEffect(
    () =>
      surEvenementAcces(evenement => {
        // Écran verrouillé : les requêtes encore en cours sont refusées, c'est attendu.
        if (verrouilleeRef.current) return
        if (evenement === 'session_expiree') {
          verrouiller()
        } else if (evenement === 'mot_de_passe_a_changer' || evenement === 'region_a_confirmer') {
          void lireSession()
            .then(reponse => setEtat(etatDepuis(reponse)))
            .catch(() => undefined)
        } else {
          oublierDonnees()
          void versConnexion(MOTIFS[evenement] ?? null)
        }
      }),
    [verrouiller, oublierDonnees, versConnexion],
  )

  const quitter = useCallback(
    async (motif: string | null = null) => {
      try {
        await deconnecter()
      } catch {
        // Session déjà fermée côté serveur : le jeton est oublié de toute façon.
      }
      oublierDonnees()
      setDerniere(null)
      await versConnexion(motif)
    },
    [oublierDonnees, versConnexion],
  )

  const expirer = useCallback(() => {
    verrouiller()
    // Ferme aussi la session côté serveur, sans attendre qu'il constate l'inactivité.
    void deconnecter().catch(() => undefined)
  }, [verrouiller])

  const connecte = etat.ecran === 'application' && !etat.verrouillee
  const inactivite = useInactivite(connecte, derniere, expirer)

  function ouvrir(reponse: ReponseSession, compteAvant?: CompteServeur, code?: string) {
    // Identifiant, rôle OU région : un compte dont le périmètre change en cours de session ne doit jamais
    // continuer à lire le cache (arbre territorial, listes d'écoles…) calculé pour l'ancien périmètre.
    if (
      compteAvant &&
      (compteAvant.identifiant !== reponse.compte.identifiant ||
        compteAvant.role !== reponse.compte.role ||
        compteAvant.region !== reponse.compte.region)
    )
      oublierDonnees()
    setDerniere(reponse)
    setEtat(etatDepuis(reponse, code))
  }

  /** Code d'activation ou de récupération accepté : création du mot de passe, le code tenant lieu d'actuel. */
  function ouvrirAvecCode(reponse: ReponseSession, code: string) {
    oublierDonnees()
    ouvrir(reponse, undefined, code)
  }

  switch (etat.ecran) {
    case 'chargement':
      return <EcranDemarrage />
    case 'injoignable':
      return (
        <main className="login-screen">
          <div className="login-card">
            <Notice tone="alert" title="Serveur AlgoPlanR injoignable.">
              {etat.motif}
            </Notice>
            <button type="button" className="btn btn-primary" onClick={() => void versConnexion()}>
              Réessayer
            </button>
          </div>
        </main>
      )
    case 'activation':
      return (
        <EcranActivationPoste poste={etat.poste} onActive={() => void versConnexion()} onCodeAccepte={ouvrirAvecCode} />
      )
    case 'connexion':
      return (
        <EcranConnexion
          motif={etat.motif}
          poste={etat.poste}
          onConnecte={r => ouvrir(r)}
          onCodeAccepte={ouvrirAvecCode}
          onFichierApplique={() => void versConnexion('Fichier de l’administration appliqué.')}
        />
      )
    case 'mot_de_passe':
      return (
        <EcranNouveauMotDePasse
          compte={etat.compte}
          actuelConnu={etat.code}
          onChange={r => ouvrir(r)}
          onAbandon={() => void quitter()}
        />
      )
    case 'region':
      return (
        <EcranConfirmationRegion compte={etat.compte} onConfirme={r => ouvrir(r)} onAbandon={() => void quitter()} />
      )
    case 'application': {
      const session = sessionDepuisCompte(etat.compte)
      return (
        <>
          {/* Verrouillée, l'application reste chargée dessous mais devient inerte. */}
          <div className="porte-application" inert={etat.verrouillee}>
            <ContexteUtilisateur.Provider value={session}>
              {children(session, { deconnecter: () => void quitter() })}
            </ContexteUtilisateur.Provider>
          </div>
          {etat.verrouillee && (
            <EcranConnexion
              verrouillage={{ identifiant: etat.compte.identifiant, nom: etat.compte.nom }}
              onConnecte={r => ouvrir(r, etat.compte)}
              onChangerUtilisateur={() => void quitter()}
            />
          )}
          {inactivite.avertissement !== null && (
            <AvertissementInactivite
              secondes={inactivite.avertissement}
              onRester={inactivite.rester}
              onDeconnecter={() => void quitter()}
            />
          )}
        </>
      )
    }
  }
}
