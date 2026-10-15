'use client'

/** Cadre commun des écrans d'accès : logo AlgoPlanR, titre, contenu, rappel du traitement local. */

import Image from 'next/image'
import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'

export function CadreAcces({
  children,
  superpose = false,
}: {
  children: ReactNode
  /** Verrouillage : l'écran recouvre l'application, qui reste chargée dessous. */
  superpose?: boolean
}) {
  return (
    <main className={superpose ? 'login-screen login-superpose' : 'login-screen'}>
      <div className="login-card">
        <Image className="login-logo" src="/logo-full.png" alt="AlgoPlanR" width={640} height={424} priority />
        <p className="login-tagline">Affectation des enseignants</p>
        {children}
        <p className="login-foot">
          <ShieldCheck size={14} aria-hidden="true" /> Traitement local : les données restent sur ce poste.
        </p>
      </div>
    </main>
  )
}
