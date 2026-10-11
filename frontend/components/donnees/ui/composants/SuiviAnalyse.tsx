'use client'

/**
 * Avancement de l'analyse d'un import, étape par étape. Chaque étape
 * correspond à un traitement réellement effectué : envoi et lecture des
 * classeurs, contrôle des colonnes, puis calcul complet par le serveur.
 */

import { AlertTriangle, Check, RefreshCw } from 'lucide-react'

import { Panel } from '@shared/ui/commun'

/** Étapes affichées, dans l'ordre du traitement. */
export const ETAPES_ANALYSE = [
  { cle: 'lecture', titre: 'Lecture des classeurs' },
  { cle: 'colonnes', titre: 'Reconnaissance des colonnes' },
  { cle: 'calcul', titre: 'Contrôle qualité, diagnostic et scénarios (calculés par le serveur)' },
] as const

export type CleEtape = (typeof ETAPES_ANALYSE)[number]['cle']
export type EtatEtape = 'attente' | 'encours' | 'faite' | 'bloquee'

export interface AvancementEtape {
  etat: EtatEtape
  detail?: string
}

/** Libellé lu par les lecteurs d'écran pour chaque état. */
const LIBELLE_ETAT: Record<EtatEtape, string> = {
  attente: 'à venir',
  encours: 'en cours',
  faite: 'terminé',
  bloquee: 'interrompu',
}

/** Marque visuelle d'une étape selon son état. */
function Marque({ etat }: { etat: EtatEtape }) {
  if (etat === 'faite') return <Check size={13} />
  if (etat === 'encours') return <RefreshCw size={13} className="spin" />
  if (etat === 'bloquee') return <AlertTriangle size={13} />
  return <span className="avancement-point" />
}

export interface ProprietesSuiviAnalyse {
  avancement: Partial<Record<CleEtape, AvancementEtape>>
  enCours: boolean
  interrompue: boolean
}

/** Panneau d'avancement de l'analyse. */
export function SuiviAnalyse({ avancement, enCours, interrompue }: ProprietesSuiviAnalyse) {
  const titre = enCours ? 'Analyse en cours' : interrompue ? 'Analyse interrompue' : 'Analyse terminée'
  return (
    <Panel kicker="Traitement" title={titre}>
      <ol className="avancement">
        {ETAPES_ANALYSE.map(etape => {
          const etat = avancement[etape.cle]?.etat ?? 'attente'
          const detail = avancement[etape.cle]?.detail
          return (
            <li key={etape.cle} data-etat={etat}>
              <span className="avancement-marque" aria-hidden="true">
                <Marque etat={etat} />
              </span>
              <span>
                <b>{etape.titre}</b>
                {detail && <small>{detail}</small>}
              </span>
              <span className="sr-only">{LIBELLE_ETAT[etat]}</span>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
