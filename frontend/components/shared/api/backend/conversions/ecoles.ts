/**
 * Établissements : ligne enrichie du serveur Django (colonnes du fichier et
 * indicateurs Pe, me, De, BMAX, Ke, be, xe, se, ae, α, σ, Wp, β, Up) → `School`
 * et `SchoolDiagnostic` du contrat.
 *
 * Les grandeurs du diagnostic sont celles du serveur ; seules la sévérité, le
 * classement et les raisons sont relus côté interface, avec les fonctions du
 * moteur de référence.
 */

import type { ClassementEcole, EngineSettings, School, SchoolDiagnostic } from '../../contrat'
import { raisonsPriorite, severite } from '../moteur/diagnostic'
import { round2 } from '../moteur/nombres'
import {
  accessibilite,
  estOui,
  estStructure,
  nombre,
  nombreOuNull,
  sousSysteme,
  texte,
  zone,
  zoneSecurite,
} from './referentiel'

/** Établissement tel que le sert le serveur (`Ecole.vers_dict`). */
export interface EcoleDjango {
  Identifiant_Ecole: string
  Sous_Systeme: string
  Region: string
  Departement: string
  Commune: string
  Circonscription_IAEB: string
  Effectif_Eleves_Attendus: number
  Enseignants_Actuels: number
  /** Taux d'encadrement de l'école (élèves par enseignant), calculé par le serveur ; `null` si effectif inconnu. */
  rem?: number | null
  /** Élèves par classe ouverte, calculé par le serveur ; `null` sans classes ouvertes ou sans effectif. */
  eleves_par_classe?: number | null
  Salles_Simple_Flux: number
  Salles_Double_Flux: number
  Accessibilite_Zone: string
  Securite_Zone: string
  Classes_Multigrades: string
  /** Optionnelle : nombre de classes réellement ouvertes. */
  Classes_Ouvertes?: number | null
  /** Le fichier renseigne l'effectif d'élèves / les salles (absent des anciennes données : renseigné). */
  effectif_connu?: boolean
  salles_connues?: boolean
  nom_etab: string
  type_etab: string
  Pe: number
  me: number
  De: number
  BMAX: number
  Ke: number
  be: number
  xe: number
  /** Enseignants du vivier rattachés à l'école : au plus xe, ancienneté de poste suffisante. */
  mobilisables?: number
  se: number
  ae: number
  alpha: number
  sigma: number
  Wp: number
  beta: number
  Up: number
  niveau_difficulte: number
  nb_postes_ouverts: number
  est_necessiteuse: boolean
  est_excedentaire: boolean
  est_zone_rouge: boolean
  /** Rang d'accueil calculé par le serveur ; `null` pour une école sans besoin. */
  rang_priorite?: number | null
  latitude?: number
  longitude?: number
}

/** Établissement du contrat. `ligne` : rang de l'école dans le fichier (à partir de 1). */
export function versSchool(e: EcoleDjango, ligne: number): School {
  const sallesRenseignees = e.salles_connues !== false
  const salles = nombre(e.Salles_Simple_Flux) + nombre(e.Salles_Double_Flux)
  const multigrade = texte(e.Classes_Multigrades)
  const eleves = e.effectif_connu === false ? null : nombreOuNull(e.Effectif_Eleves_Attendus)
  return {
    id: e.Identifiant_Ecole,
    codeEcole: e.Identifiant_Ecole,
    iaeb: texte(e.Circonscription_IAEB),
    latitude: nombreOuNull(e.latitude),
    longitude: nombreOuNull(e.longitude),
    nom: texte(e.nom_etab) || e.Identifiant_Ecole,
    region: texte(e.Region),
    departement: texte(e.Departement),
    commune: texte(e.Commune),
    zone: zone(e.Accessibilite_Zone),
    zoneBrute: texte(e.Accessibilite_Zone),
    typeEtab: texte(e.type_etab),
    // BMAX est une capacité en maîtres (une par salle simple flux, deux par salle double flux), pas un nombre de classes.
    capaciteMaitres: nombre(e.BMAX),
    nombreClassesOuvertes: nombreOuNull(e.Classes_Ouvertes),
    sallesRenseignees,
    nbSallesClasse: sallesRenseignees ? salles : null,
    sallesDoubleFlux: sallesRenseignees ? nombre(e.Salles_Double_Flux) : null,
    niveauxOuverts: null,
    departsConnusDeclares: null,
    sousSysteme: sousSysteme(e.Sous_Systeme),
    zoneSecurite: zoneSecurite(e.Securite_Zone),
    accessibilite: accessibilite(e.Accessibilite_Zone),
    estStructure: estStructure(e.type_etab),
    nbEnseignantsEtat: nombre(e.Enseignants_Actuels),
    nbAutresEnseignants: null,
    nbPostesOuvertsDeclares: null,
    // Le fichier dit seulement si l'école a des classes multigrades, pas combien.
    classesMultigrades: estOui(multigrade) ? 1 : 0,
    classesMultigradesRenseignees: multigrade !== '',
    prioriteLocale: 0,
    effectifTotalEleves: eleves,
    effectifFilles: null,
    effectifGarcons: null,
    effectifParNiveau: {},
    ligneSource: ligne,
  }
}

