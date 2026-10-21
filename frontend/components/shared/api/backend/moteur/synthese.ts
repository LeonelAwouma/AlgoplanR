/**
 * Agrégation territoriale, besoin résiduel, recrutement à prévoir et degré
 * d'aléa (référentiel §2.5 et §2.6).
 *
 * Les résultats des écoles sont additionnés séparément pour chaque sous-système.
 * L'écrêtage à zéro étant appliqué école par école avant l'addition, l'excédent
 * d'une école n'annule pas le déficit d'une autre ; et l'excédent francophone
 * d'un territoire ne couvre pas son besoin anglophone, ni l'inverse :
 *
 *   C_T   = Σ_s min(B_T,s ; X_T,s)               couvrable par redéploiement
 *   R_T   = Σ_s max(0 ; B_T,s − X_T,s)           besoin restant
 *   REC_T = Σ_s R_T,s + attrition(E_T,s)        recrutement à prévoir ; l'attrition est celle des hypothèses de
 *                                               planification, arrondie à l'entier le plus proche comme le serveur
 *   aléa  = (B_T + X_T) ÷ Σ K                    part de la dotation mal répartie
 */

import type { SchoolDiagnostic } from '../../contrat'
import type { AgregatSousSysteme, SyntheseTerritoriale } from '../../contrat'
import { departsAttrition, type EffectifEcole, type HypotheseAttrition } from './attrition'
import { round4 } from './nombres'

/**
 * @param effectifs effectif E par école après un plan ; à défaut, l'effectif retenu
 *                  du diagnostic. Cible K et dotation D ne changent pas.
 */
export function syntheseTerritoriale(
  diagnostics: SchoolDiagnostic[],
  attrition: HypotheseAttrition,
  effectifs?: Map<string, number>,
): SyntheseTerritoriale {
  const groupes = new Map<AgregatSousSysteme['sousSysteme'], AgregatSousSysteme>()
  const ecolesDuGroupe = new Map<AgregatSousSysteme['sousSysteme'], EffectifEcole[]>()

  for (const d of diagnostics) {
    const cle = d.school.sousSysteme ?? 'non_renseigne'
    const g = groupes.get(cle) ?? {
      sousSysteme: cle,
      besoin: 0,
      excedent: 0,
      sallesManquantes: 0,
      couvrable: 0,
      restant: 0,
      effectif: 0,
      recrutementAPrevoir: 0,
      sommeCibles: 0,
    }
    const E = effectifs?.get(d.school.id) ?? d.calcul.enseignantsRetenus
    g.besoin += Math.max(0, d.calcul.cible - E)
    g.excedent += Math.max(0, E - d.calcul.dotation)
    g.sallesManquantes += d.calcul.sallesManquantes
    g.effectif += E
    g.sommeCibles += d.calcul.cible
    groupes.set(cle, g)
    const ecoles = ecolesDuGroupe.get(cle) ?? []
    ecoles.push({ region: d.school.region, sousSysteme: d.school.sousSysteme ?? null, effectif: E })
    ecolesDuGroupe.set(cle, ecoles)
  }

  const parSousSysteme = [...groupes.values()].map(g => {
    const couvrable = Math.min(g.besoin, g.excedent)
    const restant = Math.max(0, g.besoin - g.excedent)
    const departs = departsAttrition(attrition, ecolesDuGroupe.get(g.sousSysteme) ?? [], g.effectif)
    return { ...g, couvrable, restant, recrutementAPrevoir: restant + departs }
  })
  parSousSysteme.sort((a, b) => a.sousSysteme.localeCompare(b.sousSysteme))

  const somme = (cle: keyof Omit<AgregatSousSysteme, 'sousSysteme'>) => parSousSysteme.reduce((a, g) => a + g[cle], 0)
  const sommeCibles = somme('sommeCibles')
  const besoin = somme('besoin')
  const excedent = somme('excedent')

  return {
    parSousSysteme,
    besoin,
    excedent,
    sallesManquantes: somme('sallesManquantes'),
    couvrable: somme('couvrable'),
    restant: somme('restant'),
    recrutementAPrevoir: somme('recrutementAPrevoir'),
    degreAlea: sommeCibles > 0 ? round4((besoin + excedent) / sommeCibles) : null,
  }
}

export const LIBELLE_SOUS_SYSTEME: Record<AgregatSousSysteme['sousSysteme'], string> = {
  francophone: 'Francophone',
  anglophone: 'Anglophone',
  non_renseigne: 'Sous-système non renseigné',
}
