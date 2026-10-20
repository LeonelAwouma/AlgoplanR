/**
 * Lectures partagées par les conversions, mémorisées par jeu : paramètres,
 * diagnostics de toutes les écoles, arbre territorial, enseignants, et
 * données d'un scénario calculé.
 */

import type { ParametresRequete } from '../client'
import type {
  EngineSettings,
  GlobalFilters,
  SchoolDiagnostic,
  SchoolSeverity,
  SimulationResult,
  TerritorialSummary,
  TerritorySelection,
  Zone,
  ZoneSecurite,
} from '../contrat'
import type { Acces } from './acces'
import { versDiagnostic, type EcoleDjango } from './conversions/ecoles'
import type { EnseignantDjango } from './conversions/enseignants'
import { versEngineSettings, type ConfigDjango } from './conversions/parametres'
import {
  versResultat,
  type AffectationDjango,
  type CandidatureDjango,
  type ControleDjango,
  type JournalDjango,
  type PosteDjango,
  type ScenarioDjango,
  type SyntheseDjango,
} from './conversions/simulation'
import { booleen, valeur, valeurs } from './liste'
import { appliquerFiltres, construireArbreTerritorial } from './moteur/territoires'

/** Paramètres de calcul du jeu. */
export function parametres(acces: Acces, jeu: string): Promise<EngineSettings> {
  return acces.memo(jeu, 'parametres', async a => {
    const r = await a.lire<{ parametres: ConfigDjango; annee_scolaire?: string }>(`jeux/${jeu}/parametres/`)
    return versEngineSettings(r.parametres, r.annee_scolaire)
  })
}

/**
 * Diagnostics de toutes les écoles du jeu, dans l'ordre du fichier. Seuls les
 * diagnostics convertis sont gardés en mémoire, pas les lignes brutes du
 * serveur : à 30 000 écoles, garder les deux doublerait la mémoire occupée.
 */
export function diagnostics(acces: Acces, jeu: string): Promise<SchoolDiagnostic[]> {
  return acces.memo(jeu, 'diagnostics', async a => {
    const [{ lignes: ecoles }, settings] = await Promise.all([
      a.toutes<EcoleDjango>(`jeux/${jeu}/etablissements/`),
      parametres(a, jeu),
    ])
    return ecoles.map((e, i) => versDiagnostic(e, i + 1, settings))
  })
}

/** Diagnostics par identifiant d'école. */
export function diagnosticsParId(acces: Acces, jeu: string): Promise<Map<string, SchoolDiagnostic>> {
  return acces.memo(
    jeu,
    'diagnostics-par-id',
    async a => new Map((await diagnostics(a, jeu)).map(d => [d.school.id, d])),
  )
}

/** Arbre territorial complet du jeu. */
export function arbre(acces: Acces, jeu: string): Promise<TerritorialSummary> {
  return acces.memo(jeu, 'arbre', async a => construireArbreTerritorial(await diagnostics(a, jeu)))
}

/** Tous les enseignants du jeu, avec leur barème et leur appartenance au vivier. */
export function enseignantsDjango(acces: Acces, jeu: string): Promise<EnseignantDjango[]> {
  return acces.memo(
    jeu,
    'enseignants',
    async a => (await a.toutes<EnseignantDjango>(`jeux/${jeu}/enseignants/`)).lignes,
  )
}

/** Sélection territoriale d'une requête. */
export function selectionDepuis(query: ParametresRequete): TerritorySelection {
  return {
    region: valeur(query.region) ?? null,
    departement: valeur(query.departement) ?? null,
    commune: valeur(query.commune) ?? null,
  }
}

/** Filtres globaux d'une requête (voir `queryFiltres`). */
export function filtresDepuis(query: ParametresRequete): GlobalFilters {
  const multigrades = booleen(query.multigrades)
  return {
    territoire: selectionDepuis(query),
    zones: valeurs(query.zone) as Zone[],
    zonesSecurite: valeurs(query.zoneSecurite) as ZoneSecurite[],
    typesEtab: valeurs(query.typeEtab),
    severites: valeurs(query.severite) as SchoolSeverity[],
    multigradesUniquement: multigrades ?? null,
  }
}

