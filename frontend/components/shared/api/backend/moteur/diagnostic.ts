/**
 * Diagnostic d'une école : sévérité, raisons de priorisation et ordre de priorité. Repris du moteur de référence
 * (moteur-reference/lib/analytics/diagnostic.ts) : les grandeurs de base
 * (dotation, besoin, excédent…) viennent du backend, seules ces lectures sont
 * refaites côté interface.
 */

import { MESSAGE_MINIMUM_SANS_EFFET, MESSAGE_MULTIGRADES_NON_RENSEIGNES } from '../../../kernel/libelles'
import type { DiagnosticReason, EngineSettings, SchoolDiagnostic, SchoolSeverity } from '../../contrat'

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
      texte: `Taux d’encadrement actuel de ${fr(c.remActuel)} élèves par enseignant, au-dessus de la norme de ${fr(Math.round(c.remActuel / d.pressionPedagogique))}.`,
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

  // Mode « non renseigné » : la phrase destinée à l'utilisateur, jamais une formule à sa place.
  // Un minimum provisoire sans effet sur le besoin final (fixé par les élèves ou les salles) est dit comme tel.
  if (c.minimumProvisoire) {
    raisons.push({
      code: 'besoin_provisoire',
      texte:
        c.statutBesoin === 'confirme'
          ? `${MESSAGE_MULTIGRADES_NON_RENSEIGNES} ${MESSAGE_MINIMUM_SANS_EFFET}`
          : MESSAGE_MULTIGRADES_NON_RENSEIGNES,
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

/**
 * Ordre de priorité d'attention : celui du serveur (rang d'accueil : poids du poste décroissant, écoles avant
 * structures, puis REM le plus élevé). Les écoles sans besoin suivent, par poids du poste puis identifiant. Aucune règle
 * de classement n'est recopiée ici : deux classements différents donneraient deux ordres à l'écran.
 */
export function trierParPriorite(diagnostics: SchoolDiagnostic[]): SchoolDiagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const ra = a.priorite.rang
    const rb = b.priorite.rang
    if (ra !== null && rb !== null) return ra - rb
    if (ra !== null) return -1
    if (rb !== null) return 1
    if (b.priorite.indice !== a.priorite.indice) return b.priorite.indice - a.priorite.indice
    return a.school.id.localeCompare(b.school.id)
  })
}
