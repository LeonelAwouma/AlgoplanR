/**
 * Présentation des indicateurs du tableau de planification sur cinq ans
 * (mémo de synthèse, §2.1) : ordre d'affichage, libellés et définitions.
 * Les valeurs sont calculées par le serveur.
 */

import type { CleIndicateurPlan, FiabiliteIndicateur } from '../../shared/api'

/** Indicateur numérique d'une année du tableau (hors détail de la projection, qui a son propre onglet). */
export type CleIndicateur = CleIndicateurPlan

/** Une ligne du tableau : l'indicateur, son libellé et ce qu'il mesure. */
export interface LigneIndicateur {
  cle: CleIndicateur
  libelle: string
  definition: string
  /** Mise en évidence des lignes de synthèse (besoin, quota, besoin restant). */
  forte?: boolean
}

/** Lignes du tableau, dans l'ordre du mémo. */
export const LIGNES_INDICATEURS: readonly LigneIndicateur[] = [
  {
    cle: 'effectifDebut',
    libelle: 'Effectif disponible en début de période',
    definition:
      'Enseignants en poste à la rentrée, après les mouvements retenus ; dès N+2, recrutements de l’année précédente inclus si l’hypothèse est active.',
  },
  {
    cle: 'departsRetraite',
    libelle: 'Départs à la retraite',
    definition: 'Enseignants qui atteignent l’âge légal pendant l’année.',
  },
  {
    cle: 'departsAttrition',
    libelle: 'Départs par attrition',
    definition: 'Départs hors retraite estimés selon le taux d’attrition retenu.',
  },
  {
    cle: 'besoin',
    libelle: 'Besoin prévisionnel',
    definition: 'Somme, école par école, des maîtres manquants pour atteindre la cible K.',
    forte: true,
  },
  {
    cle: 'ressourcesVivier',
    libelle: 'Ressources mobilisables depuis le vivier',
    definition: 'Excédents mobilisables et personnes du vivier encore libres.',
  },
  {
    cle: 'quotaCalcule',
    libelle: 'Quota de recrutement calculé',
    definition: 'Besoin non couvert par les ressources du vivier.',
  },
  {
    cle: 'quotaRetenu',
    libelle: 'Quota de recrutement retenu',
    definition: 'Quota fixé par ajustement ou validation (page « Quotas »), par région ; « à fixer » sinon.',
    forte: true,
  },
  {
    cle: 'nominationsPrevues',
    libelle: 'Nominations prévues',
    definition: 'Nominations validées, non encore mises en œuvre.',
  },
  { cle: 'nominationsRealisees', libelle: 'Nominations réalisées', definition: 'Nominations mises en œuvre.' },
  {
    cle: 'deploiementsPrevus',
    libelle: 'Déploiements prévus',
    definition: 'Redéploiements, faits du Prince et recrues inscrits au registre, non encore réalisés.',
  },
  {
    cle: 'deploiementsRealises',
    libelle: 'Déploiements réalisés',
    definition: 'Mouvements du registre effectivement mis en œuvre.',
  },
  {
    cle: 'besoinRestant',
    libelle: 'Besoin restant à couvrir',
    definition: 'Besoin après mobilisation du vivier et du quota retenu.',
    forte: true,
  },
]

/** Libellé d'un indicateur. */
export function libelleIndicateur(cle: CleIndicateur): string {
  return LIGNES_INDICATEURS.find(l => l.cle === cle)?.libelle ?? cle
}

/**
 * Texte d'une valeur absente : un quota retenu pas encore fixé est « à fixer »,
 * toute autre valeur manquante « — ».
 */
export function valeurAbsente(cle: CleIndicateur): string {
  return cle === 'quotaRetenu' ? 'à fixer' : '—'
}

/** Libellé du niveau de fiabilité d'un indicateur. */
export const LIBELLE_FIABILITE: Record<FiabiliteIndicateur['niveau'], string> = {
  bonne: 'Fiable',
  partielle: 'Données partielles',
  faible: 'Peu fiable',
}
