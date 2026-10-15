/**
 * Simulation : scénarios et listes du résultat d'un calcul du serveur Django
 * (affectations, vivier, postes non pourvus, vœux, contrôles, journal,
 * projections) → types du contrat, jusqu'au `SimulationResult` complet.
 *
 * Le serveur conserve le résultat national ; les vues restreintes à un
 * territoire sont relues ici avec les fonctions du moteur de référence.
 */

import type {
  Candidature,
  CombinaisonArbitrage,
  EngineSettings,
  GeographicScope,
  InvariantCheck,
  JournalSimulation,
  NatureMouvement,
  PoolTeacher,
  PresetScenario,
  ProjectionEcole,
  ProjectionsScenario,
  ProjectionTerritoire,
  ProposedAssignment,
  ProximityLevel,
  RedeploymentPool,
  ScenarioCalcule,
  SchoolDiagnostic,
  SimulationResult,
  SimulationScenario,
  SituationSnapshot,
  StatutVoeu,
  TeachingPost,
  VoeuExamine,
} from '../../contrat'
import { syntheseTerritoriale } from '../moteur/synthese'
import { versTeacher, type EnseignantDjango } from './enseignants'
import { versEngineSettings, type ConfigDjango } from './parametres'
import { estOui, nombre, normaliser, sousSysteme, texte, zone, zoneSecurite } from './referentiel'

// --- Formats du serveur ---------------------------------------------------------------------

export interface ScenarioDjango {
  id: number
  code: string
  nom: string
  description: string
  geographique: boolean
  obsolete: boolean
  parametres: Partial<Record<keyof ConfigDjango, Record<string, unknown>>>
  cree_le: string
  calcule_le: string | null
  /** Détail d'un scénario seulement : configuration complète du calcul. */
  configuration?: ConfigDjango
}

export interface SyntheseDjango {
  besoin_total: number
  disponibles: number
  affectes: number
  effet_de_prince: number
  non_affectes: number
  postes_non_pourvus: number
  a_recruter: number
  rt_par_sous_systeme: Record<string, number>
  postes_rouge_non_pourvus: number
  stats_phase: Record<string, number>
  scope_title: string
}

export interface AffectationDjango {
  phase: string
  id_poste: string
  id_etab: string
  nom_etab: string
  commune_poste: string
  departement_poste: string
  region_poste: string
  zone_poste: string
  sous_systeme: string
  id_ens: string
  nom_ens: string
  prenom_ens: string
  commune_origine: string
  departement_origine: string
  region_origine: string
  sous_systeme_ens: string
  bareme: number
  score_affectation: number
  motif_derogation: string
  arbitrage: string
}

export interface PosteDjango {
  id_poste: string
  Identifiant_Ecole: string
  nom_etab: string
  Commune: string
  Departement: string
  Region: string
  Circonscription_IAEB: string
  Accessibilite_Zone: string
  Securite_Zone: string
  Classes_Multigrades: string
  Sous_Systeme: string
  type_etab: string
  Up: number
  Wp: number
  est_zone_rouge: boolean
  pourvu: boolean
}

export interface CandidatureDjango {
  id_ens: string
  rang_voeu: number
  id_etab: string
  statut: 'SATISFAIT' | 'ECOLE_INCONNUE' | 'AUCUN_POSTE' | 'INCOMPATIBLE' | 'NON_RETENU' | string
  motif: string
  bareme: number
}

export interface ControleDjango {
  code: string
  libelle: string
  ok: boolean
  details: string
}

export interface JournalDjango {
  timestamp: string
  phase: string
  id_ens: string
  id_etab: string
  id_poste: string
  statut: string
  motif: string
}

export interface CombinaisonDjango {
  id_ens: string
  bareme: number
  options: {
    id_poste: string
    id_etab: string
    commune: string
    departement: string
    zone_rouge: boolean
    score: number
  }[]
  nb_postes_compatibles: number
}

export type ProjectionDjango = Record<string, string | number>

// --- Libellés ---------------------------------------------------------------------------------

/** Libellé lisible d'une phase du moteur. */
export function libellePhase(phase: string): string {
  const voeu = /^phase1_voeu_(\d)$/.exec(phase)
  if (voeu) return `Vœu n°${voeu[1]}`
  const libelles: Record<string, string> = {
    phase2_proximite_iaeb: 'Proximité IAEB',
    phase2_proximite_departement: 'Proximité départementale',
    phase3_extension_regionale: 'Extension régionale',
    effet_de_prince: 'Fait du Prince',
    arbitrage_commission: 'Décision de commission',
  }
  return libelles[phase] ?? phase
}

