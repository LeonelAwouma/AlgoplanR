'use client'

/**
 * Écran d'entrée : rien de l'application n'est affiché tant que personne n'est
 * identifié.
 *
 * - Première utilisation : le DRH crée son mot de passe.
 * - DRH : mot de passe.
 * - Délégué régional : sa région et le code remis par le DRH. Un code exact ne
 *   suffit pas : l'entrée reste « en attente de validation » jusqu'à la décision
 *   du DRH.
 */

import Image from 'next/image'
import { useState, type FormEvent } from 'react'
import { Clock, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'
import type { ResultatEntree } from '../domain/types'
import { REGIONS_CAMEROUN, type RegionCameroun } from '@shared/kernel'
import { LONGUEUR_MIN_MOT_DE_PASSE } from '../domain/registre'
import { Notice } from '@shared/ui/commun'
import type { Acces } from '../application/useAcces'

type Onglet = 'delegue' | 'drh'

const messageDe = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function EcranConnexion({ acces }: { acces: Acces }) {
  const { registre } = acces
  const [onglet, setOnglet] = useState<Onglet>('delegue')

  return (
    <main className="login-screen">
      <div className="login-card">
        <Image className="login-logo" src="/logo-full.png" alt="AlgoPlanR" width={640} height={424} priority />
        <p className="login-tagline">Affectation des enseignants</p>

        {registre === null ? (
          <p className="hint">Ouverture…</p>
        ) : registre.drh === null ? (
          <PremiereUtilisation acces={acces} />
        ) : (
          <>
            <div className="login-tabs" role="tablist" aria-label="Qui se connecte ?">
              <button
                type="button"
                role="tab"
                aria-selected={onglet === 'delegue'}
                onClick={() => setOnglet('delegue')}
              >
                Délégué régional
              </button>
              <button type="button" role="tab" aria-selected={onglet === 'drh'} onClick={() => setOnglet('drh')}>
                DRH
              </button>
            </div>
            {onglet === 'delegue' ? <EntreeDelegue acces={acces} /> : <EntreeDrh acces={acces} />}
          </>
        )}

        <p className="login-foot">
          <ShieldCheck size={14} aria-hidden="true" /> Traitement entièrement local : aucune donnée ne quitte ce poste.
        </p>
      </div>
    </main>
  )
}

function PremiereUtilisation({ acces }: { acces: Acces }) {
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  async function valider(e: FormEvent) {
    e.preventDefault()
    if (motDePasse !== confirmation) {
      setErreur('Les deux saisies ne sont pas identiques.')
      return
    }
    setEnCours(true)
    setErreur(null)
    try {
      await acces.creerDrh(motDePasse)
    } catch (err) {
      setErreur(messageDe(err))
      setEnCours(false)
    }
  }

  return (
    <form className="login-form" onSubmit={valider}>
      <h1>Première utilisation</h1>
      <p className="hint">
        Créez le mot de passe du DRH. Lui seul accède à toute l’application, remet les codes d’accès aux délégués
        régionaux et valide leurs entrées.
      </p>
      <div className="field">
        <label htmlFor="drh-nouveau">Mot de passe du DRH ({LONGUEUR_MIN_MOT_DE_PASSE} caractères au moins)</label>
        <input
          id="drh-nouveau"
          type="password"
          autoComplete="new-password"
          autoFocus
          value={motDePasse}
          onChange={e => setMotDePasse(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="drh-confirmation">Saisissez-le une seconde fois</label>
        <input
          id="drh-confirmation"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={e => setConfirmation(e.target.value)}
        />
      </div>
      {erreur && <Notice tone="alert">{erreur}</Notice>}
      <button type="submit" className="btn btn-primary" disabled={enCours || !motDePasse || !confirmation}>
        Créer le compte du DRH
      </button>
      <p className="hint">Conservez ce mot de passe : il ne peut pas être retrouvé par l’application.</p>
    </form>
  )
}

function EntreeDrh({ acces }: { acces: Acces }) {
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  async function valider(e: FormEvent) {
    e.preventDefault()
    setEnCours(true)
    setErreur(null)
    try {
      if (!(await acces.connecterDrh(motDePasse))) {
        setErreur('Mot de passe incorrect.')
        setMotDePasse('')
        setEnCours(false)
      }
    } catch (err) {
      setErreur(messageDe(err))
      setEnCours(false)
    }
  }

  return (
    <form className="login-form" onSubmit={valider}>
      <div className="field">
        <label htmlFor="drh-mdp">Mot de passe du DRH</label>
        <input
          id="drh-mdp"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={motDePasse}
          onChange={e => setMotDePasse(e.target.value)}
        />
      </div>
      {erreur && <Notice tone="alert">{erreur}</Notice>}
      <button type="submit" className="btn btn-primary" disabled={enCours || !motDePasse}>
        Se connecter
      </button>
    </form>
  )
}

function EntreeDelegue({ acces }: { acces: Acces }) {
  const [region, setRegion] = useState<RegionCameroun | ''>('')
  const [code, setCode] = useState('')
  const [resultat, setResultat] = useState<ResultatEntree | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  async function presenter() {
    if (!region) return
    setEnCours(true)
    setErreur(null)
    try {
      const issue = await acces.entrerDelegue(region, code)
      setResultat(issue)
      // Entrée validée : l'application s'ouvre, cet écran disparaît.
      if (issue.type !== 'validee') setEnCours(false)
    } catch (err) {
      setErreur(messageDe(err))
      setEnCours(false)
    }
  }

  function valider(e: FormEvent) {
    e.preventDefault()
    void presenter()
  }

  if (resultat?.type === 'attente') {
    return (
      <div className="login-form">
        <div className="login-attente" role="status">
          <Clock size={22} aria-hidden="true" />
          <div>
            <h1>En attente de validation</h1>
            <p>
              Votre code est reconnu pour la région <strong>{resultat.demande.region}</strong>. Le DRH doit maintenant
              valider votre entrée : vous accéderez à l’application dès qu’il l’aura fait.
            </p>
          </div>
        </div>
        {erreur && <Notice tone="alert">{erreur}</Notice>}
        <button type="button" className="btn btn-primary" disabled={enCours} onClick={() => void presenter()}>
          <RefreshCw size={14} aria-hidden="true" /> Vérifier si mon entrée est validée
        </button>
        <button type="button" className="btn-link" onClick={() => setResultat(null)}>
          Revenir à la saisie
        </button>
      </div>
    )
  }

  return (
    <form className="login-form" onSubmit={valider}>
      <div className="field">
        <label htmlFor="delegue-region">Votre région</label>
        <select id="delegue-region" value={region} onChange={e => setRegion(e.target.value as RegionCameroun | '')}>
          <option value="">Choisissez votre région</option>
          {REGIONS_CAMEROUN.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="delegue-code">Code d’accès remis par le DRH</label>
        <input
          id="delegue-code"
          type="text"
          className="login-code"
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXX"
          maxLength={12}
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
        />
      </div>
      {resultat?.type === 'refus' && <Notice tone="alert">{resultat.motif}</Notice>}
      {resultat?.type === 'refusee' && (
        <Notice tone="alert" title="Entrée refusée.">
          Le DRH n’a pas autorisé votre entrée pour la région {resultat.demande.region}. Rapprochez-vous de lui.
        </Notice>
      )}
      {erreur && <Notice tone="alert">{erreur}</Notice>}
      <button type="submit" className="btn btn-primary" disabled={enCours || !region || !code.trim()}>
        <KeyRound size={14} aria-hidden="true" /> Demander l’entrée
      </button>
      <p className="hint">Votre accès est limité aux établissements et aux enseignants de votre région.</p>
    </form>
  )
}
