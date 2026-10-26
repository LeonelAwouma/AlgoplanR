/**
 * Génération du diagnostic textuel (§18).
 *
 * Aucune intelligence artificielle n'intervient ici. Chaque phrase est un
 * modèle fixe déclenché par une condition sur une valeur calculée, du type :
 *
 *   SI besoinResiduel > 0 ALORS « Après la simulation, {n} postes restent non pourvus. »
 *
 * Les textes décrivent les résultats ; ils ne les interprètent pas, ne
 * recommandent rien et n'emploient aucun registre alarmiste.
 */

import type { SchoolDiagnostic, TerritorialSummary, TerritorialTotals } from '../../contrat'
import type { DataQualityReport } from '../../contrat'
import type { SimulationResult } from '../../contrat'
import { trierParPriorite } from './diagnostic'
import { territoiresMixtes } from './territoires'

/** Mention affichée partout où des résultats de simulation sont présentés (§29). */
export const MENTION_SIMULATION =
  "Les résultats présentés sont issus d'une simulation d'aide à la décision. Ils ne constituent pas des décisions administratives de mutation, d'affectation ou de recrutement."

const nf = new Intl.NumberFormat('fr-FR')

export const n = (v: number): string => nf.format(Math.round(v))
export const pct = (v: number): string => `${Math.round(v * 100)} %`
const s = (v: number): string => (Math.abs(v) > 1 ? 's' : '')

/** Une phrase et son déclencheur, pour pouvoir afficher la règle qui l'a produite. */
export interface Enonce {
  texte: string
  /** Condition qui a déclenché la phrase, affichable en Vue analyste. */
  regle: string
}

/**
 * Synthèse courte du tableau de bord. Elle décrit la part d'établissements en
 * déficit et, quand une simulation existe, la part de besoins couverts.
 */
export function syntheseTableauDeBord(
  totals: TerritorialTotals,
  resultat: SimulationResult | null,
  perimetre: string,
): Enonce[] {
  const enonces: Enonce[] = []

  if (totals.ecolesAnalysees === 0) {
    return [{ texte: 'Aucun établissement ne correspond aux filtres sélectionnés.', regle: 'ecolesAnalysees = 0' }]
  }

  const partDeficit = totals.ecolesEnDeficit / totals.ecolesAnalysees
  enonces.push({
    texte: `Sur ${perimetre}, ${pct(partDeficit)} des ${n(totals.ecolesAnalysees)} établissements analysés présentent un déficit d'enseignants, soit ${n(totals.postesNecessaires)} poste${s(totals.postesNecessaires)} nécessaire${s(totals.postesNecessaires)}.`,
    regle: 'ecolesEnDeficit / ecolesAnalysees',
  })

  if (totals.excedentMobilisable > 0) {
    enonces.push({
      texte: `${n(totals.excedentMobilisable)} enseignant${s(totals.excedentMobilisable)} peu${totals.excedentMobilisable > 1 ? 'vent' : 't'} potentiellement être redéployé${s(totals.excedentMobilisable)} sans mettre leur établissement d'origine en déficit.`,
      regle: 'excedentMobilisable > 0',
    })
  } else if (totals.postesNecessaires > 0) {
    enonces.push({
      texte:
        "Aucun excédent mobilisable n'a été identifié sur ce périmètre : le besoin ne peut pas être couvert par redistribution interne.",
      regle: 'excedentMobilisable = 0 et postesNecessaires > 0',
    })
  }

  if (resultat) {
    if (resultat.besoinInitial > 0) {
      enonces.push({
        texte: `Dans le scénario sélectionné, ${pct(resultat.tauxCouverture)} des besoins pourraient être couverts par redéploiement, laissant ${n(resultat.besoinResiduel)} poste${s(resultat.besoinResiduel)} non pourvu${s(resultat.besoinResiduel)}.`,
        regle: 'postesCouverts / besoinInitial',
      })
    }
    if (resultat.besoinResiduel > 0) {
      enonces.push({
        texte: `Après la simulation, ${n(resultat.besoinResiduel)} poste${s(resultat.besoinResiduel)} reste${resultat.besoinResiduel > 1 ? 'nt' : ''} non pourvu${s(resultat.besoinResiduel)}.`,
        regle: 'besoinResiduel > 0',
      })
    } else if (resultat.besoinInitial > 0) {
      enonces.push({
        texte: "Dans ce scénario, l'ensemble des postes identifiés est couvert par redéploiement.",
        regle: 'besoinResiduel = 0',
      })
    }
  }

  if (totals.elevesParEnseignantEtat != null) {
    enonces.push({
      texte: `Le rapport observé est de ${totals.elevesParEnseignantEtat.toLocaleString('fr-FR')} élèves par enseignant payé par l'État.`,
      regle: 'effectifTotalEleves / enseignantsEtat',
    })
  }

  return enonces
}

