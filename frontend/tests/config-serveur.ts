/** Configuration du serveur par défaut, pour les tests des conversions. */

import type { ConfigDjango } from '../components/shared/api/backend/conversions/parametres'

export const CONFIG: ConfigDjango = {
  seuils: { anciennete_poste_recevabilite_ans: 5, age_senior_ans: 50, age_jeune_ans: 35, age_retraite_ans: 60 },
  poids_bareme_individuel: {
    C1_carriere_zone: 0.3,
    C2_anciennete_poste: 0.25,
    C3_charges_familiales: 0.2,
    C4_formation_continue: 0.15,
    C5_cohorte_age: 0.1,
  },
  points_situation_familiale: { celibataire: 10, divorce: 8, veuf: 8, marie: 5 },
  poids_score_appariement: {
    Z1_bareme_individu: 0.25,
    Z2_poids_poste_Up: 0.25,
    Z3_proximite: 0.25,
    Z4_ajustements: 0.25,
  },
  points_proximite: { meme_commune: 60, meme_departement: 30, autre: 0 },
  ajustements_contextuels: {
    appui_multigrades_jeune: 15,
    senior_vers_encadrement: 15,
    allegement_senior_standard: 8,
    transition_rural_urbain: 12,
    bonification_ciblee: 20,
  },
  vulnerabilite: { t1: 0.3, t2: 0.7 },
  besoin: {
    norme_eleves_par_maitre: 60,
    effectif_premiere_section: 20,
    nombre_niveaux: 6,
    niveaux_par_maitre_multigrade: 2,
    minimum_selon_multigrades: true,
    double_flux_autorise: true,
  },
  regles_dreb: {
    phase1_voeux_actif: true,
    phase2_proximite_iaeb: true,
    phase2_proximite_departement: true,
    phase3_extension_regionale: true,
    regions_etanches: true,
  },
}