function nature(phase: string): NatureMouvement {
  if (phase.startsWith('phase1_voeu_')) return 'voeu'
  if (phase === 'arbitrage_commission' || phase === 'effet_de_prince') return 'arbitrage'
  return 'obligatoire'
}

// --- Scénarios -------------------------------------------------------------------------------

/** Périmètre d'un scénario : modèle géographique, ou phases actives d'un scénario personnalisé. */
export function portee(s: Pick<ScenarioDjango, 'code' | 'parametres'>): GeographicScope {
  if (s.code === 'geo_iaeb') return 'commune'
  if (s.code === 'geo_departement') return 'departement'
  if (s.code === 'geo_region') return 'etendu'
  const regles = (s.parametres?.regles_dreb ?? {}) as Record<string, boolean>
  if (regles.phase3_extension_regionale === false)
    return regles.phase2_proximite_departement === false ? 'commune' : 'departement'
  return 'etendu'
}

/** Phases à activer pour un périmètre. */
export function reglesDePortee(scope: GeographicScope): Record<string, boolean> {
  return {
    phase2_proximite_iaeb: true,
    phase2_proximite_departement: scope !== 'commune',
    phase3_extension_regionale: scope === 'etendu',
  }
}

export function versPreset(p: {
  code: string
  nom: string
  description: string
  parametres: ScenarioDjango['parametres']
}): PresetScenario {
  return { cle: p.code, nom: p.nom, description: p.description, scope: portee(p), disponible: true, motif: '' }
}

export function versScenario(s: ScenarioDjango, defaut: EngineSettings): SimulationScenario {
  return {
    id: String(s.id),
    nom: s.nom,
    description: s.description,
    scope: portee(s),
    settings: s.configuration ? versEngineSettings(s.configuration) : defaut,
    createdAt: s.cree_le,
    predefini: s.geographique,
  }
}

/** Scénario et indicateurs, à partir de son résultat quand il est calculé. */
export function versScenarioCalcule(
  s: ScenarioDjango,
  defaut: EngineSettings,
  resultat: SimulationResult | null,
): ScenarioCalcule {
  return {
    scenario: versScenario(s, defaut),
    calcule: s.calcule_le != null,
    obsolete: s.obsolete,
    calculeLe: s.calcule_le,
    indicateurs: resultat
      ? {
          besoinInitial: resultat.besoinInitial,
          postesCouverts: resultat.postesCouverts,
          besoinResiduel: resultat.besoinResiduel,
          tauxCouverture: resultat.tauxCouverture,
          enseignantsDeplaces: resultat.enseignantsDeplaces,
          mouvementsParPerimetre: resultat.mouvementsParPerimetre,
          controlesEnEcart: resultat.invariants.filter(i => !i.ok).length,
        }
      : null,
  }
}

// --- Résultat ---------------------------------------------------------------------------------

/** Données d'un calcul lues sur le serveur. */
export interface DonneesResultat {
  scenario: ScenarioDjango
  settings: EngineSettings
  synthese: SyntheseDjango
  affectations: AffectationDjango[]
  /** Vivier complet, avec l'indicateur `affecte`. */
  vivier: EnseignantDjango[]
  postesNonPourvus: PosteDjango[]
  candidatures: CandidatureDjango[]
  invariants: ControleDjango[]
  journal: JournalDjango[]
  /** Diagnostics de toutes les écoles du jeu, par identifiant. */
  ecoles: Map<string, SchoolDiagnostic>
}

const NIVEAUX: ProximityLevel[] = ['meme_commune', 'meme_iaeb', 'meme_departement', 'meme_region', 'hors_region']

function proximite(
  origine: { commune: string; iaeb: string; departement: string; region: string },
  destination: { commune: string; iaeb: string; departement: string; region: string },
): ProximityLevel {
  const egal = (a: string, b: string) => a !== '' && normaliser(a) === normaliser(b)
  if (egal(origine.commune, destination.commune)) return 'meme_commune'
  if (egal(origine.iaeb, destination.iaeb)) return 'meme_iaeb'
  if (egal(origine.departement, destination.departement)) return 'meme_departement'
  if (egal(origine.region, destination.region)) return 'meme_region'
  return 'hors_region'
}

