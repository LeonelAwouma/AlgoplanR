'use client'

/**
 * Fournisseurs communs à toute l'application : cache des requêtes vers l'API,
 * puis session d'interface, qui en dépend pour rouvrir le dernier jeu.
 *
 * En développement avec `NEXT_PUBLIC_API_MOCK=1`, les données factices sont
 * démarrées avant le premier rendu, pour qu'aucune requête ne parte vers un
 * serveur absent. Next.js remplace la variable à la compilation : en
 * production, la condition est fausse et le module des données factices n'est
 * pas inclus.
 */

import { useEffect, useState, type ReactNode } from 'react'

import { FournisseurRequetes } from '@shared/requetes'
import { SessionProvider } from '@shared/session'
import { ChargementEnCours } from '@shared/ui/etats'

/**
 * Démarre les données factices si elles sont demandées, `null` sinon.
 *
 * La condition doit porter directement sur `process.env.NEXT_PUBLIC_API_MOCK`,
 * autour de l'import : c'est ce qui permet au compilateur de supprimer l'import
 * (et MSW avec lui) du build de production. Passer par une constante
 * intermédiaire laisserait MSW dans un fragment de l'export, jamais chargé
 * mais livré.
 */
function demarrerSiDemandees(): Promise<void> | null {
  if (process.env.NEXT_PUBLIC_API_MOCK !== '1') return null
  return import('../../mocks/navigateur').then(module => module.demarrerDonneesFactices())
}

/** Attend le démarrage des données factices quand elles sont demandées. */
function useDonneesFacticesPretes(): { pretes: boolean; erreur: string | null } {
  const [pretes, setPretes] = useState(process.env.NEXT_PUBLIC_API_MOCK !== '1')
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    demarrerSiDemandees()
      ?.then(() => setPretes(true))
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : String(e)))
  }, [])

  return { pretes, erreur }
}

export function Fournisseurs({ children }: { children: ReactNode }) {
  const { pretes, erreur } = useDonneesFacticesPretes()

  if (erreur) {
    return (
      <main className="content">
        <p className="hint">Les données factices n’ont pas pu démarrer : {erreur}</p>
      </main>
    )
  }
  if (!pretes) return <ChargementEnCours libelle="Démarrage des données factices…" />

  return (
    <FournisseurRequetes>
      <SessionProvider>{children}</SessionProvider>
    </FournisseurRequetes>
  )
}
