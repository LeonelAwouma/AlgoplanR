'use client'

/** Carte de présentation d'une grande fonction d'AlgoPlanR sur l'écran de bienvenue. */

import { motion, type Variants } from 'motion/react'
import type { LucideIcon } from 'lucide-react'

/** Révélation séquentielle des cartes, pilotée par la grille parente. */
export const APPARITION_CARTE: Variants = {
  cache: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

export interface ProprietesFeatureCard {
  Icone: LucideIcon
  titre: string
  description: string
}

export function FeatureCard({ Icone, titre, description }: ProprietesFeatureCard) {
  return (
    <motion.article
      className="bienvenue-carte"
      variants={APPARITION_CARTE}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
    >
      <span className="bienvenue-carte-icone" aria-hidden="true">
        <Icone size={20} />
      </span>
      <h2>{titre}</h2>
      <p>{description}</p>
    </motion.article>
  )
}