/** Proposition du contrat ; `enseignant` : la fiche du vivier, pour l'école d'origine. */
export function versProposition(
  a: AffectationDjango,
  enseignant: EnseignantDjango | undefined,
  ecoles: Map<string, SchoolDiagnostic>,
): ProposedAssignment {
  const origineId = enseignant?.Ecole_Attache_Actuelle ?? ''
  const origine = ecoles.get(origineId)?.school
  const destination = ecoles.get(a.id_etab)?.school
  const voeu = /^phase1_voeu_(\d)$/.exec(a.phase)
  const n = nature(a.phase)
  return {
    phase: libellePhase(a.phase),
    nature: n,
    rangVoeu: voeu ? Number(voeu[1]) : null,
    statut: n === 'arbitrage' ? 'arbitre' : 'propose',
    annee: 'N+1',
    postId: a.id_poste,
    teacherId: a.id_ens,
    nomEns: texte(a.nom_ens),
    prenomEns: texte(a.prenom_ens),
    sousSysteme: sousSysteme(a.sous_systeme_ens || a.sous_systeme),
    schoolOrigineId: origineId,
    nomEtabOrigine: origine?.nom ?? origineId,
    communeOrigine: texte(a.commune_origine),
    departementOrigine: texte(a.departement_origine),
    regionOrigine: texte(a.region_origine),
    schoolDestinationId: a.id_etab,
    nomEtabDestination: texte(a.nom_etab) || a.id_etab,
    communeDestination: texte(a.commune_poste),
    departementDestination: texte(a.departement_poste),
    regionDestination: texte(a.region_poste),
    niveauProximite: proximite(
      {
        commune: a.commune_origine,
        iaeb: enseignant?.iaeb_attache ?? '',
        departement: a.departement_origine,
        region: a.region_origine,
      },
      {
        commune: a.commune_poste,
        iaeb: destination?.iaeb ?? '',
        departement: a.departement_poste,
        region: a.region_poste,
      },
    ),
    bareme: nombre(a.bareme),
    score: nombre(a.score_affectation),
    breakdown: { total: nombre(a.score_affectation), components: [] },
  }
}

/** Enseignants du vivier, rangés par barème décroissant au sein de chaque école. */
export function versPool(vivier: EnseignantDjango[], ecoles: Map<string, SchoolDiagnostic>): PoolTeacher[] {
  const rangs = new Map<string, number>()
  const tries = [...vivier].sort((a, b) => nombre(b.bareme) - nombre(a.bareme))
  return tries.map((t, i) => {
    const ecole = t.Ecole_Attache_Actuelle
    const rang = (rangs.get(ecole) ?? 0) + 1
    rangs.set(ecole, rang)
    const d = ecoles.get(ecole)
    return {
      teacher: versTeacher(t, i + 1),
      bareme: nombre(t.bareme),
      ecoleOrigine: { id: ecole, nom: d?.school.nom ?? ecole, excedentMobilisable: d?.excedentTheorique ?? 0 },
      rangDansEcole: rang,
      protege: false,
      affecte: Boolean(t.affecte),
    }
  })
}

export function versVivier(pool: PoolTeacher[], ecoles: Map<string, SchoolDiagnostic>): RedeploymentPool {
  const sources = new Map<string, RedeploymentPool['ecolesSources'][number]>()
  for (const p of pool) {
    const d = ecoles.get(p.ecoleOrigine.id)
    const s = sources.get(p.ecoleOrigine.id) ?? {
      schoolId: p.ecoleOrigine.id,
      nomEtab: p.ecoleOrigine.nom,
      region: d?.school.region ?? p.teacher.regionAttache,
      departement: d?.school.departement ?? p.teacher.departementAttache,
      commune: d?.school.commune ?? p.teacher.communeAttache,
      excedentMobilisable: p.ecoleOrigine.excedentMobilisable,
      candidatsRetenus: 0,
    }
    s.candidatsRetenus++
    sources.set(s.schoolId, s)
  }
  let excedentTotal = 0
  for (const d of ecoles.values()) excedentTotal += d.excedentTheorique
  return {
    teachers: pool,
    ecolesSources: [...sources.values()].sort((a, b) => b.candidatsRetenus - a.candidatsRetenus),
    exclusions: [],
    excedentTotal,
  }
}