/** Diagnostics du périmètre filtré par la requête. */
export async function diagnosticsFiltres(
  acces: Acces,
  jeu: string,
  query: ParametresRequete,
): Promise<SchoolDiagnostic[]> {
  return appliquerFiltres(await diagnostics(acces, jeu), filtresDepuis(query))
}

/** Identifiants des écoles d'une sélection territoriale. */
export async function ecolesDeLaSelection(
  acces: Acces,
  jeu: string,
  selection: TerritorySelection,
): Promise<Set<string>> {
  const filtres: GlobalFilters = {
    territoire: selection,
    zones: [],
    zonesSecurite: [],
    typesEtab: [],
    severites: [],
    multigradesUniquement: null,
  }
  return new Set(appliquerFiltres(await diagnostics(acces, jeu), filtres).map(d => d.school.id))
}

// --- Scénarios --------------------------------------------------------------------------------

/** Scénarios du jeu, tels que les sert le serveur. */
export function scenariosDjango(acces: Acces, jeu: string): Promise<ScenarioDjango[]> {
  return acces.memo(jeu, 'scenarios', a => a.lire<ScenarioDjango[]>(`jeux/${jeu}/scenarios/`))
}

/** Toutes les lignes d'une liste d'un scénario. */
function listeScenario<T>(acces: Acces, jeu: string, scenario: string, liste: string): Promise<T[]> {
  return acces.memo(
    jeu,
    `scenario:${scenario}:${liste}`,
    async a => (await a.toutes<T>(`jeux/${jeu}/scenarios/${scenario}/${liste}/`)).lignes,
  )
}

export function affectations(acces: Acces, jeu: string, scenario: string): Promise<AffectationDjango[]> {
  return listeScenario<AffectationDjango>(acces, jeu, scenario, 'affectations')
}

export function vivier(acces: Acces, jeu: string, scenario: string): Promise<EnseignantDjango[]> {
  return listeScenario<EnseignantDjango>(acces, jeu, scenario, 'vivier')
}

/** Données et résultat national complet d'un scénario. */
export function resultat(acces: Acces, jeu: string, scenario: string): Promise<SimulationResult> {
  return acces.memo(jeu, `scenario:${scenario}:resultat`, async a => {
    const [detail, brut, settings, ecoles, aff, viv, postes, candidatures, controles, journal] = await Promise.all([
      a.lire<ScenarioDjango>(`jeux/${jeu}/scenarios/${scenario}/`),
      a.lire<{ synthese: SyntheseDjango }>(`jeux/${jeu}/scenarios/${scenario}/resultat/`),
      parametres(a, jeu),
      diagnosticsParId(a, jeu),
      affectations(a, jeu, scenario),
      vivier(a, jeu, scenario),
      listeScenario<PosteDjango>(a, jeu, scenario, 'postes'),
      listeScenario<CandidatureDjango>(a, jeu, scenario, 'candidatures'),
      a.lire<{ controles: ControleDjango[] }>(`jeux/${jeu}/scenarios/${scenario}/invariants/`),
      listeScenario<JournalDjango>(a, jeu, scenario, 'journal'),
    ])
    return versResultat({
      scenario: detail,
      settings: detail.configuration ? versEngineSettings(detail.configuration) : settings,
      synthese: brut.synthese,
      affectations: aff,
      vivier: viv,
      postesNonPourvus: postes,
      candidatures,
      invariants: controles.controles,
      journal,
      ecoles,
    })
  })
}

/**
 * Scénario désigné par défaut quand l'interface n'en précise pas : celui que le
 * serveur retient lui-même (le premier scénario géographique le plus étendu).
 */
export async function scenarioParDefaut(acces: Acces, jeu: string): Promise<ScenarioDjango | null> {
  const liste = await scenariosDjango(acces, jeu)
  return liste.find(s => s.code === 'geo_region' && s.calcule_le) ?? liste.find(s => s.calcule_le) ?? null
}
