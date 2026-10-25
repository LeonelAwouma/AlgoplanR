/**
 * Données : jeux, classeurs importés, colonnes attendues et rapport de qualité
 * du serveur Django → types du contrat.
 */

import type {
  ColonneAttendue,
  ColumnMappingReport,
  DataQualityReport,
  FichierImporte,
  JeuDeDonnees,
  PorteeJeu,
  QualityIssue,
  SchoolDiagnostic,
  StatutJeu,
  TypeColonnes,
  TypeFichier,
  TypeFichierEnvoi,
} from '../../contrat'
import { anneeScolaireCourante } from '../../../kernel/annee'

// --- Jeux -------------------------------------------------------------------------------------

/** Résumé d'un jeu (`services.resume_jeu`). */
export interface JeuDjango {
  id: string
  nom: string
  source: 'import' | 'demonstration' | string
  cree_le: string
  /** Année scolaire des données importées (« 2024-2025 »), saisie à sa création : base des projections. */
  annee_scolaire?: string
  nb_etablissements: number
  nb_enseignants: number
  nb_scenarios: number
  nb_faits_prince: number
  nb_arbitrages: number
  nb_recrues: number
  /** Données que les fichiers ne donnent pas (le calcul garde 0, ou 35 ans pour l'âge). */
  donnees_manquantes?: { ecoles_sans_effectif: number; ecoles_sans_salles: number; enseignants_sans_age: number }
  /** Portée fixée par le serveur : un jeu régional n'est ouvert qu'au délégué de sa région. */
  portee?: PorteeJeu | ''
  region?: string | null
  /** Validation comme référence des projections ; « brouillon » après une actualisation. */
  statut?: StatutJeu
  scenario_retenu_id?: string | null
  /** Noms des classeurs d'origine, par type (absent pour un jeu de démonstration ou consolidé). */
  fichiers_source?: Partial<Record<TypeFichier, string>>
}

/** Jeu du contrat. */
export function versJeu(j: JeuDjango): JeuDeDonnees {
  const demonstration = j.source === 'demonstration'
  return {
    id: j.id,
    demonstration,
    importeLe: j.cree_le,
    fichiersSource: {
      etablissements: j.fichiers_source?.etablissements ?? (demonstration ? null : j.nom),
      enseignants: j.fichiers_source?.enseignants ?? null,
    },
    anneeScolaire: j.annee_scolaire ?? anneeScolaireCourante(),
    statut: j.statut ?? 'brouillon',
    nbEtablissements: j.nb_etablissements,
    nbEnseignants: j.nb_enseignants,
    nbUnitesCalcul: j.nb_etablissements,
    scenarioRetenuId: j.scenario_retenu_id ?? null,
    nbFaitsPrinceActifs: j.nb_faits_prince,
    donneesElevesDisponibles: j.donnees_manquantes
      ? j.donnees_manquantes.ecoles_sans_effectif < j.nb_etablissements
      : true,
    nom: j.nom,
    portee: j.portee || undefined,
    region: j.region ?? null,
  }
}

// --- Colonnes attendues -----------------------------------------------------------------------

interface Colonne {
  label: string
  consequence: string
  alias: string[]
}

/**
 * Colonnes reconnues par le serveur (domaine/donnees/colonnes.py et
 * correspondance.SYNONYMES). Seul l'identifiant est indispensable.
 */