/** Poste du contrat ; `rang` : ordre de service (1 = premier servi). */
export function versPoste(p: PosteDjango, rang: number, ecoles: Map<string, SchoolDiagnostic>): TeachingPost {
  const d = ecoles.get(p.Identifiant_Ecole)
  const zs = zoneSecurite(p.Securite_Zone)
  return {
    id: p.id_poste,
    schoolId: p.Identifiant_Ecole,
    nomEtab: texte(p.nom_etab) || p.Identifiant_Ecole,
    region: texte(p.Region),
    departement: texte(p.Departement),
    commune: texte(p.Commune),
    zone: zone(p.Accessibilite_Zone),
    typeEtab: texte(p.type_etab),
    iaeb: texte(p.Circonscription_IAEB),
    sousSysteme: sousSysteme(p.Sous_Systeme),
    estStructure: d?.school.estStructure ?? false,
    ecoleBilingue: false,
    classesMultigrades: estOui(p.Classes_Multigrades) ? 1 : 0,
    prioriteLocale: 0,
    deficitEcole: d?.besoinTheorique ?? 0,
    elevesParEnseignantEtat: d?.elevesParEnseignantEtat ?? null,
    priorite: {
      pointsAccessibilite: d?.priorite.pointsAccessibilite ?? 0,
      pointsSecurite: d?.priorite.pointsSecurite ?? 0,
      poids: nombre(p.Wp),
      niveauDifficulte: d?.priorite.niveauDifficulte ?? 3,
      pointsBesoin: d?.priorite.pointsBesoin ?? 0,
      indice: nombre(p.Up),
      zoneSecurite: zs,
      zoneRouge: Boolean(p.est_zone_rouge),
    },
    rang,
    pourvu: Boolean(p.pourvu),
  }
}

/** Poste pourvu par une affectation, reconstitué à partir de son école. */
function postePourvu(a: AffectationDjango, ecoles: Map<string, SchoolDiagnostic>): PosteDjango {
  const s = ecoles.get(a.id_etab)?.school
  const d = ecoles.get(a.id_etab)
  return {
    id_poste: a.id_poste,
    Identifiant_Ecole: a.id_etab,
    nom_etab: a.nom_etab,
    Commune: a.commune_poste,
    Departement: a.departement_poste,
    Region: a.region_poste,
    Circonscription_IAEB: s?.iaeb ?? '',
    Accessibilite_Zone: s?.zoneBrute ?? a.zone_poste,
    Securite_Zone: s?.zoneSecurite ? `Zone ${s.zoneSecurite}` : '',
    Classes_Multigrades: s && s.classesMultigrades > 0 ? 'Oui' : 'Non',
    Sous_Systeme: a.sous_systeme,
    type_etab: s?.typeEtab ?? 'ECOLE',
    Up: d?.priorite.indice ?? 0,
    Wp: d?.priorite.poids ?? 0,
    est_zone_rouge: d?.priorite.zoneRouge ?? false,
    pourvu: true,
  }
}

const STATUTS_VOEU: Record<string, StatutVoeu> = {
  SATISFAIT: 'examine',
  NON_RETENU: 'examine',
  AUCUN_POSTE: 'examine',
  INCOMPATIBLE: 'autre_sous_systeme',
  ECOLE_INCONNUE: 'hors_referentiel',
}

