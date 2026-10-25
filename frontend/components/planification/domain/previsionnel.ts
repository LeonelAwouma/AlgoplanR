/**
 * Tableau prévisionnel complet (base, N+1 à N+5) : mise en forme, sans recalcul, du résultat du serveur.
 *
 * Le tableau, les graphiques et les exports Excel et Word lisent tous les mêmes lignes du même objet
 * `PrevisionnelComplet` : aucun chiffre n'est recalculé ici, seule la présentation change.
 */

import type {
  LignePrevisionnel,
  NatureValeur,
  PrevisionnelComplet,
  ResumeScenario,
  ScenarioRecrutement,
} from '../../shared/api'

/** Nature d'une valeur, en mots. */
export const LIBELLE_NATURE: Record<NatureValeur, string> = {
  observe: 'Observé',
  estime: 'Estimé',
  hypothese: 'Hypothèse',
  provisoire: 'Provisoire',
}

/** Ordre de présentation des scénarios (rapport MINEDUB). */
export const ORDRE_SCENARIOS: readonly ScenarioRecrutement[] = ['min', 'maintien', 'besoin', 'plafond']

/** Une ligne du tableau par sa clé, `undefined` si le serveur ne la fournit pas. */
export function ligne(p: PrevisionnelComplet, cle: string): LignePrevisionnel | undefined {
  for (const g of p.groupes) {
    const l = g.lignes.find(x => x.cle === cle)
    if (l) return l
  }
  return undefined
}

/** Valeur d'une ligne à une colonne (0 = base), `null` si absente. */
export function valeur(p: PrevisionnelComplet, cle: string, colonne: number): number | null {
  return ligne(p, cle)?.valeurs[colonne] ?? null
}

/** Scénario par son code. */
export function scenario(p: PrevisionnelComplet, s: ScenarioRecrutement): ResumeScenario | undefined {
  return p.scenarios.find(x => x.scenario === s)
}

/** Point d'un graphique : une catégorie (colonne) et ses valeurs par série. */
export interface PointGraphique {
  cle: string
  label: string
  valeurs: Record<string, number>
}

/** Points d'un graphique à partir de lignes du tableau ; une valeur absente n'est pas tracée (jamais 0 inventé). */
export function points(p: PrevisionnelComplet, series: Record<string, string>, depuis = 0): PointGraphique[] {
  return p.annees.slice(depuis).map((annee, i) => {
    const colonne = i + depuis
    const valeurs: Record<string, number> = {}
    for (const [serie, cle] of Object.entries(series)) {
      const v = valeur(p, cle, colonne)
      if (v != null) valeurs[serie] = v
    }
    return { cle: annee, label: annee.replace(/ \(.*\)$/, ''), valeurs }
  })
}

/** Évolution des élèves (base puis années). */
export const pointsEleves = (p: PrevisionnelComplet) => points(p, { eleves: 'eleves', rem: 'besoin_rem' })

/** Évolution des enseignants : stock administratif et disponibles en fin d'année (sous plafond). */
export const pointsEnseignants = (p: PrevisionnelComplet) =>
  points(p, { stock: 'effectif_fin', disponibles: 'disponibles_fin', necessaires: 'besoin_rem' }, 1)

/** Recrutements annuels de chaque scénario. */
export const pointsRecrutements = (p: PrevisionnelComplet) =>
  points(p, Object.fromEntries(ORDRE_SCENARIOS.map(s => [s, `recrutement_${s}`])), 1)

/** REM projeté par scénario, avec la référence. */
export const pointsRem = (p: PrevisionnelComplet) =>
  points(p, { reference: 'rem_reference', ...Object.fromEntries(ORDRE_SCENARIOS.map(s => [s, `rem_${s}`])) })

/** Chiffres clés de la vue Décideur, lus dans le tableau (dernière année de l'horizon). */
export interface SyntheseDecideur {
  derniere: string
  elevesBase: number | null
  elevesFin: number | null
  disponiblesFin: number | null
  departs: number
  retraites: number
  recrutementsBesoin: number | null
  recrutementsPlafond: number | null
  remBase: number | null
  remReference: number
  besoinBase: number | null
  besoinFin: number | null
}

