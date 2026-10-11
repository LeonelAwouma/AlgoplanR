/**
 * Conversion des filtres de l'interface en paramètres de requête.
 *
 * Conventions partagées avec le backend :
 *   - une liste se transmet en répétant la clé au singulier (`?zone=rurale&zone=urbaine`) ;
 *   - un filtre vide ou indifférent n'est pas transmis du tout.
 */

import type { ParametresRequete } from './client'
import type { FiltresPerimetre, GlobalFilters, TerritorySelection } from './contrat/commun'
import type { FiltresPlanification } from './contrat/planification'

/** Paramètres d'une sélection territoriale. */
export function querySelection(selection: TerritorySelection): ParametresRequete {
  return {
    region: selection.region,
    departement: selection.departement,
    commune: selection.commune,
  }
}

/** Paramètres des filtres globaux du tableau de bord. */
export function queryFiltres(filtres: GlobalFilters): ParametresRequete {
  return {
    ...querySelection(filtres.territoire),
    zone: filtres.zones,
    zoneSecurite: filtres.zonesSecurite,
    typeEtab: filtres.typesEtab,
    severite: filtres.severites,
    multigrades: filtres.multigradesUniquement ?? undefined,
  }
}

/** Paramètres d'un périmètre de planification (niveau, territoire, sous-système). */
export function queryPerimetre(perimetre: FiltresPerimetre = {}): ParametresRequete {
  return {
    niveau: perimetre.niveau,
    region: perimetre.region,
    departement: perimetre.departement,
    commune: perimetre.commune,
    iaeb: perimetre.iaeb,
    sousSysteme: perimetre.sousSysteme,
  }
}

/** Paramètres propres aux routes de planification. */
export function queryPlanification(filtres: FiltresPlanification = {}): ParametresRequete {
  return { scenario: filtres.scenario, annee: filtres.annee, version: filtres.version }
}