const COLONNES: Record<TypeColonnes, Record<string, Colonne>> = {
  etablissements: {
    Identifiant_Ecole: {
      label: "Code de l'établissement",
      consequence: 'Sans identifiant, aucune école ne peut être analysée ni rattachée à ses enseignants.',
      alias: ['id_ecole', 'code_ecole', 'ecole', 'identifiant', 'id_etab', 'code_etablissement'],
    },
    Sous_Systeme: {
      label: 'Sous-système',
      consequence: 'Les écoles sont comptées en francophone par défaut.',
      alias: ['sous_systeme', 'soussysteme', 'systeme', 'sous_systeme_ecole'],
    },
    Region: {
      label: 'Région',
      consequence: 'Les écoles ne peuvent pas être agrégées par région.',
      alias: ['region', 'dreb'],
    },
    Departement: {
      label: 'Département',
      consequence: 'Les écoles ne peuvent pas être agrégées par département.',
      alias: ['departement', 'dept'],
    },
    Commune: {
      label: 'Commune',
      consequence: 'La proximité communale ne peut pas être évaluée.',
      alias: ['commune', 'arrondissement'],
    },
    Circonscription_IAEB: {
      label: 'Circonscription IAEB',
      consequence: 'La proximité IAEB ne peut pas être évaluée.',
      alias: ['iaeb', 'circonscription', 'inspection', 'circonscription_iaeb'],
    },
    Effectif_Eleves_Attendus: {
      label: 'Effectif des élèves attendus',
      consequence: 'La norme d’encadrement ne peut pas être calculée : seul le minimum pédagogique s’applique.',
      alias: ['effectif', 'effectif_eleves', 'eleves', 'ne', 'nb_eleves'],
    },
    Enseignants_Actuels: {
      label: 'Enseignants en poste',
      consequence: 'Les besoins et les excédents ne peuvent pas être calculés.',
      alias: ['enseignants', 'nb_enseignants', 'ee', 'enseignants_en_poste'],
    },
    Salles_Simple_Flux: {
      label: 'Salles en simple flux',
      consequence: 'La capacité physique (BMAX) est sous-estimée.',
      alias: ['salles_sf', 'salles_simple', 'ssf'],
    },
    Salles_Double_Flux: {
      label: 'Salles en double flux',
      consequence: 'La capacité physique (BMAX) est sous-estimée.',
      alias: ['salles_df', 'salles_double', 'sdf'],
    },
    Accessibilite_Zone: {
      label: 'Accessibilité de la zone',
      consequence: 'Le poids de vulnérabilité ignore l’accessibilité.',
      alias: ['accessibilite', 'zone', 'zone_accessibilite'],
    },
    Securite_Zone: {
      label: 'Zone de sécurité',
      consequence: 'Toutes les écoles comptent en zone verte.',
      alias: ['securite', 'zone_securite'],
    },
    Classes_Multigrades: {
      label: 'Classes multigrades',
      consequence: 'Le minimum pédagogique suppose six niveaux séparés.',
      alias: ['multigrade', 'multigrades', 'classes_multigrade'],
    },
    nom_etab: { label: "Nom de l'établissement", consequence: 'Le code sert de libellé.', alias: ['nom_etab'] },
    type_etab: {
      label: "Type d'établissement",
      consequence: 'Toutes les unités sont des écoles.',
      alias: ['type_etab'],
    },
    latitude: { label: 'Latitude', consequence: "L'école n'apparaît pas sur la carte.", alias: ['latitude', 'lat'] },
    longitude: { label: 'Longitude', consequence: "L'école n'apparaît pas sur la carte.", alias: ['longitude', 'lon'] },
  },
  enseignants: {
    Matricule_Enseignant: {
      label: 'Matricule',
      consequence: 'Sans matricule, aucun enseignant ne peut être pris en compte.',
      alias: ['matricule', 'id_enseignant', 'id_ens'],
    },
    Sous_Systeme_Formation: {
      label: 'Sous-système de formation',
      consequence: 'Les enseignants sont comptés en francophone par défaut.',
      alias: ['sous_systeme_formation', 'formation_sous_systeme', 'sous_systeme'],
    },
    Ecole_Attache_Actuelle: {
      label: "École d'attache",
      consequence: "L'enseignant ne peut être rattaché à aucune école.",
      alias: ['ecole_actuelle', 'ecole_attache', 'affectation_actuelle', 'ecole'],
    },
    Age: { label: 'Âge', consequence: 'Un âge absent compte pour 35 ans.', alias: ['age'] },
    Anciennete_Carriere: {
      label: 'Ancienneté de carrière',
      consequence: 'La composante carrière du barème (C1) est nulle.',
      alias: ['anciennete', 'anciennete_carriere', 'anciennete_service'],
    },
    Anciennete_Poste_Actuel: {
      label: 'Ancienneté au poste',
      consequence: 'La composante ancienneté au poste (C2) est nulle.',
      alias: ['anciennete_poste', 'anciennete_au_poste'],
    },
    Annees_Zone_Difficulte_1: {
      label: 'Années en zone de difficulté 1',
      consequence: 'Le service en zone difficile n’est pas valorisé.',
      alias: ['zone_difficulte_1', 'annees_zone_1', 'zd1'],
    },
    Annees_Zone_Difficulte_2: {
      label: 'Années en zone de difficulté 2',
      consequence: 'Le service en zone difficile n’est pas valorisé.',
      alias: ['zone_difficulte_2', 'annees_zone_2', 'zd2'],
    },
    Situation_Matrimoniale: {
      label: 'Situation matrimoniale',
      consequence: 'Tous les enseignants comptent comme célibataires (C3).',
      alias: ['situation_familiale', 'situation', 'statut_matrimonial'],
    },
    Nombre_Enfants_A_Charge: {
      label: 'Enfants à charge',
      consequence: 'Les charges familiales (C3) ignorent les enfants.',
      alias: ['enfants', 'nb_enfants', 'enfants_a_charge'],
    },
    Formations_Continues: {
      label: 'Formations continues',
      consequence: 'La composante formation (C4) est nulle.',
      alias: ['formations', 'nb_formations', 'formation_continue'],
    },
    Voeu_1: {
      label: 'Vœu 1',
      consequence: 'Aucune demande de mutation n’est examinée.',
      alias: ['voeu1', 'voeu_un', 'choix_1'],
    },
    Voeu_2: {
      label: 'Vœu 2',
      consequence: 'Seul le premier vœu est examiné.',
      alias: ['voeu2', 'voeu_deux', 'choix_2'],
    },
    Voeu_3: {
      label: 'Vœu 3',
      consequence: 'Le troisième vœu n’est pas examiné.',
      alias: ['voeu3', 'voeu_trois', 'choix_3'],
    },
    Motif_Bonification: {
      label: 'Motif de bonification',
      consequence:
        'Aucune bonification ciblée n’est accordée. Le motif doit citer l’école visée parmi les vœux (rapprochement de conjoint, suivi médical).',
      alias: ['motif', 'bonification'],
    },
    nom: { label: 'Nom', consequence: 'Le matricule sert de libellé.', alias: ['nom'] },
    prenom: { label: 'Prénom', consequence: 'Le prénom n’est pas affiché.', alias: ['prenom'] },
  },
  prince: {
    Matricule_Enseignant: {
      label: 'Matricule',
      consequence: 'Sans matricule, la décision est écartée.',
      alias: ['matricule', 'id_enseignant', 'id_ens'],
    },
    Identifiant_Ecole: {
      label: "Code de l'école imposée",
      consequence: 'Sans école, la décision est écartée.',
      alias: ['id_ecole', 'code_ecole', 'ecole', 'identifiant', 'id_etab', 'code_etablissement'],
    },
    Motif: {
      label: 'Motif de la décision',
      consequence: 'Le motif par défaut « Décision de l’autorité (Effet de prince) » est enregistré.',
      alias: ['motif_decision', 'observation', 'justification', 'raison'],
    },
  },
  recrues: {
    id_recrue: {
      label: 'Identifiant du candidat',
      consequence: 'Sans identifiant, la ligne est écartée.',
      alias: ['id_recrue', 'identifiant_recrue'],
    },
    nom: { label: 'Nom', consequence: "L'identifiant sert de libellé.", alias: ['nom'] },
    prenom: { label: 'Prénom', consequence: 'Le prénom n’est pas affiché.', alias: ['prenom'] },
    sous_systeme: {
      label: 'Sous-système',
      consequence: 'Le candidat peut être déployé dans les deux sous-systèmes.',
      alias: ['sous_systeme'],
    },
    region_souhaitee: {
      label: 'Région souhaitée',
      consequence: 'Le candidat est déployé sur le premier poste prioritaire, toutes régions confondues.',
      alias: ['region_souhaitee', 'region'],
    },
    rang: {
      label: 'Rang de classement',
      consequence: 'Les candidats sont départagés par identifiant.',
      alias: ['rang'],
    },
  },
}

