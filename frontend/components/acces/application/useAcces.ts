'use client'

/**
 * Accès à l'application : registre conservé sur le poste et session en cours.
 *
 * La session ne vit que dans cet état React : fermer l'application ou se
 * déconnecter oblige à s'identifier de nouveau. Le registre, lui, est relu au
 * démarrage et réécrit à chaque changement.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RegistreAcces, ResultatEntree, SessionAcces, StatutEntree } from '../domain/types'
import type { RegionCameroun } from '../../shared/kernel/regions'
import {
  REGISTRE_VIDE,
  attribuerCode,
  deciderEntree,
  demanderEntree,
  initialiserDrh,
  retirerAcces,
  verifierDrh,
} from '../domain/registre'
import { chargerRegistre, enregistrerRegistre } from '../infrastructure/stockage'

export function useAcces() {
  /** `null` tant que le registre n'a pas été relu. */
  const [registre, setRegistre] = useState<RegistreAcces | null>(null)
  const [session, setSession] = useState<SessionAcces | null>(null)
  // Dernière version connue, pour enchaîner deux actions sans attendre un rendu.
  const courant = useRef<RegistreAcces>(REGISTRE_VIDE)

  useEffect(() => {
    let actif = true
    chargerRegistre().then(lu => {
      if (!actif) return
      courant.current = lu
      setRegistre(lu)
    })
    return () => {
      actif = false
    }
  }, [])

  const appliquer = useCallback(async (suivant: RegistreAcces) => {
    await enregistrerRegistre(suivant)
    courant.current = suivant
    setRegistre(suivant)
  }, [])

  /** Première utilisation : création du compte du DRH, qui entre aussitôt. */
  const creerDrh = useCallback(
    async (motDePasse: string) => {
      await appliquer(await initialiserDrh(courant.current, motDePasse))
      setSession({ role: 'drh' })
    },
    [appliquer],
  )

  const connecterDrh = useCallback(async (motDePasse: string): Promise<boolean> => {
    const exact = await verifierDrh(courant.current, motDePasse)
    if (exact) setSession({ role: 'drh' })
    return exact
  }, [])

  /** Un délégué présente sa région et son code ; il n'entre que si le DRH a validé. */
  const entrerDelegue = useCallback(
    async (region: RegionCameroun, code: string): Promise<ResultatEntree> => {
      const { registre: suivant, resultat } = await demanderEntree(courant.current, region, code)
      if (suivant !== courant.current) await appliquer(suivant)
      if (resultat.type === 'validee') setSession({ role: 'delegue', region, titulaire: resultat.demande.titulaire })
      return resultat
    },
    [appliquer],
  )

  const deconnecter = useCallback(() => setSession(null), [])

  // --- Actions réservées au DRH ----------------------------------------------

  const attribuer = useCallback(
    async (region: RegionCameroun, titulaire: string): Promise<string> => {
      const { registre: suivant, codeEnClair } = await attribuerCode(courant.current, region, titulaire)
      await appliquer(suivant)
      return codeEnClair
    },
    [appliquer],
  )

  const retirer = useCallback((region: RegionCameroun) => appliquer(retirerAcces(courant.current, region)), [appliquer])

  const decider = useCallback(
    (demandeId: string, statut: Exclude<StatutEntree, 'attente'>) =>
      appliquer(deciderEntree(courant.current, demandeId, statut)),
    [appliquer],
  )

  return { registre, session, creerDrh, connecterDrh, entrerDelegue, deconnecter, attribuer, retirer, decider }
}

export type Acces = ReturnType<typeof useAcces>
