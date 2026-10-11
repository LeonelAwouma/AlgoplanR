'use client'

/**
 * Point d'entrée de l'application.
 *
 * L'application est une page unique à navigation interne : la version de
 * bureau sert un export statique, sans serveur Next.js. Les données et les
 * calculs sont ceux du serveur AlgoPlanR (API Django) ; la page affichée et les
 * filtres sont l'état de la session d'interface (`components/shared/session`).
 */

import type { SessionAcces } from '@components/acces'
// ACCÈS DÉSACTIVÉ — voir la note au-dessus de `Page`.
// import { useAcces } from '@components/acces'
// import { EcranConnexion } from '@components/acces/pages'
import { Application } from '@components/racine'

/**
 * ACCÈS DÉSACTIVÉ (AlgoPlanR 1.0.0) : la plateforme s'ouvre directement, sans
 * écran de connexion, avec les droits complets (ceux du DRH). La gestion des
 * accès des délégués régionaux est retirée du menu.
 *
 * Le code du contrôle d'accès est conservé (components/acces) : pour le
 * rétablir, décommenter les blocs marqués « ACCÈS DÉSACTIVÉ » dans ce fichier,
 * dans components/racine et dans components/shared/ui/coquille, puis supprimer `SESSION_DIRECTE`.
 * Le périmètre d'un délégué devra alors être imposé par le serveur, qui seul
 * filtre les données.
 */
const SESSION_DIRECTE: SessionAcces = { role: 'drh' }

export default function Page() {
  // const acces = useAcces()
  // if (!acces.session) return <EcranConnexion acces={acces} />
  // return <Application utilisateur={acces.session} />
  return <Application utilisateur={SESSION_DIRECTE} />
}
