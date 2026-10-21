/**
 * Suivi des décisions dans le tableau de planification sur cinq ans.
 *
 * Règle de référence, partagée par le générateur des données factices
 * (moteur-reference/scripts) et par les données factices elles-mêmes, que le
 * serveur Django applique de même. Les données factices n'ont pas le détail de la
 * projection (recrutements, effectif de fin, REM) que le serveur fournit en plus. Les projections (effectifs,
 * départs, besoins, vivier, quota calculé) viennent du calcul ; cette règle y
 * reporte les décisions enregistrées :
 *   - quota retenu : somme des quotas ajustés ou validés du périmètre, `null`
 *     tant qu'aucun ne l'est. Les quotas sont fixés par région : un périmètre
 *     plus fin (département, commune) n'a pas de quota retenu ;
 *   - nominations prévues / réalisées : nominations validées / mises en œuvre
 *     sur un poste du périmètre ;
 *   - déploiements prévus / réalisés : mouvements du registre (hors
 *     nominations, déjà comptées) vers une école du périmètre ;
 *   - besoin restant : besoin − ressources du vivier − quota retenu ;
 *   - effectifs : quand les recrutements des années précédentes sont supposés
 *     réalisés, l'écart entre quota retenu et quota calculé d'une année se
 *     reporte sur l'effectif des années suivantes.
 */

import type {
  AnneePlan,
  IndicateursAnnee,
  Mouvement,
  Nomination,
  QuotaRecrutement,
  SousSysteme,
} from '../components/shared/api/contrat'

/** Territoire et sous-système d'une école, pour situer une décision dans un périmètre. */
export interface LieuEcole {
  region: string
  departement: string
  commune: string
  sousSysteme: SousSysteme | null
}

/** Périmètre d'un tableau ou d'une ligne de ventilation. */
export interface PerimetreSuivi {
  region?: string | null
  departement?: string | null
  commune?: string | null
  sousSysteme?: SousSysteme | 'non_renseigne' | null
}

/** Décisions enregistrées, lues par la règle. */
export interface DecisionsSuivi {
  quotas: QuotaRecrutement[]
  nominations: Nomination[]
  mouvements: Mouvement[]
  /** Lieu de chaque école, par identifiant. */
  ecoles: Record<string, LieuEcole>
  /** Hypothèse « quotas des années précédentes recrutés ». */
  recrutementsSupposes: boolean
}

/** Vrai si un lieu appartient au périmètre. */
function dans(lieu: LieuEcole | undefined, p: PerimetreSuivi): boolean {
  if (!lieu) return false
  if (p.region && lieu.region !== p.region) return false
  if (p.departement && lieu.departement !== p.departement) return false
  if (p.commune && lieu.commune !== p.commune) return false
  if (p.sousSysteme && (lieu.sousSysteme ?? 'non_renseigne') !== p.sousSysteme) return false
  return true
}

/** Quota retenu du périmètre pour une année, `null` s'il n'est pas encore fixé. */
function quotaRetenu(annee: AnneePlan, p: PerimetreSuivi, quotas: QuotaRecrutement[]): number | null {
  if (p.departement || p.commune) return null
  const retenus = quotas.filter(
    q =>
      q.annee === annee &&
      (!p.region || q.territoire === p.region) &&
      (!p.sousSysteme || q.sousSysteme === p.sousSysteme),
  )
  if (!retenus.some(q => q.statut !== 'calcule')) return null
  return retenus.reduce((s, q) => s + q.retenu, 0)
}

/** Reporte les décisions enregistrées sur les années projetées d'un périmètre. */
export function appliquerSuivi(
  annees: IndicateursAnnee[],
  perimetre: PerimetreSuivi,
  decisions: DecisionsSuivi,
): IndicateursAnnee[] {
  const { nominations, mouvements, ecoles } = decisions
  const lieuPoste = (n: Nomination): LieuEcole => ({
    region: n.poste.region,
    departement: n.poste.departement,
    commune: n.poste.commune,
    sousSysteme: n.poste.sousSysteme,
  })
  const compterNominations = (annee: AnneePlan, statut: Nomination['statut']) =>
    nominations.filter(n => n.annee === annee && n.statut === statut && dans(lieuPoste(n), perimetre)).length
  const compterMouvements = (annee: AnneePlan, statut: Mouvement['statut']) =>
    mouvements.filter(
      m =>
        m.type !== 'nomination' &&
        m.annee === annee &&
        m.statut === statut &&
        dans(ecoles[m.destination.id], perimetre),
    ).length

  let ecartReporte = 0
  return annees.map(a => {
    const retenu = quotaRetenu(a.annee, perimetre, decisions.quotas)
    const ligne: IndicateursAnnee = {
      ...a,
      effectifDebut: Math.max(0, a.effectifDebut + ecartReporte),
      quotaRetenu: retenu,
      nominationsPrevues: compterNominations(a.annee, 'validee'),
      nominationsRealisees: compterNominations(a.annee, 'mise_en_oeuvre'),
      deploiementsPrevus: compterMouvements(a.annee, 'prevu'),
      deploiementsRealises: compterMouvements(a.annee, 'realise'),
      besoinRestant: Math.max(0, a.besoin - a.ressourcesVivier - (retenu ?? 0)),
    }
    if (decisions.recrutementsSupposes && retenu !== null) ecartReporte += retenu - a.quotaCalcule
    return ligne
  })
}
