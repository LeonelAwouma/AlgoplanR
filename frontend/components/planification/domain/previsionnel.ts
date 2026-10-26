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
  StatutRetraites,
} from '../../shared/api'

/** Nature d'une valeur, en mots. */
export const LIBELLE_NATURE: Record<NatureValeur, string> = {
  observe: 'Observé',
  projete: 'Projeté',
  estime: 'Estimé',
  hypothese: 'Hypothèse',
  provisoire: 'Provisoire',
  conditionnel: 'Conditionnel',
  decision: 'Décision enregistrée',
  realise: 'Réalisé',
  non_disponible: 'Non disponible',
  sans_objet: 'Sans objet',
}

/** Nature d'une case (0 = base) : celle du serveur, à défaut celle de la ligne. */
export function natureCase(l: LignePrevisionnel, colonne: number): NatureValeur {
  return (
    l.natures?.[colonne] ??
    (l.valeurs[colonne] == null ? (l.raisons?.[colonne] ? 'non_disponible' : 'sans_objet') : l.nature)
  )
}

/** Natures d'une ligne en mots, regroupées : « Observé (base) ; Projeté (N+2 à N+5) »… */
export function libelleNatures(p: PrevisionnelComplet, l: LignePrevisionnel): string {
  const groupes: { nature: NatureValeur; colonnes: string[] }[] = []
  l.valeurs.forEach((_, i) => {
    const n = natureCase(l, i)
    const colonne = (p.annees[i] ?? '').replace(/ \(.*\)$/, '')
    const dernier = groupes.at(-1)
    if (dernier?.nature === n) dernier.colonnes.push(colonne)
    else groupes.push({ nature: n, colonnes: [colonne] })
  })
  if (groupes.length === 1) return LIBELLE_NATURE[groupes[0].nature]
  return groupes
    .map(g => {
      const c = g.colonnes.length > 1 ? `${g.colonnes[0]} à ${g.colonnes.at(-1)}` : g.colonnes[0]
      return `${LIBELLE_NATURE[g.nature]} (${c})`
    })
    .join(' ; ')
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
  /** `null` quand les retraites sont non calculables : un total partiel ne serait pas un nombre de départs. */
  departs: number | null
  retraites: number | null
  /** Fiabilité des retraites, fixée par le serveur (`complet` si le serveur ne la fournit pas). */
  statutRetraites: StatutRetraites
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
  const statutRetraites = p.retraitesFiabilite?.statut ?? 'complet'
  const inconnues = statutRetraites === 'non_calculable'
  const retraites = inconnues ? null : somme('departs_retraite')
  return {
    derniere: p.annees[n] ?? '',
    elevesBase: valeur(p, 'eleves', 0),
    elevesFin: valeur(p, 'eleves', n),
    disponiblesFin: valeur(p, 'disponibles_fin', n),
    departs: retraites === null ? null : retraites + somme('departs_attrition'),
    retraites,
    statutRetraites,
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
  // Une case inconnue faute de retraites calculables est écrite « Non calculable » (jamais un zéro ni une case muette).
  const raison = p.retraitesFiabilite?.statut === 'non_calculable' ? p.retraitesFiabilite.raison : null
  return p.groupes.flatMap(g =>
    g.lignes.map(l => [
      `${g.code}. ${g.titre}`,
      l.libelle,
      ...l.valeurs.map((v, i) => (v === null && raison && l.raisons?.[i] === raison ? NON_CALCULABLE : v)),
      libelleNatures(p, l),
    ]),
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
    .map(x => {
      const v = (valeur: number | null) =>
        valeur === null && x.fiabilite === 'non_calculable' ? NON_CALCULABLE : valeur
      return [
        x.libelle,
        v(x.recrutementsTotal),
        v(x.effectifFin[x.effectifFin.length - 1] ?? null),
        v(x.disponiblesFin[x.disponiblesFin.length - 1] ?? null),
        v(x.remFinal),
        v(x.ecartFinal),
        v(x.besoinRestantFinal),
        x.fiabiliteRaison ?? x.fiabiliteLibelle,
      ]
    })
}

export const ENTETES_SCENARIOS = [
  'Scénario',
  'Recrutements sur l’horizon',
  'Stock en fin d’horizon',
  'Disponibles en fin d’horizon',
  'REM obtenu',
  'Écart au REM de référence',
  'Besoin restant (C − U)',
  'Fiabilité (retraites)',
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

/** Date et heure en français (« 25/10/2026 22:40 »), vide si absente. */
const dateFr = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''

/**
 * Provenance du tableau, en lignes « Rubrique / Valeur » : jeu, année, périmètre réel, écoles, personnels, données
 * incomplètes et date de calcul. Un titre « Cameroun » ne fait jamais croire à une couverture qu'il n'a pas.
 */
export function lignesContexte(p: PrevisionnelComplet): [string, string | number][] {
  const c = p.contexte
  if (!c) return []
  const couverture =
    c.ecolesPerimetre === c.ecolesJeu
      ? `toutes les écoles du jeu (${c.ecolesJeu.toLocaleString('fr-FR')})`
      : `${c.ecolesPerimetre.toLocaleString('fr-FR')} écoles sur les ${c.ecolesJeu.toLocaleString('fr-FR')} du jeu`
  return [
    ['Jeu de données', c.jeuNom],
    ['Origine du jeu', LIBELLE_SOURCE[c.jeuSource] ?? c.jeuSource],
    ...(c.donneesFictives ? ([['Données fictives', p.texteDonneesFictives ?? 'Oui']] as [string, string][]) : []),
    ['Année scolaire saisie à la création', c.anneeSaisie ?? c.anneeScolaire],
    ['Sens de l’année saisie', LIBELLE_SENS[c.sensAnneeScolaire ?? 'donnees']],
    ['Origine du sens', LIBELLE_ORIGINE_SENS[c.sensAnneeOrigine ?? 'creation']],
    ['Année scolaire des données (base)', c.anneeDonnees ?? c.anneeScolaire],
    ['Périmètre', `${c.perimetre} : ${couverture}`],
    ['Écoles du périmètre', c.ecolesPerimetre],
    ['Personnels rattachés administrativement (Enseignants_Actuels)', c.personnelsStockDeclare],
    ['Personnels du fichier nominatif (matricules distincts)', c.personnelsNominatifs],
    ['Écoles aux données incomplètes', c.ecolesDonneesIncompletes],
    ['dont effectif d’élèves inconnu', c.ecolesElevesInconnus],
    ['dont minimum pédagogique provisoire', c.ecolesMinimumProvisoire],
    ['dont salles simple / double flux non renseignées', c.ecolesSallesFluxInconnu],
    ['Projection calculée le', dateFr(c.calculeLe)],
    ['Tableau édité le', dateFr(c.editeLe)],
  ]
}

const LIBELLE_SENS: Record<string, string> = {
  donnees: 'année des données observées (base = année saisie)',
  rentree_preparee: 'rentrée préparée (base = année précédente)',
  non_confirme: 'non confirmé : calendrier historique conservé (base = année précédente), à confirmer',
}

const LIBELLE_ORIGINE_SENS: Record<string, string> = {
  creation: 'déclaré à la création du jeu',
  migration: 'établi par la migration d’après l’historique du jeu',
  confirmation: 'confirmé ou corrigé par un utilisateur autorisé (journalisé)',
}

const LIBELLE_SOURCE: Record<string, string> = {
  import: 'Fichiers importés',
  demonstration: 'Données de démonstration (fictives)',
  consolidation: 'Consolidation de jeux régionaux',
}

/** Une phrase de provenance pour les en-têtes (écran, Word). */
export function phraseContexte(p: PrevisionnelComplet): string {
  const c = p.contexte
  if (!c) return ''
  const source = c.jeuSource === 'demonstration' ? ' (données de démonstration fictives)' : ''
  return (
    `Jeu « ${c.jeuNom} »${source}, année scolaire saisie ${c.anneeSaisie ?? c.anneeScolaire}` +
    (c.anneeDonnees && c.anneeDonnees !== (c.anneeSaisie ?? c.anneeScolaire)
      ? `, base de calcul ${c.anneeDonnees}${c.sensAnneeScolaire === 'non_confirme' ? ' (sens à confirmer)' : ''}. `
      : '. ') +
    `Périmètre réel : ${c.ecolesPerimetre.toLocaleString('fr-FR')} écoles` +
    (c.ecolesPerimetre === c.ecolesJeu ? '' : ` sur ${c.ecolesJeu.toLocaleString('fr-FR')}`) +
    `, ${c.personnelsStockDeclare.toLocaleString('fr-FR')} personnels rattachés administrativement` +
    ` (${c.personnelsNominatifs.toLocaleString('fr-FR')} dans le fichier nominatif), ` +
    `${c.ecolesDonneesIncompletes.toLocaleString('fr-FR')} école(s) aux données incomplètes.` +
    (c.calculeLe ? ` Calculé le ${dateFr(c.calculeLe)}.` : '')
  )
}

/** Texte d'une valeur de retraite inconnue : jamais un zéro. */
export const NON_CALCULABLE = 'Non calculable'

export const ENTETES_AUDIT_RETRAITES = [
  'Année',
  'Retraites identifiées (liste nominative)',
  'Déjà à l’âge légal au début de N+1',
  'Atteignant l’âge légal dans l’année',
  'Part du stock déclaré (%)',
  'Part du fichier nominatif (%)',
]

/** Lignes de l'audit des retraites, avec le libellé d'année du tableau (« N+1 (2025-2026) »). */
export function lignesAuditRetraites(p: PrevisionnelComplet): (string | number | null)[][] {
  const a = p.auditRetraites
  if (!a) return []
  // Retraites non calculables : jamais des zéros dans l'audit.
  if (p.retraitesFiabilite?.statut === 'non_calculable') {
    return a.lignes.map((x, i) => [p.annees[i + 1] ?? x.annee, ...Array<string>(5).fill(NON_CALCULABLE)])
  }
  return a.lignes.map((x, i) => [
    p.annees[i + 1] ?? x.annee,
    x.departs,
    x.dejaEligibles,
    x.atteignantAgeLegal,
    x.tauxStockDeclare,
    x.tauxPersonnelsNominatifs,
  ])
}

/** Comptes de contrôle de l'audit des retraites (âges inexploitables, doublons, méthode). */
export function controlesAuditRetraites(p: PrevisionnelComplet): [string, string | number][] {
  const a = p.auditRetraites
  if (!a) return []
  return [
    ['Personnels du fichier nominatif (matricules distincts)', a.personnelsNominatifs],
    ['Stock déclaré (Enseignants_Actuels)', a.stockDeclare],
    [
      'Agents sans âge exploitable (non comptés)',
      p.retraitesFiabilite?.statut === 'non_calculable' ? NON_CALCULABLE : a.sansAge,
    ],
    ['Matricules en double écartés', p.retraitesFiabilite?.statut === 'non_calculable' ? NON_CALCULABLE : a.doublons],
    [
      'Agents ayant déjà l’âge légal au début de N+1',
      p.retraitesFiabilite?.statut === 'non_calculable' ? NON_CALCULABLE : a.dejaEligiblesDebut,
    ],
    ['Année de mesure des âges', a.anneeAges ?? 'non précisée (même date que les effectifs)'],
    ['Méthode', a.methode],
  ]
}

export const ENTETES_RAPPROCHEMENT = [
  'École',
  'Région',
  'Stock déclaré',
  'Stock après le plan',
  'Agents nominatifs',
  'Écart (déclaré − nominatif)',
  'Retraites N+1',
  'Retraites sur l’horizon',
  'Retirées du stock',
  'Non imputables',
  'Agents sans âge',
  'Matricules en double',
  'Anomalies',
]

export const LIBELLE_ANOMALIE: Record<string, string> = {
  declare_superieur_nominatif: 'stock déclaré supérieur à la liste nominative',
  nominatif_superieur_declare: 'liste nominative supérieure au stock déclaré',
  retraites_superieures_au_stock: 'retraites supérieures au stock déclaré',
  matricules_en_double: 'matricules en double',
  agents_sans_age: 'agents sans âge',
}

/** Synthèse du rapprochement des effectifs : écoles concordantes, écarts positifs et négatifs, retraites. */
export function syntheseRapprochement(p: PrevisionnelComplet): [string, number | string][] {
  const r = p.rapprochement
  if (!r) return []
  const s = r.synthese
  const inconnues = p.retraitesFiabilite?.statut === 'non_calculable'
  // Sans fichier nominatif (valeurs `null` du serveur) : « Non calculable », jamais un zéro ni un écart artificiel.
  const v = (x: number | null): number | string => (x === null ? NON_CALCULABLE : x)
  const retraite = (x: number | null): number | string => (inconnues ? NON_CALCULABLE : v(x))
  return [
    ['Écoles rapprochées', s.ecoles],
    ['Stock déclaré (Enseignants_Actuels)', s.stockDeclare],
    ['Agents nominatifs rattachés (matricules distincts)', s.agentsNominatifs],
    ['Écoles concordantes', v(s.ecolesConcordantes)],
    ['Écoles où le stock déclaré dépasse la liste nominative', v(s.ecolesEcartPositif)],
    ['Écart positif total', v(s.ecartPositif)],
    ['Écoles où la liste nominative dépasse le stock déclaré', v(s.ecolesEcartNegatif)],
    ['Écart négatif total', v(s.ecartNegatif)],
    ['Agents rattachés à aucune école projetée', s.agentsHorsEcoles ?? 'non calculé (périmètre filtré)'],
    ['Matricules en double', v(s.doublons)],
    ['Agents sans âge exploitable', v(s.agentsSansAge)],
    ['Retraites identifiées en N+1', retraite(s.retraitesN1)],
    ['Retraites identifiées sur l’horizon', retraite(s.retraitesHorizon)],
    ['dont retirées du stock déclaré', retraite(s.retraitesRetireesDuStock)],
    ['dont non imputables (au-delà du stock de l’école)', retraite(s.retraitesNonImputables)],
    ['Écoles aux retraites supérieures au stock', retraite(s.ecolesRetraitesSuperieuresAuStock)],
  ]
}

/** Lignes du rapprochement école par école (anomalies d'abord), pour l'écran et les exports. */
export function lignesRapprochement(p: PrevisionnelComplet): (string | number)[][] {
  return (p.rapprochement?.ecoles ?? []).map(e => [
    e.nomEcole,
    e.region,
    e.stockDeclare,
    e.stockApresPlan,
    e.agentsNominatifs,
    e.ecart,
    ...(p.retraitesFiabilite?.statut === 'non_calculable'
      ? Array<string>(4).fill(NON_CALCULABLE)
      : [e.retraitesN1, e.retraitesHorizon, e.retraitesRetireesDuStock, e.retraitesNonImputables]),
    e.agentsSansAge,
    e.doublons,
    e.anomalies.map(a => LIBELLE_ANOMALIE[a] ?? a).join(' ; '),
  ])
}

/** Avertissements de cohérence, le bandeau des données fictives d'abord (il figure déjà en tête). */
export function avertissementsCoherence(p: PrevisionnelComplet) {
  return (p.avertissements ?? []).filter(a => a.code !== 'donnees_fictives')
}