/** Colonnes indispensables, par type de classeur. */
const REQUISES: Record<TypeColonnes, string[]> = {
  etablissements: ['Identifiant_Ecole'],
  enseignants: ['Matricule_Enseignant'],
  prince: ['Matricule_Enseignant', 'Identifiant_Ecole'],
  recrues: ['id_recrue'],
}

/** Colonnes qu'un classeur doit fournir, indispensables d'abord. */
export function colonnesAttendues(type: TypeColonnes): ColonneAttendue[] {
  return Object.entries(COLONNES[type])
    .map(([champ, c]) => ({
      champ,
      label: c.label,
      requis: REQUISES[type].includes(champ),
      consequence: c.consequence,
      alias: [champ, ...c.alias],
    }))
    .sort((a, b) => Number(b.requis) - Number(a.requis))
}

// --- Classeurs importés -----------------------------------------------------------------------

/** Classeur reçu, tel que le décrit le serveur (`views._fichier_dict`). */
export interface FichierDjango {
  id: string
  type: TypeFichierEnvoi
  nom_fichier: string
  feuille: string
  feuilles: string[]
  entetes: string[]
  apercu: Record<string, string | number | boolean | null>[]
  correspondance: Record<string, string>
  colonnes_a_confirmer: { colonne: string; obligatoire: boolean; suggestions: string[] }[]
  nb_lignes: number
  base_nationale?: boolean
}

