/**
 * Contrat de l'API — fait de Prince : redéploiement d'un enseignant décidé par
 * la DRH, en dehors de l'algorithme.
 *
 * Ce n'est pas une proposition de simulation : c'est une décision. Elle est
 * appliquée sans aucun des contrôles de l'algorithme (ancienneté, âge, statut,
 * besoin de l'école de destination, excédent de l'école d'origine, périmètre
 * géographique). Une fois appliquée, elle devient un fait acquis dont
 * l'algorithme tient compte dans tous ses calculs : l'enseignant est rattaché à
 * sa nouvelle école et n'est plus jamais remis en mouvement, et les effectifs des
 * deux écoles sont mis à jour avant le calcul des besoins et des excédents.
 */

/** Un établissement, figé à la date de la décision pour rester lisible si les données changent. */
export interface LieuPrince {
  id: string
  nom: string
  commune: string
  departement: string
  region: string
}

/** Une décision enregistrée. */
export interface FaitPrince {
  id: string
  /** Matricule de l'enseignant redéployé. */
  teacherId: string
  /** Code de l'établissement de destination. */
  schoolDestinationId: string
  /** Référence de la décision (note de service, courrier…), facultative. */
  reference: string
  /** Date de la décision, au format ISO. */
  decideLe: string
  /** Nom de l'enseignant, figé à la date de la décision. */
  enseignant: string
  origine: LieuPrince
  destination: LieuPrince
}

/**
 * Sort d'une décision au regard des données actuellement chargées : une décision
 * peut viser un enseignant ou une école absents du fichier importé.
 */
export type StatutFaitPrince = 'applique' | 'enseignant_introuvable' | 'ecole_introuvable' | 'meme_ecole' | 'doublon'

export interface FaitPrinceApplique {
  fait: FaitPrince
  statut: StatutFaitPrince
  /** Explication en clair du statut. */
  motif: string
}

/** Effet d'un redéploiement sur les effectifs d'une école. */
export interface ImpactEcolePrince {
  nom: string
  effectifAvant: number
  effectifApres: number
  besoinAvant: number
  besoinApres: number
  excedentAvant: number
  excedentApres: number
}

/** Conséquences prévisibles d'un fait de Prince, montrées avant de le valider. */
export interface ImpactPrince {
  /** `null` quand l'école de rattachement de l'enseignant est absente des données. */
  origine: ImpactEcolePrince | null
  destination: ImpactEcolePrince
  /** Observations factuelles : ce que l'algorithme n'aurait pas fait, ou ce que la décision provoque. */
  observations: string[]
}