export function syntheseDecideur(p: PrevisionnelComplet): SyntheseDecideur {
  const n = p.annees.length - 1
  const somme = (cle: string) => (ligne(p, cle)?.valeurs.slice(1) ?? []).reduce<number>((a, v) => a + (v ?? 0), 0)
  const retraites = somme('departs_retraite')
  return {
    derniere: p.annees[n] ?? '',
    elevesBase: valeur(p, 'eleves', 0),
    elevesFin: valeur(p, 'eleves', n),
    disponiblesFin: valeur(p, 'disponibles_fin', n),
    departs: retraites + somme('departs_attrition'),
    retraites,
    recrutementsBesoin: scenario(p, 'besoin')?.recrutementsTotal ?? null,
    recrutementsPlafond: scenario(p, 'plafond')?.recrutementsTotal ?? null,
    remBase: valeur(p, 'rem_reel', 0),
    remReference: p.remReference,
    besoinBase: valeur(p, 'besoin_non_couvert', 0),
    besoinFin: valeur(p, 'besoin_non_couvert', n),
  }
}

/** Lignes à plat du tableau complet, dans l'ordre affiché : la base des exports Excel et Word. */
export function lignesExport(p: PrevisionnelComplet): (string | number | null)[][] {
  return p.groupes.flatMap(g =>
    g.lignes.map(l => [`${g.code}. ${g.titre}`, l.libelle, ...l.valeurs, LIBELLE_NATURE[l.nature]]),
  )
}

/** En-têtes des exports du tableau complet. */
export function entetesExport(p: PrevisionnelComplet): string[] {
  return ['Groupe', 'Indicateur', ...p.annees, 'Nature']
}

/** Lignes de la comparaison des scénarios (exports et vue Décideur). */
export function lignesScenarios(p: PrevisionnelComplet): (string | number | null)[][] {
  return ORDRE_SCENARIOS.map(s => scenario(p, s))
    .filter((x): x is ResumeScenario => x !== undefined)
    .map(x => [
      x.libelle,
      x.recrutementsTotal,
      x.effectifFin[x.effectifFin.length - 1] ?? null,
      x.disponiblesFin[x.disponiblesFin.length - 1] ?? null,
      x.remFinal,
      x.ecartFinal,
      x.besoinRestantFinal,
    ])
}

export const ENTETES_SCENARIOS = [
  'Scénario',
  'Recrutements sur l’horizon',
  'Stock en fin d’horizon',
  'Disponibles en fin d’horizon',
  'REM obtenu',
  'Écart au REM de référence',
  'Besoin restant (C − U)',
]

/** Une raison d'indisponibilité et les cellules qu'elle explique (« REM réel : N+2, N+3 »). */
export interface RaisonIndisponible {
  raison: string
  cellules: string[]
}

/** Valeurs absentes du tableau, regroupées par raison (fournie par le serveur) : jamais une case vide muette. */
export function raisonsIndisponibles(p: PrevisionnelComplet): RaisonIndisponible[] {
  const par = new Map<string, string[]>()
  for (const g of p.groupes) {
    for (const l of g.lignes) {
      const colonnes = (l.raisons ?? [])
        .map((r, i) => (r ? { r, annee: (p.annees[i] ?? '').replace(/ \(.*\)$/, '') } : null))
        .filter((x): x is { r: string; annee: string } => x !== null)
      for (const r of new Set(colonnes.map(c => c.r))) {
        const annees = colonnes.filter(c => c.r === r).map(c => c.annee)
        par.set(r, [...(par.get(r) ?? []), `${l.libelle} : ${annees.join(', ')}`])
      }
    }
  }
  return [...par].map(([raison, cellules]) => ({ raison, cellules }))
}

/** Numéro de renvoi (1, 2…) de la raison d'une cellule, `null` si la valeur existe ou n'a pas de raison. */
export function renvoi(raisons: readonly RaisonIndisponible[], l: LignePrevisionnel, colonne: number): number | null {
  const r = l.raisons?.[colonne]
  if (!r) return null
  const i = raisons.findIndex(x => x.raison === r)
  return i < 0 ? null : i + 1
}

/** Écoles selon la fiabilité de leur besoin : un minimum provisoire n'est pas toujours un besoin final incertain. */
export function lignesFiabilite(p: PrevisionnelComplet): [string, number][] {
  const f = p.fiabilite
  if (!f) return []
  return [
    ['Écoles au minimum pédagogique provisoire (Classes_Multigrades non renseigné)', f.minimumProvisoire],
    ['dont minimum sans effet : besoin final fixé par les élèves ou les salles', f.minimumProvisoireSansEffet],
    ['Écoles au besoin final provisoire', f.besoinProvisoire],
    ['Écoles au besoin final estimé (regroupement multigrade supposé)', f.besoinEstime],
    ['Écoles au besoin final confirmé', f.besoinConfirme],
  ]
}
