'use client'

/**
 * Entrée douce d'une page quand on change de module : fondu et légère
 * remontée. Pas d'animation de sortie, pour ne jamais retarder l'affichage de
 * la page demandée.
 */

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

export function PageTransition({ cle, children }: { cle: string; children: ReactNode }) {
  return (
    <motion.div
      key={cle}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