function classer(e: EcoleDjango): ClassementEcole {
  if (e.be > 0) return 'necessiteuse'
  if (e.xe > 0) return 'excedentaire'
  if (e.ae > 0) return 'a_examiner'
  return 'equilibree'
}

/** Diagnostic du contrat, à partir des indicateurs calculés par le serveur. */
export function versDiagnostic(e: EcoleDjango, ligne: number, settings: EngineSettings): SchoolDiagnostic {
  const school = versSchool(e, ligne)
  const enseignants = nombre(e.Enseignants_Actuels)
  const eleves = school.effectifTotalEleves
  // Taux d'encadrement et élèves par classe : lus du serveur (fonction commune), jamais refaits ici.
  const parEnseignant = e.rem ?? null
  const norme = settings.besoin.elevesParMaitre
  const besoin = nombre(e.be)
  const excedent = nombre(e.xe)
  const cible = nombre(e.Ke)
  const deficitRelatif = cible > 0 ? besoin / cible : null
  const zs = zoneSecurite(e.Securite_Zone)

  const diagnostic: SchoolDiagnostic = {
    school,
    enseignantsEtat: enseignants,
    enseignantsMinimumAConserver: nombre(e.De),
    besoinTheorique: besoin,
    postesDeclares: null,
    ecartBesoinDeclare: null,
    excedentTheorique: excedent,
    enseignantsMobilisables: e.mobilisables ?? excedent,
    calcul: {
      eleves,
      enseignantsEnPoste: enseignants,
      departsConnus: 0,
      enseignantsRetenus: enseignants,
      norme: nombre(e.Pe),
      minimumPedagogique: nombre(e.me),
      dotation: nombre(e.De),
      bmax: school.sallesRenseignees ? nombreOuNull(e.BMAX) : null,
      cible,
      besoin,
      excedent,
      surnombre: nombre(e.ae),
      sallesManquantes: nombre(e.se),
      remActuel: parEnseignant,
      methode: eleves == null ? 'repli_classes' : 'norme_eleves',
    },
    classement: classer(e),
    priorite: {
      pointsAccessibilite: nombre(e.alpha),
      pointsSecurite: nombre(e.sigma),
      poids: nombre(e.Wp),
      niveauDifficulte: Math.min(3, Math.max(1, nombre(e.niveau_difficulte) || 3)) as 1 | 2 | 3,
      pointsBesoin: nombre(e.beta),
      indice: nombre(e.Up),
      zoneSecurite: zs,
      zoneRouge: Boolean(e.est_zone_rouge),
      rang: e.rang_priorite ?? null,
    },
    elevesParEnseignant: parEnseignant,
    elevesParEnseignantEtat: parEnseignant,
    // Sans le nombre de classes ouvertes, le ratio n'est pas calculable : BMAX est une capacité, pas un effectif de classes.
    elevesParClasse: e.eleves_par_classe ?? null,
    effectifMoyenParNiveau: null,
    pressionPedagogique: norme > 0 && parEnseignant != null ? round2(parEnseignant / norme) : null,
    deficitAbsolu: besoin,
    deficitRelatif: deficitRelatif == null ? null : round2(deficitRelatif),
    severite: severite(besoin, excedent, deficitRelatif, settings),
    raisons: [],
  }
  return { ...diagnostic, raisons: raisonsPriorite(diagnostic) }
}
