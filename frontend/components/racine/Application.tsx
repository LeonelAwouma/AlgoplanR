'use client'

/**
 * Coquille de l'application : bandeau supérieur, barre latérale, titre de la
 * page, filtres globaux et page affichée.
 *
 * Elle ne porte aucune donnée métier. Elle lit la session d'interface
 * (`useSession`) et quelques requêtes du jeu ouvert : sa description, ses
 * scénarios calculés et les options des filtres. Chaque page lit ensuite ses
 * propres données.
 */

import { useEffect } from 'react'

import type { SessionAcces } from '@components/acces'
import { useOptionsFiltres } from '@components/diagnostic'
import { useJeu, useSupprimerJeu } from '@components/donnees'
import { SANS_SCENARIO, useScenarioAffiche } from '@components/simulation'
import { ApiError, FILTRES_VIDES } from '@shared/api'
import { LIBELLE_SCOPE, selectionLabel } from '@shared/kernel'
import { useSession } from '@shared/session'
import { Notice } from '@shared/ui/commun'
import { EtapesRubrique, FilterBar, PageHeader, Sidebar, TerritoryBreadcrumb, Topbar } from '@shared/ui/coquille'
import { BandeauMiseAJour, useMiseAJour } from '@shared/ui/coquille/MiseAJour'
import { pageReserveeAuDrh, type PageKey } from '@shared/ui/coquille/navigation'
import { ErreurAction, ErreurApi } from '@shared/ui/etats'

import { EtatTraitement } from './EtatTraitement'
import { RenduPage } from './RenduPage'

/**
 * Pages sur lesquelles la barre de filtres territoriaux n'a pas de sens : elles
 * portent sur tout le jeu (import, validation, règles, registres) ou ont leurs
 * propres filtres.
 */
const SANS_FILTRES: ReadonlySet<PageKey> = new Set<PageKey>([
  'import',
  'validation',
  'methodology',
  'settings',
  'engine',
  'data',
  'logs',
  'prince',
  'acces',
  'voeux',
  'arbitrage',
  'recrutes',
  'hypotheses',
  'vivier',
  'nominations',
  'mouvements',
  'audit',
])

/** Message de confirmation avant la suppression du jeu ouvert. */
const CONFIRMATION_SUPPRESSION =
  'Supprimer le jeu de données ouvert ?\n\nLes fichiers importés, les scénarios calculés et les décisions enregistrées pour ce jeu seront supprimés du serveur AlgoPlanR. Cette action est immédiate et irréversible.'

export interface ProprietesApplication {
  /** Personne connectée ; avec l'accès désactivé, toujours le DRH. */
  utilisateur: SessionAcces
}

