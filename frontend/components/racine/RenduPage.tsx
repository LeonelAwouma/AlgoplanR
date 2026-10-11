'use client'

/**
 * Aiguillage des pages : associe chaque entrée de navigation à l'écran du
 * contexte qui la porte. C'est le seul endroit qui importe les `pages.ts` des
 * contextes.
 */

import { ArbitragePage } from '@components/arbitrage/pages'
import { JournalAuditPage } from '@components/audit/pages'
import { PrioritesPage, SituationNationalePage, TerritoiresPage, VueEnsemblePage } from '@components/diagnostic/pages'
import { EcolesPage, EnseignantsPage, ImportPage, QualiteDonneesPage, ValidationPage } from '@components/donnees/pages'
import { MethodologiePage } from '@components/methodologie/pages'
import { MouvementsPage, NominationsPage, VivierPage } from '@components/nominations/pages'
import { MoteurPage, ReferentielPage } from '@components/parametrage/pages'
import { HypothesesPage, IndicateursPage, PlanificationPage, QuotasPage } from '@components/planification/pages'
import { PrincePage } from '@components/prince/pages'
import { RapportPage } from '@components/rapports/pages'
import { RecrutesPage } from '@components/recrutement/pages'
import {
  AffectationsPage,
  ComparaisonPage,
  JournalSimulationPage,
  NonAffectesPage,
  PostesPage,
  ScenariosPage,
  VivierScenarioPage,
  VoeuxPage,
} from '@components/simulation/pages'
import type { PageKey } from '@shared/ui/coquille/navigation'

/**
 * Écran correspondant à une entrée de navigation.
 *
 * Le `switch` est exhaustif : ajouter une `PageKey` sans écran fait échouer la
 * compilation.
 */
export function RenduPage({ page }: { page: PageKey }) {
  switch (page) {
    // Collecter
    case 'import':
      return <ImportPage />
    case 'validation':
      return <ValidationPage />

    // Analyser
    case 'overview':
      return <VueEnsemblePage />
    case 'diagnostic':
      return <SituationNationalePage />
    case 'territoires':
      return <TerritoiresPage />
    case 'priorites':
      return <PrioritesPage />
    case 'schools':
      return <EcolesPage />
    case 'teachers':
      return <EnseignantsPage />

    // Simuler
    case 'prince':
      return <PrincePage />
    case 'simulations':
      return <ScenariosPage />
    case 'voeux':
      return <VoeuxPage />
    case 'arbitrage':
      return <ArbitragePage />
    case 'recrutes':
      return <RecrutesPage />
    case 'comparison':
      return <ComparaisonPage />

    // Planifier
    case 'planification':
      return <PlanificationPage />
    case 'hypotheses':
      return <HypothesesPage />
    case 'quotas':
      return <QuotasPage />
    case 'vivier':
      return <VivierPage />
    case 'nominations':
      return <NominationsPage />
    case 'mouvements':
      return <MouvementsPage />
    case 'indicateurs':
      return <IndicateursPage />

    // Restituer
    case 'reports':
      return <RapportPage />
    case 'audit':
      return <JournalAuditPage />
    case 'methodology':
      return <MethodologiePage />

    // Configuration
    case 'settings':
      return <ReferentielPage />
    case 'engine':
      return <MoteurPage />

    // Vue analyste
    case 'data':
      return <QualiteDonneesPage />
    case 'pool':
      return <VivierScenarioPage />
    case 'posts':
      return <PostesPage />
    case 'assignments':
      return <AffectationsPage />
    case 'unassigned':
      return <NonAffectesPage />
    case 'logs':
      return <JournalSimulationPage />

    // ACCÈS DÉSACTIVÉ : la page de gestion des accès n'est plus proposée (voir app/page.tsx).
    case 'acces':
      return null

    default: {
      const inconnue: never = page
      return inconnue
    }
  }
}
