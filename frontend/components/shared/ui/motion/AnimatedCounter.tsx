'use client'

/**
 * Compteur animé : fait défiler un nombre déjà formaté (« 1 234 », « 54 % »)
 * jusqu'à sa valeur, en gardant son format.
 *
 * N'anime que de vraies valeurs : un texte sans nombre unique (« — », « … »)
 * est affiché tel quel. Sans animation si l'utilisateur a demandé de réduire
 * les animations. Le nombre final est toujours exposé aux lecteurs d'écran.
 */

import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { decomposerNombre, formaterNombre } from './nombres'

export function AnimatedCounter({ valeur, duree = 0.7 }: { valeur: string; duree?: number }) {
  const reduit = useReducedMotion()
  // Part de zéro (au format de la valeur) pour éviter d'afficher un instant la valeur finale.
  const [affiche, setAffiche] = useState(() => {
    const nombre = decomposerNombre(valeur)
    return nombre ? formaterNombre(nombre, 0) : valeur
  })
  const precedent = useRef<number | null>(null)

  useEffect(() => {
    const nombre = decomposerNombre(valeur)
    if (!nombre || reduit) {
      precedent.current = nombre?.valeur ?? null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- valeur non animable : affichage direct
      setAffiche(valeur)
      return
    }
    const depart = precedent.current ?? 0
    precedent.current = nombre.valeur
    const controle = animate(depart, nombre.valeur, {
      duration: duree,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: v => setAffiche(formaterNombre(nombre, v)),
      onComplete: () => setAffiche(valeur),
    })
    return () => controle.stop()
  }, [valeur, duree, reduit])

  return (
    <>
      <span aria-hidden="true">{affiche}</span>
      <span className="sr-only">{valeur}</span>
    </>
  )
}