/** Application complète, une fois la personne identifiée. */
export function Application({ utilisateur }: ProprietesApplication) {
  const {
    jeu,
    page,
    setPage,
    mode,
    changerMode,
    menuOuvert,
    setMenuOuvert,
    filtres,
    setFiltres,
    setScenarioChoisi,
    fermerJeu,
  } = useSession()

  const meta = useJeu(jeu)
  const affiche = useScenarioAffiche()
  const options = useOptionsFiltres(jeu, filtres.territoire)
  const suppression = useSupprimerJeu()
  const miseAJour = useMiseAJour()

  // Un jeu rouvert au démarrage peut avoir été supprimé depuis : on revient alors à l'import.
  const jeuDisparu = meta.error instanceof ApiError && meta.error.statut === 404
  useEffect(() => {
    if (jeuDisparu) fermerJeu()
  }, [jeuDisparu, fermerJeu])

  const donneesChargees = !!meta.data
  const simulationPrete = affiche.calcules.length > 0
  const estDrh = utilisateur.role === 'drh'
  const regionImposee = utilisateur.role === 'delegue' ? utilisateur.region : null
  /** Une page réservée au DRH n'est jamais rendue pour un délégué, quel que soit le lien suivi. */
  const pageInterdite = !estDrh && pageReserveeAuDrh(page)

  const scenario = affiche.detail?.scenario
  const libelleScenario = scenario
    ? `${scenario.nom} (${LIBELLE_SCOPE[scenario.scope].toLowerCase()})`
    : 'Situation actuelle'

  function supprimerJeuOuvert() {
    if (!jeu || !window.confirm(CONFIRMATION_SUPPRESSION)) return
    suppression.mutate(jeu, { onSuccess: fermerJeu })
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenu">
        Aller au contenu principal
      </a>

      {menuOuvert && <div className="backdrop" onClick={() => setMenuOuvert(false)} aria-hidden="true" />}

      <Topbar
        mode={mode}
        onModeChange={changerMode}
        onOuvrirMenu={() => setMenuOuvert(true)}
        etat={
          <EtatTraitement
            donneesChargees={donneesChargees}
            simulationPrete={simulationPrete}
            erreur={jeuDisparu ? null : meta.error}
          />
        }
        territoire={
          regionImposee && !filtres.territoire.region ? `Région ${regionImposee}` : selectionLabel(filtres.territoire)
        }
        // ACCÈS DÉSACTIVÉ :
        // utilisateur={utilisateur.role === 'drh' ? 'DRH' : `Délégué · ${utilisateur.region}`}
        // onDeconnexion={deconnecter}
        anneeScolaire={meta.data?.anneeScolaire ?? '—'}
        scenario={libelleScenario}
        onEffacer={supprimerJeuOuvert}
        peutEffacer={!!jeu && !suppression.isPending}
      />

      <div className="app-body">
        <div className="sidebar-slot" />
        <Sidebar
          page={page}
          onNavigate={setPage}
          mode={mode}
          role={utilisateur.role}
          // ACCÈS DÉSACTIVÉ : plus d'entrées de délégués à valider.
          entreesEnAttente={0}
          ouverte={menuOuvert}
          onFermer={() => setMenuOuvert(false)}
          donneesChargees={donneesChargees}
          simulationPrete={simulationPrete}
          version={miseAJour?.versionActuelle}
        />

        <div className="main-col">
          <main className="content" id="contenu">
            <PageHeader page={page} onAccueil={() => setPage(donneesChargees ? 'overview' : 'import')} />
            <EtapesRubrique
              page={page}
              onNavigate={setPage}
              mode={mode}
              role={utilisateur.role}
              donneesChargees={donneesChargees}
              simulationPrete={simulationPrete}
            />

            <div className="stack">
              <BandeauMiseAJour etat={miseAJour} donneesChargees={donneesChargees} />

              {meta.error && !jeuDisparu && <ErreurApi erreur={meta.error} onReessayer={() => meta.refetch()} />}
              <ErreurAction erreur={suppression.error} />

              {regionImposee && page === 'import' && (
                <Notice tone="info" title={`Accès limité à la région ${regionImposee}.`}>
                  Seuls les établissements et les enseignants de cette région sont retenus à l’import ; le reste du
                  fichier est ignoré.
                </Notice>
              )}

              {meta.data?.demonstration && page !== 'import' && (
                <Notice tone="warn" title="Données de démonstration.">
                  Les valeurs affichées sont fictives et ne constituent pas des statistiques officielles.
                </Notice>
              )}

              {donneesChargees && !SANS_FILTRES.has(page) && options.data && (
                <>
                  <TerritoryBreadcrumb
                    selection={filtres.territoire}
                    onSelect={t => setFiltres({ ...filtres, territoire: t })}
                  />
                  <FilterBar
                    filtres={filtres}
                    options={options.data}
                    onChange={setFiltres}
                    onReset={() => setFiltres(FILTRES_VIDES)}
                    scenarioActif={affiche.scenario ?? SANS_SCENARIO}
                    scenarios={affiche.calcules.map(s => ({ id: s.scenario.id, nom: s.scenario.nom }))}
                    onScenarioChange={setScenarioChoisi}
                  />
                </>
              )}

              {pageInterdite ? (
                <Notice tone="alert" title="Page réservée au DRH.">
                  Cette fonction n’est pas ouverte aux délégués régionaux.
                </Notice>
              ) : (
                <RenduPage page={page} />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
