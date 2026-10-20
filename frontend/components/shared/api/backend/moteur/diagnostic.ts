/**
 * Diagnostic d'une école : sévérité, raisons de priorisation, totaux d'un
 * territoire et ordre de priorité. Repris du moteur de référence
 * (moteur-reference/lib/analytics/diagnostic.ts) : les grandeurs de base
 * (dotation, besoin, excédent…) viennent du backend, seules ces lectures sont
 * refaites côté interface.
 */

import type {
  DiagnosticReason,
  EngineSettings,
  SchoolDiagnostic,
  SchoolSeverity,
  TerritorialTotals,
} from '../../contrat'
import { ratio, round2 } from './nombres'

/** Classe la gravité d'un besoin selon les seuils configurés (besoin rapporté à la cible). */
export function severite(
  besoin: number,
  excedent: number,
  deficitRelatif: number | null,
  settings: EngineSettings,
): SchoolSeverity {
  if (besoin <= 0) return excedent > 0 ? 'excedent' : 'satisfaisant'
  if (deficitRelatif == null) return 'deficit_important'
  if (deficitRelatif <= settings.seuilsSeverite.faible) return 'deficit_faible'
  if (deficitRelatif <= settings.seuilsSeverite.important) return 'deficit_important'
  return 'deficit_critique'
}

const fr = (n: number) => n.toLocaleString('fr-FR')
const pluriel = (n: number, mot: string) => `${fr(n)} ${mot}${n > 1 ? 's' : ''}`

/**
 * Raisons factuelles qui expliquent la situation d'une école. Chaque raison
 * découle d'une valeur calculée : aucune justification n'est produite quand la
 * donnée correspondante est absente.
 */
export function raisonsPriorite(d: SchoolDiagnostic): DiagnosticReason[] {
  const raisons: DiagnosticReason[] = []
  const c = d.calcul

  if (c.besoin > 0) {
    const plafond = c.bmax != null && c.bmax < c.dotation ? `, plafonnée à ${fr(c.cible)} par les salles` : ''
    raisons.push({
      code: 'deficit',
      texte: `Besoin de ${pluriel(c.besoin, 'maître')} : ${fr(c.enseignantsRetenus)} retenu(s) à la rentrée pour une cible de ${fr(c.cible)}${plafond}.`,
    })
  }

  if (c.departsConnus > 0) {
    raisons.push({
      code: 'deficit',
      texte: `${pluriel(c.departsConnus, 'départ')} connu(s) à la rentrée (retraite) déduit(s) de l'effectif.`,
    })
  }

  if (c.remActuel != null && d.pressionPedagogique != null && d.pressionPedagogique > 1) {
    raisons.push({
      code: 'pression_eleves',
      texte: `REM actuel de ${fr(c.remActuel)} élèves par maître, au-dessus de la norme de ${fr(Math.round(c.remActuel / d.pressionPedagogique))}.`,
    })
  }

  if (c.sallesManquantes > 0) {
    raisons.push({
      code: 'effectif_eleve',
      texte: `${pluriel(c.sallesManquantes, 'salle')} manquante(s) pour atteindre la dotation de ${fr(c.dotation)} maîtres : besoin en infrastructures.`,
    })
  }

  if (c.surnombre > 0) {
    raisons.push({
      code: 'effectif_eleve',
      texte: `${pluriel(c.surnombre, 'maître')} au-delà des salles, mais utile(s) aux élèves : à examiner (passage au double flux), pas à redéployer.`,
    })
  }

  if (d.school.classesMultigrades > 0 && c.besoin > 0) {
    raisons.push({
      code: 'classes_multigrades',
      texte: `${pluriel(d.school.classesMultigrades, 'classe')} multigrade(s) déclarée(s) dans une école nécessiteuse.`,
    })
  }

  if (d.priorite.niveauDifficulte < 3) {
    raisons.push({
      code: 'priorite_locale',
      texte: `École de niveau de difficulté ${d.priorite.niveauDifficulte} (poids de vulnérabilité ${fr(d.priorite.poids)})${d.priorite.zoneRouge ? ', en zone rouge' : ''}.`,
    })
  }

  if (d.school.prioriteLocale > 0 && d.school.prioriteLocale <= 3) {
    raisons.push({
      code: 'priorite_locale',
      texte: `Priorité locale déclarée au rang ${d.school.prioriteLocale} dans le fichier source.`,
    })
  }

  if (d.ecartBesoinDeclare != null && d.ecartBesoinDeclare !== 0) {
    const sens = d.ecartBesoinDeclare > 0 ? 'de plus que' : 'de moins que'
    raisons.push({
      code: 'ecart_postes_declares',
      texte: `${Math.abs(d.ecartBesoinDeclare)} poste(s) déclaré(s) ${sens} le besoin calculé (${d.postesDeclares} déclarés, ${d.besoinTheorique} calculés).`,
    })
  }

  return raisons
}