/** Diagnostic national rédigé, tel qu'il apparaît en tête de la page Diagnostic. */
export function diagnosticTerritorial(
  totals: TerritorialTotals,
  nbEnseignantsLus: number,
  resultat: SimulationResult | null,
  perimetre: string,
  nominatif = true,
): Enonce[] {
  const enonces: Enonce[] = []

  enonces.push({
    // Sans fichier nominatif, le nombre d'enseignants est le stock déclaré des écoles, pas une liste d'agents lus.
    texte: nominatif
      ? `Les données analysées couvrent ${n(totals.ecolesAnalysees)} établissement${s(totals.ecolesAnalysees)} et ${n(nbEnseignantsLus)} enseignant${s(nbEnseignantsLus)} sur ${perimetre}.`
      : `Les données analysées couvrent ${n(totals.ecolesAnalysees)} établissement${s(totals.ecolesAnalysees)} sur ${perimetre}, avec un stock déclaré de ${n(nbEnseignantsLus)} enseignant${s(nbEnseignantsLus)} (aucun fichier nominatif des enseignants n’a été importé).`,
    regle: 'ecolesAnalysees, enseignants lus',
  })

  if (totals.ecolesEnDeficit > 0) {
    enonces.push({
      texte: `${n(totals.ecolesEnDeficit)} établissement${s(totals.ecolesEnDeficit)} présente${totals.ecolesEnDeficit > 1 ? 'nt' : ''} un déficit. Le besoin initial est estimé à ${n(totals.postesNecessaires)} poste${s(totals.postesNecessaires)}.`,
      regle: 'ecolesEnDeficit > 0',
    })
  } else {
    enonces.push({
      texte: 'Aucun établissement du périmètre ne présente de déficit au regard de la norme paramétrée.',
      regle: 'ecolesEnDeficit = 0',
    })
  }

  if (totals.ecolesAvecExcedent > 0) {
    enonces.push({
      texte: `${n(totals.ecolesAvecExcedent)} établissement${s(totals.ecolesAvecExcedent)} dispose${totals.ecolesAvecExcedent > 1 ? 'nt' : ''} d'un excédent ${nominatif ? 'mobilisable' : 'de stock déclaré'}, pour un total de ${n(totals.excedentMobilisable)} enseignant${s(totals.excedentMobilisable)}${nominatif ? '' : ' (estimation par école, sans liste nominative d’agents mobilisables)'}.`,
      regle: 'ecolesAvecExcedent > 0',
    })
  }

  if (resultat) {
    enonces.push({
      texte: `Dans le scénario « ${resultat.scenarioNom} », ${n(resultat.postesCouverts)} poste${s(resultat.postesCouverts)} peu${resultat.postesCouverts > 1 ? 'vent' : 't'} être couvert${s(resultat.postesCouverts)} par redistribution interne ; ${n(resultat.besoinResiduel)} poste${s(resultat.besoinResiduel)} reste${resultat.besoinResiduel > 1 ? 'nt' : ''} non pourvu${s(resultat.besoinResiduel)}.`,
      regle: 'postesCouverts, besoinResiduel',
    })
    if (resultat.scope === 'etendu') {
      enonces.push({
        texte:
          "Ce scénario ne pose aucune contrainte géographique : il décrit un plafond théorique de redistribution, pas un plan de mouvement applicable en l'état.",
        regle: "scope = 'etendu'",
      })
    }
  }

  return enonces
}

/** Point d'attention calculé, avec sa valeur et son territoire de rattachement. */
export interface PointAttention {
  code: string
  titre: string
  texte: string
  valeur: number | null
}

/**
 * Points d'attention (§18). Chaque point n'est produit que si la donnée qui le
 * fonde existe : les indicateurs pédagogiques disparaissent simplement quand
 * les effectifs élèves ne sont pas fournis.
 */
