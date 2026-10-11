/**
 * Accès à l'API du contexte « Diagnostic » (Moteur A).
 *
 * Routes :
 *   GET jeux/{jeu}/diagnostic/          GET jeux/{jeu}/territoires/
 *   GET jeux/{jeu}/territoires/options/ GET jeux/{jeu}/priorites/
 *   GET jeux/{jeu}/synthese/
 *
 * Le serveur applique les faits du Prince avant tout calcul : les chiffres
 * reçus décrivent la situation « effective ». L'option `sansPrince` permet de
 * mesurer ce que changent les décisions de la DRH.
 */

import {
  appeler,
  queryFiltres,
  querySelection,
  route,
  type DiagnosticPerimetre,
  type GlobalFilters,
  type IdJeu,
  type OptionsFiltres,
  type Priorites,
  type SyntheseDiagnostic,
  type TerritorySelection,
  type VueTerritoriale,
} from '../../shared/api'

const ROUTES = {
  diagnostic: route<DiagnosticPerimetre>()('GET', 'jeux/{jeu}/diagnostic/'),
  territoires: route<VueTerritoriale>()('GET', 'jeux/{jeu}/territoires/'),
  options: route<OptionsFiltres>()('GET', 'jeux/{jeu}/territoires/options/'),
  priorites: route<Priorites>()('GET', 'jeux/{jeu}/priorites/'),
  synthese: route<SyntheseDiagnostic>()('GET', 'jeux/{jeu}/synthese/'),
}

/**
 * Diagnostic du périmètre filtré : totaux et écoles.
 *
 * @param sansPrince `true` pour le diagnostic des données importées, sans les décisions de la DRH.
 */
export function lireDiagnostic(
  jeu: IdJeu,
  filtres: GlobalFilters,
  sansPrince = false,
  signal?: AbortSignal,
): Promise<DiagnosticPerimetre> {
  return appeler(ROUTES.diagnostic, {
    params: { jeu },
    query: { ...queryFiltres(filtres), sansPrince: sansPrince || undefined },
    signal,
  })
}

/**
 * Nœud territorial sélectionné, ses enfants et le fil d'Ariane.
 *
 * @param scenario scénario dont les mouvements sont comptés pour chaque territoire enfant.
 */
export function lireVueTerritoriale(
  jeu: IdJeu,
  filtres: GlobalFilters,
  scenario: string | null,
  signal?: AbortSignal,
): Promise<VueTerritoriale> {
  return appeler(ROUTES.territoires, {
    params: { jeu },
    query: { ...queryFiltres(filtres), scenario: scenario ?? undefined },
    signal,
  })
}

/** Options des menus de filtres, selon le niveau territorial déjà choisi. */
export function lireOptionsFiltres(
  jeu: IdJeu,
  selection: TerritorySelection,
  signal?: AbortSignal,
): Promise<OptionsFiltres> {
  return appeler(ROUTES.options, { params: { jeu }, query: querySelection(selection), signal })
}

/**
 * Établissements en déficit, classés par priorité : indice de priorité u, puis
 * rapport élèves par maître.
 *
 * @param limite nombre d'écoles renvoyées ; toutes si absent.
 */
export function lirePriorites(
  jeu: IdJeu,
  filtres: GlobalFilters,
  limite?: number,
  signal?: AbortSignal,
): Promise<Priorites> {
  return appeler(ROUTES.priorites, { params: { jeu }, query: { ...queryFiltres(filtres), limite }, signal })
}

/**
 * Synthèse narrative et agrégats du périmètre.
 *
 * @param scenario scénario dont le résultat complète les phrases et les agrégats
 *   (besoins couverts, postes restants) ; sans scénario, seul le diagnostic est décrit.
 */
export function lireSynthese(
  jeu: IdJeu,
  filtres: GlobalFilters,
  scenario: string | null,
  signal?: AbortSignal,
): Promise<SyntheseDiagnostic> {
  return appeler(ROUTES.synthese, {
    params: { jeu },
    query: { ...queryFiltres(filtres), scenario: scenario ?? undefined },
    signal,
  })
}
