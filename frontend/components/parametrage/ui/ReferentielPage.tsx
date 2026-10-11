'use client'

/**
 * Référentiel — les règles de l'analyse.
 *
 * Chaque réglage reprend un « paramètre à valider par la DRH » du Référentiel
 * technique de modélisation, formulé comme une phrase qu'un responsable éducatif
 * peut lire et valider sans connaissance technique. Les modifications sont
 * saisies dans un brouillon, puis enregistrées en une fois : le serveur relance
 * alors les calculs. Les barèmes chiffrés vivent dans « Configuration du moteur ».
 */

import { SlidersHorizontal } from 'lucide-react'

import { useSession } from '@shared/session'
import { EmptyState, Notice, Panel } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { useCalculerScenariosDeBase, useScenarios } from '@components/simulation'

import { BarreEnregistrement } from './composants/BarreEnregistrement'
import { ReglesBesoin } from './composants/referentiel/ReglesBesoin'
import { ReglesGravitePriorite } from './composants/referentiel/ReglesGravitePriorite'
import { ReglesMobilite } from './composants/referentiel/ReglesMobilite'
import { SauvegardeRegles } from './composants/referentiel/SauvegardeRegles'
import { useBrouillonParametres } from './useBrouillonParametres'

/** Page « Référentiel ». */
export function ReferentielPage() {
  const { jeu, mode, setPage } = useSession()
  const brouillon = useBrouillonParametres(jeu)
  const scenarios = useScenarios(jeu)
  const calculBase = useCalculerScenariosDeBase(jeu)

  if (!jeu) {
    return (
      <EmptyState
        titre="Aucun jeu de données ouvert"
        action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}
      >
        Les règles de l’analyse sont enregistrées avec chaque jeu de données : ouvrez ou importez un jeu pour les
        régler.
      </EmptyState>
    )
  }
  if (!brouillon.parametres) return <EtatRequetes requetes={[brouillon.requete]} />

  const obsolete = (scenarios.data ?? []).some(s => s.obsolete)

  return (
    <div className="stack">
      <Notice tone="info" title="Ce que vous réglez ici.">
        Ces règles sont celles du Référentiel technique de modélisation des plans de rotation, de redéploiement et de
        déploiement. Le référentiel les désigne comme paramètres à valider par la DRH : les valeurs proposées sont ses
        valeurs par défaut. Elles sont reprises telles quelles dans la Méthodologie et dans le rapport.
      </Notice>

      {obsolete && !brouillon.modifie && (
        <Notice tone="warn" title="Les règles de l’analyse ont changé.">
          Les résultats affichés ont été calculés avec les anciennes règles.{' '}
          <button
            type="button"
            className="btn-link"
            disabled={calculBase.isPending}
            onClick={() => calculBase.mutate()}
          >
            Mettre à jour les simulations
          </button>
        </Notice>
      )}

      <BarreEnregistrement
        modifie={brouillon.modifie}
        enCours={brouillon.enregistrement.isPending}
        erreur={brouillon.enregistrement.error}
        onEnregistrer={brouillon.enregistrer}
        onAnnuler={brouillon.annuler}
      />

      <ReglesBesoin parametres={brouillon.parametres} maj={brouillon.maj} />
      <ReglesGravitePriorite parametres={brouillon.parametres} maj={brouillon.maj} />
      <ReglesMobilite parametres={brouillon.parametres} maj={brouillon.maj} />
      <SauvegardeRegles jeu={jeu} parametres={brouillon.parametres} onRetablirDefaut={brouillon.retablirDefaut} />

      {mode === 'analyste' && (
        <Panel kicker="Vue analyste" title="Barèmes chiffrés du moteur">
          <p className="hint">
            Le barème individuel, le score d’appariement Score(e, p) et leurs points (proximité, ajustements) se règlent
            sur une page distincte.
          </p>
          <button type="button" className="btn" onClick={() => setPage('engine')}>
            <SlidersHorizontal size={14} aria-hidden="true" /> Ouvrir la configuration du moteur
          </button>
        </Panel>
      )}
    </div>
  )
}
