/**
 * Routes du contexte « Diagnostic ». Les réponses sont assemblées comme dans
 * le serveur de référence (moteur-reference/scripts/serveur/diagnostic.ts), à
 * partir des diagnostics d'écoles convertis et du résultat du scénario demandé.
 */

import type {
  BesoinTerritoireEnfant,
  DiagnosticPerimetre,
  MouvementsTerritoire,
  OptionsFiltres,
  Priorites,
  RepartitionZoneSecurite,
  SchoolDiagnostic,
  SchoolSeverity,
  SimulationResult,
  SyntheseDiagnostic,
  TerritorialSummary,
  VueTerritoriale,
  ZoneSecurite,
} from '../../contrat'
import type { Acces } from '../acces'
import { versSyntheseTerritoriale } from '../conversions/simulation'
import type { SyntheseSousSystemeDjango } from '../conversions/simulation'
import { valeur } from '../liste'
import { agregerTotaux, trierParPriorite } from '../moteur/diagnostic'
import { calculerFlux, restreindreResultat } from '../moteur/filtre'
import { diagnosticTerritorial, pointsAttention, reductionDuDeficit, syntheseTableauDeBord } from '../moteur/narration'
import { breadcrumb, selectionLabel, selectionLevel, territoiresMixtes, trouverNoeud } from '../moteur/territoires'
import * as source from '../sources'
import type { Conversion } from '../types'

const SEVERITES: SchoolSeverity[] = [
  'excedent',
  'satisfaisant',
  'deficit_faible',
  'deficit_important',
  'deficit_critique',
]
const ZONES_SECURITE: ZoneSecurite[] = ['verte', 'jaune', 'rouge']

/** Nœud de l'arbre correspondant à la sélection de la requête (le national à défaut). */
export async function noeudDe(acces: Acces, jeu: string, query: Parameters<Conversion>[0]['query']) {
  const racine = await source.arbre(acces, jeu)
  const selection = source.selectionDepuis(query)
  return { selection, noeud: trouverNoeud(racine, selection) ?? racine, racine }
}

/** Résultat du scénario demandé par `?scenario=`, `null` sans scénario. */
async function resultatDemande(
  acces: Acces,
  jeu: string,
  scenario: string | undefined,
): Promise<SimulationResult | null> {
  return scenario ? source.resultat(acces, jeu, scenario) : null
}

/** Résultat d'un scénario vu depuis un périmètre : complet au national, restreint ailleurs. */
export function resultatDuPerimetre(resultat: SimulationResult, noeud: TerritorialSummary): SimulationResult {
  return noeud.territory.level === 'national' ? resultat : restreindreResultat(resultat, new Set(noeud.schoolIds))
}

function mouvementsEnfants(noeud: TerritorialSummary, resultat: SimulationResult | null): MouvementsTerritoire[] {
  if (!resultat) return []
  return noeud.children.map(enfant => {
    const flux = calculerFlux(resultat, new Set(enfant.schoolIds))
    return {
      territoire: enfant.territory.nom,
      besoin: flux.besoinInitial,
      couverts: flux.postesCouverts,
      residuel: flux.besoinResiduel,
      recus: flux.enseignantsRecus,
      sortants: flux.enseignantsSortants,
      solde: flux.solde,
    }
  })
}

function parZoneSecurite(
  diagnostics: SchoolDiagnostic[],
  resultat: SimulationResult | null,
): RepartitionZoneSecurite[] {
  return ZONES_SECURITE.map(zone => {
    const ecoles = diagnostics.filter(d => (d.school.zoneSecurite ?? 'verte') === zone)
    const ids = new Set(ecoles.map(d => d.school.id))
    return {
      zone,
      ecoles: ecoles.length,
      nonRenseignees: zone === 'verte' ? ecoles.filter(d => d.school.zoneSecurite === null).length : 0,
      enDeficit: ecoles.filter(d => d.besoinTheorique > 0).length,
      postesManquants: ecoles.reduce((s, d) => s + d.besoinTheorique, 0),
      restantsApresScenario: resultat ? resultat.uncoveredPosts.filter(p => ids.has(p.schoolId)).length : null,
    }
  })
}

function besoinsParEnfant(noeud: TerritorialSummary, resultat: SimulationResult | null): BesoinTerritoireEnfant[] {
  return noeud.children
    .filter(e => e.totals.postesNecessaires > 0)
    .map(e => {
      const couverts = resultat ? calculerFlux(resultat, new Set(e.schoolIds)).postesCouverts : 0
      const postesNecessaires = e.totals.postesNecessaires
      return {
        territoire: e.territory,
        postesNecessaires,
        couverts,
        restant: Math.max(0, postesNecessaires - couverts),
        taux: postesNecessaires > 0 ? Math.round((couverts / postesNecessaires) * 100) : 0,
      }
    })
    .sort((a, b) => b.postesNecessaires - a.postesNecessaires)
    .slice(0, 12)
}