/** Une candidature par enseignant, avec ses vœux examinés. */
export function versCandidatures(
  lignes: CandidatureDjango[],
  vivier: Map<string, EnseignantDjango>,
  affectes: Map<string, ProposedAssignment>,
  ecoles: Map<string, SchoolDiagnostic>,
  settings: EngineSettings,
): Candidature[] {
  const parEnseignant = new Map<string, CandidatureDjango[]>()
  for (const l of lignes) parEnseignant.set(l.id_ens, [...(parEnseignant.get(l.id_ens) ?? []), l])
  const classement = [...parEnseignant.entries()].sort((a, b) => nombre(b[1][0].bareme) - nombre(a[1][0].bareme))

  return classement.map(([matricule, voeux], i) => {
    const t = vivier.get(matricule)
    const teacher = t
      ? versTeacher(t)
      : { ...versTeacher({ Matricule_Enseignant: matricule } as EnseignantDjango), voeux: voeux.map(v => v.id_etab) }
    const origine = ecoles.get(teacher.idEtabAttache)
    const satisfait = voeux.find(v => v.statut === 'SATISFAIT')
    const affectation = affectes.get(matricule)
    const issue = satisfait ? 'affecte_voeu' : affectation ? 'hors_voeux' : 'sans_solution'
    const examines: VoeuExamine[] = voeux
      .sort((a, b) => a.rang_voeu - b.rang_voeu)
      .map(v => {
        const ecole = ecoles.get(v.id_etab)
        return {
          rang: v.rang_voeu,
          code: v.id_etab,
          schoolId: ecole ? v.id_etab : null,
          nomEtab: ecole?.school.nom ?? v.id_etab,
          statut: STATUTS_VOEU[v.statut] ?? 'examine',
          bonification: 0,
          score: nombre(v.bareme),
          poidsExamen: 0,
          interregional: Boolean(ecole && origine && ecole.school.region !== origine.school.region),
        }
      })
    const age = teacher.age ?? 0
    return {
      teacher,
      ecoleOrigine: {
        id: teacher.idEtabAttache,
        nom: origine?.school.nom ?? teacher.idEtabAttache,
        excedent: origine?.excedentTheorique ?? 0,
        classement: origine?.classement ?? null,
      },
      recevable: true,
      motifsIrrecevabilite: [],
      voeux: examines,
      pointsAnciennete: teacher.anciennetePosteAns,
      pointsZoneDifficile: 0,
      procheRetraite: age >= settings.besoin.ageRetraite - settings.mobilite.anneesAvantRetraite,
      protege: false,
      rangClassement: i + 1,
      issue,
      detailIssue: satisfait
        ? satisfait.motif
        : affectation
          ? `Affecté hors vœux (${affectation.phase}) à ${affectation.nomEtabDestination}.`
          : voeux.map(v => `Vœu ${v.rang_voeu} (${v.id_etab}) : ${v.motif}`).join(' ; '),
    }
  })
}

export function versInvariants(controles: ControleDjango[]): InvariantCheck[] {
  return controles.map(c => ({ code: c.code, label: c.libelle, ok: c.ok, detail: texte(c.details) }))
}

export function versJournal(lignes: JournalDjango[], calculeLe: string | null): JournalSimulation {
  return {
    tours: [],
    toursTronques: false,
    logs: lignes.map(l => ({
      etape: libellePhase(l.phase),
      message: `${l.id_ens} → ${l.id_etab} (${l.id_poste}) : ${l.statut.toLowerCase()}${l.motif ? ` — ${l.motif}` : ''}`,
      valeur: null,
    })),
    computedAt: calculeLe ?? '',
  }
}

/** Combinaisons du serveur (meilleurs postes vacants d'un non-affecté) → mouvements directs. */
export function versCombinaisons(
  lignes: CombinaisonDjango[],
  vivier: Map<string, EnseignantDjango>,
  ecoles: Map<string, SchoolDiagnostic>,
): CombinaisonArbitrage[] {
  const out: CombinaisonArbitrage[] = []
  for (const l of lignes) {
    const t = vivier.get(l.id_ens)
    const de = ecoles.get(t?.Ecole_Attache_Actuelle ?? '')?.school
    const nom = t ? `${t.nom} ${t.prenom}`.trim() : l.id_ens
    for (const o of l.options) {
      const vers = ecoles.get(o.id_etab)
      out.push({
        type: 'direct',
        schoolId: o.id_etab,
        nomEtab: vers?.school.nom ?? o.id_etab,
        indicePriorite: vers?.priorite.indice ?? 0,
        mouvements: [
          {
            teacherId: l.id_ens,
            nom,
            deId: de?.id ?? '',
            deNom: de?.nom ?? '',
            versId: o.id_etab,
            versNom: vers?.school.nom ?? o.id_etab,
          },
        ],
        proximite: proximite(
          {
            commune: de?.commune ?? '',
            iaeb: de?.iaeb ?? '',
            departement: de?.departement ?? '',
            region: de?.region ?? '',
          },
          {
            commune: o.commune,
            iaeb: vers?.school.iaeb ?? '',
            departement: o.departement,
            region: vers?.school.region ?? '',
          },
        ),
        description: `${nom} (${de?.nom ?? 'école inconnue'}) vers ${vers?.school.nom ?? o.id_etab} : score ${o.score.toFixed(2)}${o.zone_rouge ? ', zone rouge' : ''}.`,
      })
    }
  }
  return out
}

