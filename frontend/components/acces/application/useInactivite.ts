'use client'

/**
 * Suivi de l'inactivité pendant une session complète.
 *
 * Les gestes de la personne (souris, clavier, molette, toucher) sont relevés ;
 * au plus une fois par minute, ils sont signalés au serveur, qui repousse
 * l'échéance. Deux minutes avant l'échéance, l'avertissement s'affiche : à ce
 * stade, seul « Rester connecté » prolonge la session. À l'échéance, l'écran se
 * verrouille. Le serveur ferme de toute façon la session de lui-même.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { doitSignaler, echeanceDepuis, phaseInactivite, secondesRestantes, type Echeance } from '../domain/inactivite'
import type { ReponseSession } from '../domain/types'
import { signalerActivite } from '../infrastructure/accesApi'

const GESTES = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

export interface Inactivite {
  /** Secondes avant le verrouillage pendant l'avertissement, `null` sinon. */
  avertissement: number | null
  /** « Rester connecté » : prolonge la session. */
  rester: () => void
}

export function useInactivite(
  actif: boolean,
  derniereReponse: ReponseSession | null,
  onExpiration: () => void,
): Inactivite {
  const [echeance, setEcheance] = useState<Echeance | null>(null)
  const [maintenant, setMaintenant] = useState(() => Date.now())
  const derniereActivite = useRef(0)
  const dernierSignal = useRef(0)
  const signalEnCours = useRef(false)

  // Nouvelle réponse du serveur (connexion, déverrouillage) : nouvelle échéance.
  useEffect(() => {
    if (!derniereReponse) return
    const recue = Date.now()
    dernierSignal.current = recue
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'échéance suit la dernière réponse du serveur
    setEcheance(echeanceDepuis(derniereReponse.session, recue))
  }, [derniereReponse])

  const signaler = useCallback(async () => {
    if (signalEnCours.current) return
    signalEnCours.current = true
    dernierSignal.current = Date.now()
    try {
      const reponse = await signalerActivite()
      setEcheance(echeanceDepuis(reponse.session, Date.now()))
    } catch {
      // Session déjà close : le client HTTP a signalé le refus, la porte d'accès verrouille.
    } finally {
      signalEnCours.current = false
    }
  }, [])

  useEffect(() => {
    if (!actif) return
    const noter = () => {
      derniereActivite.current = Date.now()
    }
    for (const g of GESTES) window.addEventListener(g, noter, { passive: true, capture: true })
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), 1000)
    return () => {
      for (const g of GESTES) window.removeEventListener(g, noter, { capture: true })
      window.clearInterval(minuterie)
    }
  }, [actif])

  const phase = actif && echeance ? phaseInactivite(echeance, maintenant) : 'active'

  useEffect(() => {
    if (!actif || !echeance) return
    if (phase === 'expiree') {
      onExpiration()
    } else if (phase === 'active' && doitSignaler(dernierSignal.current, derniereActivite.current, maintenant)) {
      void signaler()
    }
  }, [actif, echeance, phase, maintenant, onExpiration, signaler])

  return {
    avertissement: phase === 'avertissement' && echeance ? secondesRestantes(echeance, maintenant) : null,
    rester: () => void signaler(),
  }
}
