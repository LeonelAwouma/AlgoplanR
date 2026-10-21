/**
 * Accès à l'API du contexte « Rapports » : rapport de décision assemblé par le
 * serveur, et synthèse territoriale (lot 4).
 *
 * Routes :
 *   GET jeux/{jeu}/rapport/
 *   GET jeux/{jeu}/rapports/territorial/
 *   GET jeux/{jeu}/rapports/territorial/export/ (fichier : Excel ou Word, jamais du JSON)
 *
 * Le rapport de décision reste assemblé côté serveur, mis en sections ici. La synthèse territoriale est servie
 * telle quelle (mêmes clés que le serveur, seule la casse change) : aucun recalcul, et les exports Excel/Word
 * sont produits par le serveur à partir des mêmes fonctions — jamais par le frontend.
 */

import {
  appeler,
  queryFiltres,
  route,
  telechargerDepuisServeur,
  type DecisionReport,
  type FiltresRapportTerritorial,
  type GlobalFilters,
  type IdJeu,
  type OptionsExportTerritorial,
  type FichierTelecharge,
  type RapportTerritorial,
} from '../../shared/api'

const ROUTES = {
  rapport: route<DecisionReport>()('GET', 'jeux/{jeu}/rapport/'),
  territorial: route<RapportTerritorial>()('GET', 'jeux/{jeu}/rapports/territorial/'),
}

/**
 * Rapport de décision du périmètre filtré (territoire et filtres du tableau de bord).
 *
 * @param scenario scénario présenté dans le rapport ; le scénario retenu par défaut.
 */
export function lireRapport(
  jeu: IdJeu,
  filtres: GlobalFilters,
  scenario: string | null,
  signal?: AbortSignal,
): Promise<DecisionReport> {
  return appeler(ROUTES.rapport, {
    params: { jeu },
    query: { ...queryFiltres(filtres), scenario: scenario ?? undefined },
    signal,
  })
}

function queryTerritorial(filtres: FiltresRapportTerritorial) {
  return {
    region: filtres.region,
    departement: filtres.departement,
    commune: filtres.commune,
    iaeb: filtres.iaeb,
    sousSysteme: filtres.sousSysteme,
    niveau: filtres.niveau,
    scenario: filtres.scenario,
  }
}

/**
 * Synthèse territoriale du périmètre : taux d'encadrement, couverture des besoins, couverture des écoles de
 * plus de 100 élèves, attrition (modèle M1) et degré d'aléa — pour le territoire demandé et chacun de ses
 * enfants immédiats (région → département → arrondissement → école).
 */
export function lireRapportTerritorial(
  jeu: IdJeu,
  filtres: FiltresRapportTerritorial = {},
  signal?: AbortSignal,
): Promise<RapportTerritorial> {
  return appeler(ROUTES.territorial, { params: { jeu }, query: queryTerritorial(filtres), signal })
}

/**
 * Export Excel ou Word de la synthèse territoriale, produit par le serveur à partir des mêmes fonctions que
 * `lireRapportTerritorial` : mêmes chiffres, pour les mêmes paramètres. `type: 'nationalComplet'` (réservé au
 * DRH) dure environ une minute sur un jeu national (davantage sur un poste lent) : le délai maximal d'attente est de
 * `DELAI_EXPORT_NATIONAL_MS`, après quoi l'erreur `delai_depasse` est signalée à l'utilisateur.
 */
/** Délai maximal d'attente d'un export d'un périmètre, et d'un export national complet. */
export const DELAI_EXPORT_PERIMETRE_MS = 5 * 60 * 1000
export const DELAI_EXPORT_NATIONAL_MS = 10 * 60 * 1000

export function exporterRapportTerritorial(
  jeu: IdJeu,
  filtres: FiltresRapportTerritorial,
  options: OptionsExportTerritorial,
): Promise<FichierTelecharge> {
  return telechargerDepuisServeur(
    `jeux/${jeu}/rapports/territorial/export/`,
    {
      ...queryTerritorial(filtres),
      format: options.format,
      type: options.type === 'nationalComplet' ? 'national_complet' : undefined,
      indicateur: options.indicateur,
      annee: options.annee,
    },
    `rapport-territorial.${options.format}`,
    {
      delaiMs: options.type === 'nationalComplet' ? DELAI_EXPORT_NATIONAL_MS : DELAI_EXPORT_PERIMETRE_MS,
      signal: options.signal,
    },
  )
}
