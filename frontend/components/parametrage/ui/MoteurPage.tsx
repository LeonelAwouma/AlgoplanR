'use client'

/**
 * Configuration du moteur — Vue analyste uniquement.
 *
 * Les barèmes chiffrés de la note : le barème individuel (C1 à C5), le score
 * d'appariement Score(e, p) qui classe les candidats à un poste, et les points par
 * situation matrimoniale. Seuls les champs que le serveur applique sont modifiables
 * (voir domain/champsMoteur.ts). Ces réglages modifient le classement des
 * enseignants : ils n'ont de sens que si la méthodologie correspondante a été
 * validée. Comme le Référentiel, ils sont saisis puis enregistrés en une fois.
 */

import { ShieldAlert } from 'lucide-react'

import { useSession } from '@shared/session'
import { EmptyState, Notice, Panel } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { useSituationsFamiliales } from '../application/hooks'
import { BarreEnregistrement } from './composants/BarreEnregistrement'
import { Ponderations } from './composants/moteur/Ponderations'
import { SituationsFamiliales } from './composants/moteur/SituationsFamiliales'
import { useBrouillonParametres } from './useBrouillonParametres'

/** Page « Configuration du moteur ». */
export function MoteurPage() {
  const { jeu, setPage } = useSession()
  const brouillon = useBrouillonParametres(jeu)
  const situations = useSituationsFamiliales(jeu)

  if (!jeu) {
    return (
      <EmptyState
        titre="Aucun jeu de données ouvert"
        action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}
      >
        Les barèmes du moteur sont enregistrés avec chaque jeu de données : ouvrez ou importez un jeu pour les régler.
      </EmptyState>
    )
  }
  if (!brouillon.parametres) return <EtatRequetes requetes={[brouillon.requete]} />

  return (
    <div className="stack">
      <Notice tone="warn" title="Réglages réservés à un usage averti.">
        Modifier ces paramètres change la manière dont les enseignants sont classés dans les simulations. Ces réglages
        doivent être modifiés uniquement si la méthodologie correspondante a été validée.
      </Notice>

      <BarreEnregistrement
        modifie={brouillon.modifie}
        enCours={brouillon.enregistrement.isPending}
        erreur={brouillon.enregistrement.error}
        onEnregistrer={brouillon.enregistrer}
        onAnnuler={brouillon.annuler}
      />

      <Panel
        kicker="Repère"
        title="Les règles de gestion sont ailleurs"
        hint="Norme d’encadrement, minimum pédagogique, double flux, priorités des écoles et règles de mobilité se règlent dans le Référentiel."
      >
        <button type="button" className="btn" onClick={() => setPage('settings')}>
          Ouvrir le Référentiel
        </button>
      </Panel>

      <Ponderations parametres={brouillon.parametres} maj={brouillon.maj} />
      <SituationsFamiliales
        parametres={brouillon.parametres}
        maj={brouillon.maj}
        inventaire={situations.data ?? null}
      />

      <Panel kicker="Vérification" title="Configuration effective">
        <details className="advanced">
          <summary>
            <ShieldAlert size={13} aria-hidden="true" /> Voir la configuration complète (JSON)
          </summary>
          <pre className="code">{JSON.stringify(brouillon.parametres, null, 2)}</pre>
        </details>
      </Panel>
    </div>
  )
}