function situation(ecoles: Iterable<SchoolDiagnostic>, couverts: Map<string, number>): SituationSnapshot {
  const parRegion = new Map<string, number>()
  let ecolesEnDeficit = 0
  let deficitTotal = 0
  for (const d of ecoles) {
    const deficit = Math.max(0, d.besoinTheorique - (couverts.get(d.school.id) ?? 0))
    if (deficit <= 0) continue
    ecolesEnDeficit++
    deficitTotal += deficit
    const region = d.school.region || 'Région non renseignée'
    parRegion.set(region, (parRegion.get(region) ?? 0) + deficit)
  }
  return {
    ecolesEnDeficit,
    postesVacants: deficitTotal,
    deficitTotal,
    parRegion: [...parRegion.entries()]
      .map(([region, deficit]) => ({ region, deficit }))
      .sort((a, b) => b.deficit - a.deficit),
    pressionMoyenne: null,
  }
}

/** Résultat national complet du contrat. */
export function versResultat(d: DonneesResultat): SimulationResult {
  const vivier = new Map(d.vivier.map(t => [t.Matricule_Enseignant, t]))
  const assignments = d.affectations.map(a => versProposition(a, vivier.get(a.id_ens), d.ecoles))
  const parMatricule = new Map(assignments.map(a => [a.teacherId, a]))
  const pool = versPool(d.vivier, d.ecoles)

  const nonPourvus = [...d.postesNonPourvus].sort((a, b) => nombre(b.Up) - nombre(a.Up))
  const uncoveredPosts = nonPourvus.map((p, i) => versPoste(p, i + 1, d.ecoles))
  const tousPostes = [...nonPourvus, ...d.affectations.map(a => postePourvu(a, d.ecoles))].sort(
    (a, b) => nombre(b.Up) - nombre(a.Up),
  )
  const postes = tousPostes.map((p, i) => versPoste(p, i + 1, d.ecoles))

  const compteur = new Map<ProximityLevel, number>()
  for (const a of assignments) compteur.set(a.niveauProximite, (compteur.get(a.niveauProximite) ?? 0) + 1)
  const parNature = new Map<NatureMouvement, number>()
  for (const a of assignments) parNature.set(a.nature, (parNature.get(a.nature) ?? 0) + 1)

  const couverts = new Map<string, number>()
  const effectifs = new Map<string, number>()
  for (const diag of d.ecoles.values()) effectifs.set(diag.school.id, diag.calcul.enseignantsRetenus)
  for (const a of assignments) {
    couverts.set(a.schoolDestinationId, (couverts.get(a.schoolDestinationId) ?? 0) + 1)
    effectifs.set(a.schoolDestinationId, (effectifs.get(a.schoolDestinationId) ?? 0) + 1)
    if (a.schoolOrigineId) effectifs.set(a.schoolOrigineId, (effectifs.get(a.schoolOrigineId) ?? 0) - 1)
  }

  const besoinInitial = assignments.length + uncoveredPosts.length
  const diagnostics = [...d.ecoles.values()]
  return {
    scenarioId: String(d.scenario.id),
    scenarioNom: d.scenario.nom,
    scope: portee(d.scenario),
    besoinInitial,
    postesCouverts: assignments.length,
    besoinResiduel: uncoveredPosts.length,
    enseignantsDeplaces: assignments.length,
    ecolesBeneficiaires: new Set(assignments.map(a => a.schoolDestinationId)).size,
    ecolesSources: new Set(assignments.map(a => a.schoolOrigineId)).size,
    tauxCouverture: besoinInitial > 0 ? assignments.length / besoinInitial : 0,
    mouvementsParPerimetre: NIVEAUX.map(niveau => ({ niveau, nombre: compteur.get(niveau) ?? 0 })).filter(
      m => m.nombre > 0,
    ),
    mouvementsParNature: (['voeu', 'hors_voeux', 'obligatoire', 'arbitrage'] as NatureMouvement[])
      .map(n => ({ nature: n, nombre: parNature.get(n) ?? 0 }))
      .filter(m => m.nombre > 0),
    assignments,
    unmatchedTeachers: pool.filter(p => !p.affecte),
    uncoveredPosts,
    pool: versVivier(pool, d.ecoles),
    postes,
    candidatures: versCandidatures(d.candidatures, vivier, parMatricule, d.ecoles, d.settings),
    tours: [],
    toursTronques: false,
    combinaisons: [],
    voeuxAutreSousSysteme: [],
    projectionsN2: [],
    postesProjetesN2: 0,
    recrutes: null,
    arbitrages: [],
    syntheseAvant: syntheseTerritoriale(diagnostics, d.settings),
    syntheseApres: syntheseTerritoriale(diagnostics, d.settings, effectifs),
    projectionPluriannuelle: { ecoles: [], territoire: [] },
    postesZoneRougeNonPourvus: uncoveredPosts.filter(p => p.priorite.zoneRouge).length,
    before: situation(diagnostics, new Map()),
    after: situation(diagnostics, couverts),
    faitsPrince: [],
    invariants: versInvariants(d.invariants),
    logs: versJournal(d.journal, d.scenario.calcule_le).logs,
    computedAt: d.scenario.calcule_le ?? '',
  }
}

