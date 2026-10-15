'use client'

/**
 * Point d'entrée de l'application.
 *
 * L'application est une page unique à navigation interne : la version de
 * bureau sert un export statique, sans serveur Next.js. Les données et les
 * calculs sont ceux du serveur AlgoPlanR (API Django) ; la page affichée et les
 * filtres sont l'état de la session d'interface (`components/shared/session`).
 *
 * Rien n'est affiché sans une session délivrée par le serveur : `PorteAcces`
 * gère l'activation du poste, la connexion, le changement du mot de passe
 * initial, la confirmation de la région et le verrouillage après inactivité.
 * Le serveur, lui, refuse toute requête hors du périmètre du compte connecté.
 */

import { PorteAcces } from '@components/acces'
import { Application } from '@components/racine'

export default function Page() {
  return (
    <PorteAcces>
      {(utilisateur, acces) => <Application utilisateur={utilisateur} onDeconnexion={acces.deconnecter} />}
    </PorteAcces>
  )
}