export const conversionsDiagnostic: Record<string, Conversion> = {
  'GET jeux/{jeu}/diagnostic/': async (r, acces, p): Promise<DiagnosticPerimetre> => {
    const [tous, filtres] = await Promise.all([
      source.diagnostics(acces, p.jeu),
      source.diagnosticsFiltres(acces, p.jeu, r.query),
    ])
    return {
      totals: agregerTotaux(filtres),
      ecoles: trierParPriorite(filtres),
      ecolesDuJeu: tous.length,
      donneesElevesDisponibles: tous.some(d => d.school.effectifTotalEleves != null),
      ecolesEnRepli: filtres.filter(d => d.calcul.methode === 'repli_classes').length,
      ecolesSansSalles: filtres.filter(d => d.calcul.bmax === null).length,
    }
  },

  'GET jeux/{jeu}/territoires/': async (r, acces, p): Promise<VueTerritoriale> => {
    const { selection, noeud } = await noeudDe(acces, p.jeu, r.query)
    const resultat = await resultatDemande(acces, p.jeu, valeur(r.query.scenario))
    return {
      niveau: selectionLevel(selection),
      perimetre: selectionLabel(selection),
      noeud,
      enfants: noeud.children,
      filAriane: breadcrumb(selection),
      mouvementsEnfants: mouvementsEnfants(noeud, resultat),
    }
  },

  'GET jeux/{jeu}/territoires/options/': async (r, acces, p): Promise<OptionsFiltres> => {
    const [{ selection, racine }, tous] = await Promise.all([
      noeudDe(acces, p.jeu, r.query),
      source.diagnostics(acces, p.jeu),
    ])
    const region = selection.region ? racine.children.find(c => c.territory.nom === selection.region) : null
    const departement =
      region && selection.departement ? region.children.find(c => c.territory.nom === selection.departement) : null
    return {
      regions: racine.children.map(c => c.territory.nom),
      departements: region ? region.children.map(c => c.territory.nom) : [],
      communes: departement ? departement.children.map(c => c.territory.nom) : [],
      typesEtab: [...new Set(tous.map(d => d.school.typeEtab).filter(Boolean))].sort(),
      zones: [...new Set(tous.map(d => d.school.zone))].sort(),
    }
  },

  'GET jeux/{jeu}/priorites/': async (r, acces, p): Promise<Priorites> => {
    const enDeficit = trierParPriorite(await source.diagnosticsFiltres(acces, p.jeu, r.query)).filter(
      d => d.besoinTheorique > 0,
    )
    const limite = Number(valeur(r.query.limite) ?? 0)
    return { ecoles: limite > 0 ? enDeficit.slice(0, limite) : enDeficit, total: enDeficit.length }
  },

  'GET jeux/{jeu}/synthese/': async (r, acces, p): Promise<SyntheseDiagnostic> => {
    const [{ selection, noeud }, diagnostics, complet] = await Promise.all([
      noeudDe(acces, p.jeu, r.query),
      source.diagnosticsFiltres(acces, p.jeu, r.query),
      resultatDemande(acces, p.jeu, valeur(r.query.scenario)),
    ])
    // Synthèse par sous-système (besoin, excédent, recrutement à prévoir) : même périmètre territorial que le
    // nœud ci-dessus, lue du serveur (`synthese_par_sous_systeme`), jamais recalculée ici.
    const brut = await acces.lire<{ synthese_territoriale: SyntheseSousSystemeDjango }>(`jeux/${p.jeu}/synthese/`, {
      region: selection.region || undefined,
      departement: selection.departement || undefined,
      commune: selection.commune || undefined,
      scenario: valeur(r.query.scenario),
    })
    const resultat = complet ? resultatDuPerimetre(complet, noeud) : null
    const perimetre = selectionLabel(selection)
    return {
      perimetre,
      totals: noeud.totals,
      syntheseTableauDeBord: syntheseTableauDeBord(noeud.totals, resultat, perimetre),
      diagnosticTerritorial: diagnosticTerritorial(noeud.totals, noeud.totals.enseignantsEtat, resultat, perimetre),
      pointsAttention: pointsAttention(diagnostics, noeud, null),
      territoiresMixtes: territoiresMixtes(noeud.children),
      syntheseTerritoriale: versSyntheseTerritoriale(brut.synthese_territoriale),
      parSeverite: Object.fromEntries(
        SEVERITES.map(s => [s, diagnostics.filter(d => d.severite === s).length]),
      ) as Record<SchoolSeverity, number>,
      parZoneSecurite: parZoneSecurite(diagnostics, resultat),
      besoinsParEnfant: besoinsParEnfant(noeud, complet),
      reductionDeficit: resultat ? reductionDuDeficit(resultat) : null,
    }
  },
}
