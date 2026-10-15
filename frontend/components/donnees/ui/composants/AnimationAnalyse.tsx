'use client'

/**
 * Animation affichée pendant l'analyse d'un import : anneaux qui pulsent et
 * points en orbite autour d'un cœur de calcul, et libellé des étapes que le
 * serveur traite. Quand plusieurs étapes sont en cours ensemble (contrôle
 * qualité, diagnostic et scénarios partent en une seule requête), le libellé
 * les fait défiler : il nomme le travail en cours, sans simuler d'avancement.
 *
 * Purement décorative : l'état de chaque étape est donné, pour les lecteurs
 * d'écran, par la liste de `SuiviAnalyse`. Avec « réduire les animations »,
 * elle reste immobile.
 */

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, Cpu } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Décalage de départ de chaque anneau, en secondes. */
const ANNEAUX = [0, 0.6, 1.2]
/** Position de départ de chaque point en orbite, en degrés. */
const POINTS = [0, 120, 240]
/** Durée d'affichage de chaque libellé quand plusieurs étapes sont en cours. */
const DUREE_LIBELLE_MS = 1800
const EASE_DOUX = [0.22, 1, 0.36, 1] as const

export interface ProprietesAnimationAnalyse {
  /** Titres des étapes en cours, dans l'ordre du traitement. */
  etapesEnCours: readonly string[]
  /** Toutes les étapes sont terminées : la coche remplace le cœur de calcul. */
  terminee: boolean
}

export function AnimationAnalyse({ etapesEnCours, terminee }: ProprietesAnimationAnalyse) {
  const reduit = useReducedMotion()
  const anime = !terminee && !reduit
  const nombre = etapesEnCours.length
  const [indice, setIndice] = useState(0)

  useEffect(() => {
    if (!anime || nombre < 2) return
    const minuteur = window.setInterval(() => setIndice(i => i + 1), DUREE_LIBELLE_MS)
    return () => window.clearInterval(minuteur)
  }, [anime, nombre])

  const etape = nombre > 0 ? etapesEnCours[indice % nombre] : null
  const libelle = terminee
    ? 'Analyse terminée : ouverture de la vue d’ensemble…'
    : etape
      ? `Traitement sur le serveur : ${etape.toLowerCase()}…`
      : 'Préparation de l’analyse…'

  return (
    <div className="analyse-anim" data-etat={terminee ? 'faite' : 'encours'} aria-hidden="true">
      <div className="analyse-scene">
        {anime &&
          ANNEAUX.map(delai => (
            <motion.span
              key={delai}
              className="analyse-anneau"
              initial={{ scale: 0.6, opacity: 0.6 }}
              animate={{ scale: 1.75, opacity: 0 }}
              transition={{ duration: 1.8, delay: delai, repeat: Infinity, ease: 'easeOut' }}
            />
          ))}
        {anime && (
          <motion.span
            className="analyse-orbite"
            animate={{ rotate: 360 }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
          >
            {POINTS.map(angle => (
              <span
                key={angle}
                className="analyse-point"
                style={{ transform: `rotate(${angle}deg) translateX(46px)` }}
              />
            ))}
          </motion.span>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {terminee ? (
            <motion.span
              key="faite"
              className="analyse-coeur analyse-coeur-fait"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 16 }}
            >
              <Check size={26} />
            </motion.span>
          ) : (
            <motion.span
              key="encours"
              className="analyse-coeur"
              initial={{ opacity: 0 }}
              animate={anime ? { opacity: 1, scale: [1, 1.08, 1] } : { opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={
                anime
                  ? { scale: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.2 } }
                  : { duration: 0.2 }
              }
            >
              <Cpu size={24} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <p className="analyse-libelle">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={libelle}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: EASE_DOUX }}
          >
            {libelle}
          </motion.span>
        </AnimatePresence>
      </p>
    </div>
  )
}
