/**
 * Textes d'explication des scénarios et des propositions, repris du
 * référentiel technique (§3.4 à §3.10). Ce sont des choix de présentation :
 * ils décrivent ce que le serveur a appliqué, sans rien recalculer.
 */

import type { GeographicScope, NatureMouvement, ProximityLevel } from '../../shared/api'

/** Niveaux de proximité, du plus proche au plus lointain. */
export const NIVEAUX_PROXIMITE: readonly ProximityLevel[] = [
  'meme_commune',
  'meme_iaeb',
  'meme_departement',
  'meme_region',
  'hors_region',
]

/** Ordre des mouvements selon le périmètre du scénario. */
export const EXPLICATION_PERIMETRE: Record<GeographicScope, string> = {
  commune:
    'Chaque enseignant reste dans sa commune : vœux, solutions proches et redéploiements obligatoires y sont limités.',
  departement:
    'Les vœux sont satisfaits par acceptation différée, puis les demandes non satisfaites reçoivent la solution la plus proche, puis les écoles restées non couvertes un redéploiement obligatoire, sans quitter le département.',
  etendu:
    'Niveau régional d’abord, puis niveau central pour les vœux interrégionaux et les besoins qu’aucune école de la région ne peut couvrir.',
}

/** Ce que signifie une proposition, selon sa nature. */
export const EXPLICATION_NATURE: Record<NatureMouvement, string> = {
  voeu: "Vœu satisfait par l'acceptation différée : le poste a retenu les candidats de plus fort score d'appariement Score(e, p), puis, à score égal, la plus grande ancienneté générale, l'âge et le rang de tirage.",
  hors_voeux:
    "Aucun vœu n'a pu être satisfait : poste ouvert le plus proche des écoles demandées, hors zone rouge, soumis à l'accord de l'enseignant ou à la décision de la commission.",
  obligatoire:
    "École restée non couverte après les vœux et les solutions proches : un maître de l'école excédentaire la plus proche du même sous-système est proposé, dans l'ordre du barème individuel de son école.",
  arbitrage: 'Affectation décidée par une commission d’arbitrage, consignée avec son motif et son instance.',
}

/** Libellé du total du score, selon la nature de la proposition. */
export function libelleTotalScore(nature: NatureMouvement): string {
  if (nature === 'obligatoire') return 'Barème individuel'
  if (nature === 'arbitrage') return 'Décision'
  return 'Score de priorité S'
}
