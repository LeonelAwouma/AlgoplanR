/**
 * Bande verticale aux couleurs du drapeau camerounais, à l'extrémité gauche de
 * l'interface : trois bandes verticales vert, rouge, jaune, et l'étoile jaune à
 * cinq branches centrée dans la bande rouge.
 *
 * Purement décorative (masquée aux lecteurs d'écran). Ses couleurs sont celles
 * du drapeau (`--drapeau-*`), distinctes des couleurs métier des zones de
 * sécurité, et ne changent pas avec le thème.
 */

/** Étoile à cinq branches, pointe vers le haut, inscrite dans un carré de 100. */
const ETOILE = 'M50 2 L61.2 36.6 L97.6 36.6 L68.2 58 L79.4 92.6 L50 71.2 L20.6 92.6 L31.8 58 L2.4 36.6 L38.8 36.6 Z'

export interface ProprietesCameroonFlagRail {
  /** `accueil` : large et expressive ; `application` : fine et discrète. */
  variante?: 'accueil' | 'application'
}

export function CameroonFlagRail({ variante = 'application' }: ProprietesCameroonFlagRail) {
  return (
    <div className={`drapeau-rail drapeau-rail-${variante}`} aria-hidden="true">
      <span className="drapeau-bande drapeau-vert" />
      <span className="drapeau-bande drapeau-rouge">
        <svg className="drapeau-etoile" viewBox="0 0 100 100" focusable="false">
          <path d={ETOILE} />
        </svg>
      </span>
      <span className="drapeau-bande drapeau-jaune" />
    </div>
  )
}