export function pointsAttention(
  diagnostics: SchoolDiagnostic[],
  arbre: TerritorialSummary,
  qualite: DataQualityReport | null,
): PointAttention[] {
  const points: PointAttention[] = []
  if (diagnostics.length === 0) return points

  const parPriorite = trierParPriorite(diagnostics.filter(d => d.besoinTheorique > 0))
  if (parPriorite.length > 0) {
    const top = parPriorite.slice(0, 3)
    points.push({
      code: 'deficits_absolus',
      titre: 'Établissements aux déficits les plus élevés',
      texte: top
        .map(d => `${d.school.nom || d.school.id} (${d.besoinTheorique} poste${s(d.besoinTheorique)})`)
        .join(' · '),
      valeur: top[0].besoinTheorique,
    })
  }

  const regionsParBesoin = [...arbre.children]
    .filter(r => r.totals.postesNecessaires > 0)
    .sort((a, b) => b.totals.postesNecessaires - a.totals.postesNecessaires)
  if (regionsParBesoin.length > 0) {
    const cumul = regionsParBesoin.slice(0, 3).reduce((a, r) => a + r.totals.postesNecessaires, 0)
    const total = arbre.totals.postesNecessaires
    points.push({
      code: 'concentration_territoriale',
      titre: 'Territoires concentrant les besoins',
      texte: `${regionsParBesoin
        .slice(0, 3)
        .map(r => r.territory.nom)
        .join(', ')} regroupent ${pct(total > 0 ? cumul / total : 0)} des postes nécessaires.`,
      valeur: cumul,
    })
  }

  const mixtes = territoiresMixtes(arbre.children)
  if (mixtes.length > 0) {
    points.push({
      code: 'territoires_mixtes',
      titre: 'Territoires où excédents et déficits coexistent',
      texte: `${mixtes
        .slice(0, 3)
        .map(t => t.territory.nom)
        .join(', ')} : une redistribution interne y est arithmétiquement possible.`,
      valeur: mixtes.length,
    })
  }

  const avecPression = diagnostics.filter(d => d.elevesParEnseignantEtat != null)
  if (avecPression.length > 0) {
    const tri = [...avecPression].sort((a, b) => (b.elevesParEnseignantEtat ?? 0) - (a.elevesParEnseignantEtat ?? 0))
    const tete = tri[0]
    points.push({
      code: 'pression_eleves',
      titre: 'Pression élèves / enseignant la plus forte',
      texte: `${tete.school.nom || tete.school.id} : ${(tete.elevesParEnseignantEtat ?? 0).toLocaleString('fr-FR')} élèves par enseignant payé par l'État.`,
      valeur: tete.elevesParEnseignantEtat,
    })
  }

  const multigradesEnDeficit = diagnostics.filter(d => d.school.classesMultigrades > 0 && d.besoinTheorique > 0)
  if (multigradesEnDeficit.length > 0) {
    points.push({
      code: 'multigrades_deficit',
      titre: 'Classes multigrades en déficit',
      texte: `${n(multigradesEnDeficit.length)} établissement${s(multigradesEnDeficit.length)} déclarant des classes multigrades présente${multigradesEnDeficit.length > 1 ? 'nt' : ''} également un déficit d'enseignants.`,
      valeur: multigradesEnDeficit.length,
    })
  }

  if (qualite) {
    const incomplets = qualite.territorialCompleteness
    if (incomplets.total > 0 && incomplets.tauxComplet < 1) {
      const manquants = incomplets.total - Math.round(incomplets.tauxComplet * incomplets.total)
      points.push({
        code: 'donnees_incompletes',
        titre: 'Données territoriales incomplètes',
        texte: `${n(manquants)} établissement${s(manquants)} n'ont pas les trois niveaux (région, département, commune) renseignés ; les scénarios géographiques ne peuvent pas les traiter pleinement.`,
        valeur: manquants,
      })
    }
    if (!qualite.donneesElevesDisponibles) {
      points.push({
        code: 'eleves_absents',
        titre: 'Données élèves indisponibles',
        texte: "Aucune colonne d'effectif élèves n'a été reconnue : les indicateurs pédagogiques ne sont pas calculés.",
        valeur: null,
      })
    }
  }

  return points
}

/** Phrase de comparaison avant / après, produite uniquement quand elle est valide (§13). */
export function reductionDuDeficit(resultat: SimulationResult): Enonce | null {
  const avant = resultat.before.deficitTotal
  const apres = resultat.after.deficitTotal
  if (avant <= 0 || apres > avant) return null
  const reduction = avant - apres
  return {
    texte: `Réduction du déficit : ${n(reduction)} poste${s(reduction)} — ${pct(reduction / avant)}.`,
    regle: 'before.deficitTotal > 0 et after.deficitTotal ≤ before.deficitTotal',
  }
}

/** Explication d'une proposition d'affectation, construite à partir du score réel (§15). */
export function expliquerProposition(
  resultat: SimulationResult,
  postId: string,
): { titre: string; lignes: string[] } | null {
  const a = resultat.assignments.find(x => x.postId === postId)
  if (!a) return null
  const lignes = a.breakdown.components
    .filter(c => c.contribution !== 0)
    .map(
      c => `${c.label} : ${c.valeur.toLocaleString('fr-FR')} × ${c.poids} = ${c.contribution.toLocaleString('fr-FR')}`,
    )
  lignes.push(`Score total de compatibilité : ${a.score.toLocaleString('fr-FR')}`)
  return { titre: `${a.nomEns} ${a.prenomEns} — ${a.nomEtabOrigine} → ${a.nomEtabDestination}`, lignes }
}