// --- Projections ------------------------------------------------------------------------------

const ANNEES = ['N+1', 'N+2', 'N+3'] as const

/** Projections N à N+3 du serveur → projections école par école et par sous-système. */
export function versProjections(
  lignes: ProjectionDjango[],
  ecoles: Map<string, SchoolDiagnostic>,
  resultat: SimulationResult,
  settings: EngineSettings,
): ProjectionsScenario {
  const arrivants = new Map<string, string[]>()
  const sortants = new Map<string, string[]>()
  for (const a of resultat.assignments) {
    arrivants.set(a.schoolDestinationId, [...(arrivants.get(a.schoolDestinationId) ?? []), a.teacherId])
    if (a.schoolOrigineId) sortants.set(a.schoolOrigineId, [...(sortants.get(a.schoolOrigineId) ?? []), a.teacherId])
  }
  const tau = Math.max(0, settings.recrutement.tauxAttritionHorsRetraite)

  const ecolesProjetees: ProjectionEcole[] = lignes.map(l => {
    const id = String(l.Identifiant_Ecole)
    const d = ecoles.get(id)
    const entrent = arrivants.get(id) ?? []
    const partent = sortants.get(id) ?? []
    let effectif = (d?.calcul.enseignantsRetenus ?? 0) + entrent.length - partent.length
    const besoins = [l['Besoin_Projete_N+1'], l['Quota_Recrutement_Estime_N+2'], l['Quota_Recrutement_Estime_N+3']]
    return {
      schoolId: id,
      nomEtab: d?.school.nom ?? id,
      sousSysteme: sousSysteme(l.Sous_Systeme),
      region: d?.school.region ?? '',
      departement: d?.school.departement ?? '',
      commune: d?.school.commune ?? '',
      indicePriorite: nombre(l['Poids_Du_Poste (Up)']),
      bmax: nombre(l['Capacite_Physique (BMAX)']),
      dotation: nombre(l['Dotation_Theorique (De)']),
      cible: d?.calcul.cible ?? 0,
      besoinAvantPlan: nombre(l['Besoin_Ouvert_N (be)']),
      excedentAvantPlan: nombre(l['Excedent_Mobilisable_N (xe)']),
      arrivants: entrent,
      sortants: partent,
      sallesManquantes: nombre(l['Salles_Manquantes_N (se)']),
      annees: ANNEES.map((annee, i) => {
        const departs = nombre(l[`Departs_Retraite_${annee}`])
        effectif = Math.max(0, effectif - departs)
        return { annee, departsRetraite: departs, effectif, besoin: nombre(besoins[i]), excedent: 0 }
      }),
    }
  })

  const territoire = new Map<string, ProjectionTerritoire>()
  for (const e of ecolesProjetees) {
    for (const a of e.annees) {
      const ss = e.sousSysteme ?? 'non_renseigne'
      const cle = `${a.annee}|${ss}`
      const t = territoire.get(cle) ?? {
        annee: a.annee,
        sousSysteme: ss,
        effectif: 0,
        departsRetraite: 0,
        attrition: 0,
        besoin: 0,
        excedent: 0,
        recrutementAPrevoir: 0,
      }
      t.effectif += a.effectif
      t.departsRetraite += a.departsRetraite
      t.besoin += a.besoin
      t.recrutementAPrevoir += a.besoin
      territoire.set(cle, t)
    }
  }
  for (const t of territoire.values()) t.attrition = Math.ceil((tau * t.effectif) / 100)
  return { ecoles: ecolesProjetees, territoire: [...territoire.values()] }
}
