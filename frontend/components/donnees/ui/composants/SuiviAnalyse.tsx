'use client'

/**
 * Avancement de l'analyse d'un import, étape par étape. Chaque étape
 * correspond à un traitement réellement effectué : envoi et lecture des
 * classeurs, contrôle des colonnes, puis contrôle qualité, diagnostic et
 * scénarios de référence, calculés ensemble par le serveur en une seule
 * requête : ces trois étapes passent donc ensemble « en cours », puis sont
 * marquées terminées d'après la réponse.
 *
 * La barre de progression compte les étapes terminées : elle ne simule aucun
 * avancement. Pendant le calcul, `AnimationAnalyse` et un reflet sur la barre
 * montrent que le serveur travaille.
 */

import { motion } from 'motion/react'
import { AlertTriangle, Check, RefreshCw } from 'lucide-react'

import { Panel } from '@shared/ui/commun'

import { AnimationAnalyse } from './AnimationAnalyse'

/** Étapes affichées, dans l'ordre du traitement. */
export const ETAPES_ANALYSE = [
  { cle: 'lecture', titre: 'Lecture des classeurs' },
  { cle: 'colonnes', titre: 'Reconnaissance des colonnes' },
  { cle: 'qualite', titre: 'Contrôle qualité' },
  { cle: 'diagnostic', titre: 'Diagnostic des besoins' },
  { cle: 'simulation', titre: 'Simulation des scénarios de référence' },
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
  const faites = ETAPES_ANALYSE.filter(e => avancement[e.cle]?.etat === 'faite').length
  const total = ETAPES_ANALYSE.length
  const terminee = !enCours && !interrompue && faites === total
  const etapesEnCours = ETAPES_ANALYSE.filter(e => avancement[e.cle]?.etat === 'encours').map(e => e.titre)
  return (
    <Panel kicker="Traitement" title={titre}>
      {(enCours || terminee) && <AnimationAnalyse etapesEnCours={etapesEnCours} terminee={terminee} />}
      <div
        className="progression"
        role="progressbar"
        aria-label="Étapes terminées"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={faites}
        aria-valuetext={`${faites} étape(s) terminée(s) sur ${total}`}
        data-etat={interrompue ? 'bloquee' : enCours ? 'encours' : 'faite'}
      >
        <span className="progression-barre" style={{ transform: `scaleX(${faites / total})` }} />
        {/* Reflet qui balaie la piste : le serveur travaille, la barre ne compte que les étapes faites. */}
        {enCours && <span className="progression-reflet" aria-hidden="true" />}
      </div>
      <p className="hint progression-libelle">
        {faites} étape{faites > 1 ? 's' : ''} terminée{faites > 1 ? 's' : ''} sur {total}
      </p>
      <ol className="avancement">
        {ETAPES_ANALYSE.map((etape, i) => {
          const etat = avancement[etape.cle]?.etat ?? 'attente'
          const detail = avancement[etape.cle]?.detail
          return (
            <motion.li
              key={etape.cle}
              data-etat={etat}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="avancement-marque" aria-hidden="true">
                <Marque etat={etat} />
              </span>
              <span>
                <b>{etape.titre}</b>
                {detail && <small>{detail}</small>}
              </span>
              <span className="sr-only">{LIBELLE_ETAT[etat]}</span>
            </motion.li>
          )
        })}
      </ol>
    </Panel>
  )
}
