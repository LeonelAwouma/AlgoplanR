/**
 * Tous les gestionnaires des données factices, dans l'ordre de priorité : les
 * gestionnaires dédiés d'abord, les génériques (catalogue en lecture, refus en
 * écriture) en dernier.
 */

import { gestionnairesDecisions } from './decisions'
import { gestionnairesDonnees } from './donnees'
import { gestionnairesGeneriques } from './generique'
import { gestionnairesNominations } from './nominations'
import { gestionnairesPlanification } from './planification'

export const gestionnaires = [
  ...gestionnairesDonnees,
  ...gestionnairesDecisions,
  ...gestionnairesPlanification,
  ...gestionnairesNominations,
  ...gestionnairesGeneriques,
]