/** Correspondance des colonnes d'un classeur, au format du contrat. */
export function versCorrespondances(f: FichierDjango): ColumnMappingReport {
  const colonnes = COLONNES[f.type]
  const retenus = new Set(Object.values(f.correspondance))
  const matches = Object.entries(colonnes).map(([champ, c]) => {
    const enTete = f.correspondance[champ] ?? null
    return {
      champ,
      label: c.label,
      enTete,
      methode: (enTete === null ? 'absent' : enTete === champ ? 'exact' : 'alias') as 'absent' | 'exact' | 'alias',
      confiance: enTete === null ? 0 : 1,
      requis: REQUISES[f.type].includes(champ),
    }
  })
  return {
    dataset: f.type,
    enTetes: f.entetes,
    matches,
    enTetesInconnus: f.entetes.filter(h => !retenus.has(h)),
    incomplet: matches.some(m => m.requis && m.enTete === null),
  }
}

export function versFichier(f: FichierDjango): FichierImporte {
  return {
    id: f.id,
    type: f.type,
    nomFichier: f.nom_fichier,
    feuilles: f.feuilles,
    feuilleLue: f.feuille,
    lignes: f.nb_lignes,
    apercu: f.apercu,
    correspondances: versCorrespondances(f),
    baseNationale: f.base_nationale ?? false,
  }
}

// --- Qualité ----------------------------------------------------------------------------------

/** Rapport de qualité du serveur (`qualite.rapport.controler`). */
export interface QualiteDjango {
  valide: boolean
  erreurs: { code: string; gravite: string; message: string }[]
  avertissements: { code: string; gravite: string; message: string }[]
  statistiques: { nb_etablissements: number; nb_enseignants: number; nb_erreurs: number; nb_avertissements: number }
  reconciliation_effectifs?: {
    ecoles_comparees: number
    ecoles_en_ecart: number
    ecoles_sans_effectif_declare: number
    ecart_total: number
    ecart_absolu_total: number
    ecoles: {
      id_ecole: string
      nom_ecole: string
      enseignants_declares: number
      matricules_rattaches: number
      ecart: number
    }[]
    liste_tronquee: boolean
    regle: string
  } | null
  import_regional?: {
    region: string
    etablissements_fichier: number
    etablissements_retenus: number
    etablissements_autres_regions: number
    etablissements_ecartes: number
    enseignants_fichier: number
    enseignants_retenus: number
    enseignants_autres_regions: number
    enseignants_non_rattaches: number
    enseignants_ambigus: number
    anomalies: {
      fichier: 'etablissements' | 'enseignants'
      ligne: number
      code: string
      motif: string
      valeur: string
    }[]
    anomalies_tronquees: boolean
  } | null
}

/**
 * Points retirés par anomalie. Le serveur ne note pas la qualité : ce barème de
 * présentation est détaillé dans `detailScore`, pour que le score reste explicable.
 */
const PENALITE = { erreur: 20, avertissement: 5 }

