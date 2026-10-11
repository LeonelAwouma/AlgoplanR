'use client'

/**
 * Mises à jour de l'application de bureau.
 *
 * Le téléchargement se fait en arrière-plan, sans rien demander. L'interface ne
 * se manifeste qu'à deux moments : pendant le téléchargement (discrètement) et
 * quand la nouvelle version est prête. Elle s'installera alors à la fermeture,
 * ou tout de suite si l'utilisateur le choisit.
 *
 * Les données sont conservées par le serveur AlgoPlanR, dans sa base : un
 * redémarrage ne les efface pas, et le jeu ouvert est rouvert au démarrage.
 */

import { useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { EtatMiseAJour } from '@shared/bureau/desktop'

/** État des mises à jour, `null` hors de l'application de bureau. */
export function useMiseAJour(): EtatMiseAJour | null {
  const [etat, setEtat] = useState<EtatMiseAJour | null>(null)

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.algobaba?.misesAJour : undefined
    if (!api) return
    let actif = true
    api.etat().then(e => {
      if (actif) setEtat(e)
    })
    const desabonner = api.surChangement(e => setEtat(e))
    return () => {
      actif = false
      desabonner()
    }
  }, [])

  return etat
}

/** Bandeau affiché en haut du contenu pendant le téléchargement et quand la version est prête. */
export function BandeauMiseAJour({ etat, donneesChargees }: { etat: EtatMiseAJour | null; donneesChargees: boolean }) {
  const [installation, setInstallation] = useState(false)

  if (!etat) return null

  if (etat.phase === 'telechargement') {
    return (
      <div className="maj-bandeau maj-bandeau-discret no-print" role="status">
        <RefreshCw size={15} className="spin" aria-hidden="true" />
        <span>
          Téléchargement de la version {etat.nouvelleVersion} d’AlgoPlanR en arrière-plan
          {etat.pourcentage != null ? ` — ${etat.pourcentage} %` : ''}. Vous pouvez continuer à travailler.
        </span>
      </div>
    )
  }

  if (etat.phase !== 'prete') return null

  return (
    <div className="maj-bandeau no-print" role="status">
      <Download size={17} aria-hidden="true" />
      <div className="maj-texte">
        <strong>La version {etat.nouvelleVersion} d’AlgoPlanR est prête.</strong>
        <span>
          Elle s’installera automatiquement à la fermeture de l’application.
          {donneesChargees
            ? ' Vous pouvez aussi l’installer maintenant : les données et les décisions enregistrées sont conservées et seront retrouvées au redémarrage.'
            : ' Vous pouvez aussi l’installer maintenant.'}
        </span>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={installation}
        onClick={() => {
          setInstallation(true)
          window.algobaba?.misesAJour.installer()
        }}
      >
        {installation ? <RefreshCw size={14} className="spin" aria-hidden="true" /> : null}
        Redémarrer et installer
      </button>
    </div>
  )
}