/** Additionne les diagnostics d'un ensemble d'écoles en totaux territoriaux (écrêtage avant addition). */
export function agregerTotaux(diagnostics: SchoolDiagnostic[]): TerritorialTotals {
  let classes: number | null = null
  let enseignantsEtat = 0
  let autresEnseignants: number | null = null
  let postesNecessaires = 0
  let postesDeclares: number | null = null
  let excedentMobilisable = 0
  let sallesManquantes = 0
  let surnombre = 0
  let effectifTotalEleves: number | null = null
  // Enseignants et classes des seules écoles dont l'effectif d'élèves est connu : ils forment le dénominateur
  // des rapports, pour que le numérateur et le dénominateur portent sur les mêmes écoles.
  let enseignantsAvecEleves = 0
  let classesAvecEleves = 0
  let elevesAvecClasses = 0
  let classesMultigrades = 0
  let ecolesEnDeficit = 0
  let ecolesAvecExcedent = 0
  let ecolesSatisfaisantes = 0
  let ecolesAExaminer = 0

  for (const d of diagnostics) {
    if (d.school.nombreClassesOuvertes != null) classes = (classes ?? 0) + d.school.nombreClassesOuvertes
    enseignantsEtat += d.enseignantsEtat
    if (d.school.nbAutresEnseignants != null)
      autresEnseignants = (autresEnseignants ?? 0) + d.school.nbAutresEnseignants
    postesNecessaires += d.besoinTheorique
    if (d.postesDeclares != null) postesDeclares = (postesDeclares ?? 0) + d.postesDeclares
    excedentMobilisable += d.enseignantsMobilisables ?? d.excedentTheorique
    sallesManquantes += d.calcul.sallesManquantes
    surnombre += d.calcul.surnombre
    if (d.school.effectifTotalEleves != null) {
      effectifTotalEleves = (effectifTotalEleves ?? 0) + d.school.effectifTotalEleves
      if (d.school.nombreClassesOuvertes != null) {
        elevesAvecClasses += d.school.effectifTotalEleves
        classesAvecEleves += d.school.nombreClassesOuvertes
      }
      enseignantsAvecEleves += d.enseignantsEtat
    }
    classesMultigrades += d.school.classesMultigrades
    if (d.besoinTheorique > 0) ecolesEnDeficit++
    if (d.excedentTheorique > 0) ecolesAvecExcedent++
    if (d.besoinTheorique === 0) ecolesSatisfaisantes++
    if (d.classement === 'a_examiner') ecolesAExaminer++
  }

  // REM d'un territoire : somme des élèves ÷ somme des enseignants, jamais la moyenne des REM des écoles.
  const elevesParEnseignantEtat = ratio(effectifTotalEleves, enseignantsAvecEleves > 0 ? enseignantsAvecEleves : null)
  const elevesParClasse = ratio(elevesAvecClasses, classesAvecEleves > 0 ? classesAvecEleves : null)

  return {
    ecolesAnalysees: diagnostics.length,
    ecolesEnDeficit,
    ecolesAvecExcedent,
    ecolesSatisfaisantes,
    classes,
    enseignantsEtat,
    autresEnseignants,
    postesNecessaires,
    postesDeclares,
    excedentMobilisable,
    sallesManquantes,
    surnombre,
    ecolesAExaminer,
    effectifTotalEleves,
    elevesParEnseignantEtat: elevesParEnseignantEtat == null ? null : round2(elevesParEnseignantEtat),
    elevesParClasse: elevesParClasse == null ? null : round2(elevesParClasse),
    classesMultigrades,
  }
}

/**
 * Ordre de priorité d'attention : écoles nécessiteuses d'abord, par indice de
 * priorité u décroissant, puis REM actuel le plus élevé, puis besoin (§2.6, §3.1).
 */
export function trierParPriorite(diagnostics: SchoolDiagnostic[]): SchoolDiagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const na = a.besoinTheorique > 0 ? 1 : 0
    const nb = b.besoinTheorique > 0 ? 1 : 0
    if (nb !== na) return nb - na
    if (b.priorite.indice !== a.priorite.indice) return b.priorite.indice - a.priorite.indice
    const ra = a.calcul.remActuel ?? -1
    const rb = b.calcul.remActuel ?? -1
    if (rb !== ra) return rb - ra
    if (b.deficitAbsolu !== a.deficitAbsolu) return b.deficitAbsolu - a.deficitAbsolu
    return a.school.id.localeCompare(b.school.id)
  })
}