function versAnomalie(a: QualiteDjango['erreurs'][number], severite: 'erreur' | 'avertissement'): QualityIssue {
  const nombre = /^(\d+)/.exec(a.message)?.[1]
  return {
    code: a.code,
    severity: severite,
    // Le nombre est affiché à part (en gras) : le libellé ne le répète pas.
    label: nombre ? a.message.replace(/^\d+\s*/, '') : a.message,
    consequence: severite === 'erreur' ? 'Le jeu ne peut pas être créé tant que ce point n’est pas corrigé.' : '',
    dataset: a.code.startsWith('ETAB') ? 'etablissements' : a.code.startsWith('ENS') ? 'enseignants' : 'croisement',
    count: nombre ? Number(nombre) : 1,
    exemples: [],
    penalite: PENALITE[severite],
  }
}

/** Rapport de qualité du contrat ; `ecoles` sert à mesurer la complétude territoriale. */
export function versRapportQualite(q: QualiteDjango, ecoles: SchoolDiagnostic[]): DataQualityReport {
  const errors = q.erreurs.map(a => versAnomalie(a, 'erreur'))
  const warnings = q.avertissements.map(a => versAnomalie(a, 'avertissement'))
  const detailScore = [...q.erreurs, ...q.avertissements].map((a, i) => ({
    label: a.message,
    points: [...errors, ...warnings][i].penalite,
  }))
  const score = Math.max(0, 100 - detailScore.reduce((s, d) => s + d.points, 0))
  const total = ecoles.length
  const avecRegion = ecoles.filter(d => d.school.region !== '').length
  const avecDepartement = ecoles.filter(d => d.school.departement !== '').length
  const avecCommune = ecoles.filter(d => d.school.commune !== '').length
  const complets = ecoles.filter(d => d.school.region && d.school.departement && d.school.commune).length
  return {
    score,
    appreciation: score >= 85 ? 'Bonne' : score >= 70 ? 'Acceptable' : score >= 50 ? 'Fragile' : 'Insuffisante',
    errors,
    warnings,
    missingFields: [],
    duplicates: [],
    unknownSchools: [],
    invalidValues: [],
    territorialCompleteness: {
      avecRegion,
      avecDepartement,
      avecCommune,
      total,
      tauxComplet: total > 0 ? complets / total : 0,
    },
    ecolesValides: q.statistiques.nb_etablissements,
    ecolesLues: q.statistiques.nb_etablissements,
    enseignantsValides: q.statistiques.nb_enseignants,
    enseignantsLus: q.statistiques.nb_enseignants,
    donneesElevesDisponibles: ecoles.some(d => d.school.effectifTotalEleves != null),
    detailScore,
    reconciliationEffectifs: q.reconciliation_effectifs
      ? {
          ecolesComparees: q.reconciliation_effectifs.ecoles_comparees,
          ecolesEnEcart: q.reconciliation_effectifs.ecoles_en_ecart,
          ecolesSansEffectifDeclare: q.reconciliation_effectifs.ecoles_sans_effectif_declare,
          ecartTotal: q.reconciliation_effectifs.ecart_total,
          ecartAbsoluTotal: q.reconciliation_effectifs.ecart_absolu_total,
          ecoles: q.reconciliation_effectifs.ecoles.map(e => ({
            ecole: e.id_ecole,
            nomEcole: e.nom_ecole,
            enseignantsDeclares: e.enseignants_declares,
            matriculesRattaches: e.matricules_rattaches,
            ecart: e.ecart,
          })),
          listeTronquee: q.reconciliation_effectifs.liste_tronquee,
          regle: q.reconciliation_effectifs.regle,
        }
      : null,
    importRegional: q.import_regional
      ? {
          region: q.import_regional.region,
          etablissementsFichier: q.import_regional.etablissements_fichier,
          etablissementsRetenus: q.import_regional.etablissements_retenus,
          etablissementsAutresRegions: q.import_regional.etablissements_autres_regions,
          etablissementsEcartes: q.import_regional.etablissements_ecartes,
          enseignantsFichier: q.import_regional.enseignants_fichier,
          enseignantsRetenus: q.import_regional.enseignants_retenus,
          enseignantsAutresRegions: q.import_regional.enseignants_autres_regions,
          enseignantsNonRattaches: q.import_regional.enseignants_non_rattaches,
          enseignantsAmbigus: q.import_regional.enseignants_ambigus,
          anomalies: q.import_regional.anomalies,
          anomaliesTronquees: q.import_regional.anomalies_tronquees,
        }
      : null,
  }
}
