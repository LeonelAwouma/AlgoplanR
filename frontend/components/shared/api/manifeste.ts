/**
 * Manifeste des routes de l'API, tel que fixé par les documents de conception :
 *   - docs/Plan-backend-Django-DDD.docx (section 5, routes des fonctions actuelles) ;
 *   - docs/Routes-planification-5-ans.md (sections 4 et 7, nouvelles fonctions).
 *
 * C'est la liste de référence : le test de couverture vérifie que chaque route
 * listée ici est appelée par une fonction d'infrastructure, et qu'aucune
 * fonction n'appelle une route absente de cette liste. Ajouter une route au
 * backend commence donc par l'ajouter ici.
 */

import type { MethodeHttp } from './routes'

type Entree = readonly [MethodeHttp, string]

/** Routes groupées par contexte, chemins relatifs au préfixe `/api/v1/`. */
export const MANIFESTE_ROUTES = {
  systeme: [['GET', 'sante/']],

  parametrage: [
    ['GET', 'parametres/defaut/'],
    ['GET', 'jeux/{jeu}/parametres/'],
    ['PUT', 'jeux/{jeu}/parametres/'],
    ['PATCH', 'jeux/{jeu}/parametres/'],
    ['POST', 'jeux/{jeu}/parametres/import/'],
    ['GET', 'jeux/{jeu}/situations-familiales/'],
  ],

  donnees: [
    // Ajoutée lors de la migration de l'assistant d'import : dictionnaire des colonnes attendues.
    ['GET', 'fichiers/colonnes/'],
    ['POST', 'fichiers/'],
    ['PATCH', 'fichiers/{fichier}/correspondances/'],
    ['GET', 'jeux/'],
    ['POST', 'jeux/'],
    ['POST', 'jeux/demonstration/'],
    ['GET', 'jeux/{jeu}/'],
    ['DELETE', 'jeux/{jeu}/'],
    ['GET', 'jeux/{jeu}/qualite/'],
    ['GET', 'jeux/{jeu}/validation/'],
    ['POST', 'jeux/{jeu}/validation/'],
    ['GET', 'jeux/{jeu}/actualisations/'],
    ['POST', 'jeux/{jeu}/actualisations/'],
    ['GET', 'jeux/{jeu}/actualisations/{actualisation}/ecarts/'],
    ['GET', 'jeux/{jeu}/etablissements/'],
    ['GET', 'jeux/{jeu}/etablissements/{ecole}/'],
    ['GET', 'jeux/{jeu}/enseignants/'],
    ['GET', 'jeux/{jeu}/enseignants/{matricule}/'],
    ['GET', 'jeux/{jeu}/recherche/enseignants/'],
    ['GET', 'jeux/{jeu}/recherche/etablissements/'],
  ],

  diagnostic: [
    ['GET', 'jeux/{jeu}/diagnostic/'],
    ['GET', 'jeux/{jeu}/territoires/'],
    ['GET', 'jeux/{jeu}/territoires/options/'],
    ['GET', 'jeux/{jeu}/priorites/'],
    ['GET', 'jeux/{jeu}/synthese/'],
  ],

  prince: [
    ['GET', 'jeux/{jeu}/faits-prince/'],
    ['POST', 'jeux/{jeu}/faits-prince/'],
    ['POST', 'jeux/{jeu}/faits-prince/impact/'],
    ['POST', 'jeux/{jeu}/faits-prince/import/'],
    ['DELETE', 'jeux/{jeu}/faits-prince/{fait}/'],
  ],

  simulation: [
    ['GET', 'scenarios/presets/'],
    ['GET', 'jeux/{jeu}/scenarios/'],
    ['POST', 'jeux/{jeu}/scenarios/'],
    ['POST', 'jeux/{jeu}/scenarios/base/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/'],
    ['DELETE', 'jeux/{jeu}/scenarios/{scenario}/'],
    ['POST', 'jeux/{jeu}/scenarios/{scenario}/executer/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/resultat/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/affectations/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/affectations/{matricule}/explication/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/non-affectes/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/vivier/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/postes/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/postes-non-couverts/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/candidatures/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/combinaisons/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/journal/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/invariants/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/projections/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/recrutes/'],
    ['GET', 'jeux/{jeu}/scenarios/{scenario}/flux/'],
    ['GET', 'jeux/{jeu}/comparaison/'],
    ['PUT', 'jeux/{jeu}/scenario-retenu/'],
  ],

  arbitrage: [
    ['GET', 'jeux/{jeu}/arbitrages/'],
    ['POST', 'jeux/{jeu}/arbitrages/'],
    ['DELETE', 'jeux/{jeu}/arbitrages/{arbitrage}/'],
  ],

  recrutement: [
    ['GET', 'jeux/{jeu}/recrues/'],
    ['DELETE', 'jeux/{jeu}/recrues/'],
    ['POST', 'jeux/{jeu}/recrues/import/'],
  ],

  rapports: [['GET', 'jeux/{jeu}/rapport/']],

  planification: [
    ['GET', 'hypotheses/defaut/'],
    ['GET', 'jeux/{jeu}/hypotheses/'],
    ['PUT', 'jeux/{jeu}/hypotheses/'],
    ['GET', 'jeux/{jeu}/hypotheses/documentation/'],
    ['GET', 'jeux/{jeu}/hypotheses/historique/'],
    ['POST', 'jeux/{jeu}/hypotheses/attrition/estimer/'],
    ['GET', 'jeux/{jeu}/planification/'],
    ['GET', 'jeux/{jeu}/planification/territoires/'],
    ['GET', 'jeux/{jeu}/planification/sous-systemes/'],
    ['GET', 'jeux/{jeu}/planification/ecoles/'],
    ['GET', 'jeux/{jeu}/planification/departs/'],
    ['GET', 'jeux/{jeu}/planification/fiabilite/'],
    ['GET', 'jeux/{jeu}/planification/etat/'],
    ['POST', 'jeux/{jeu}/planification/recalculer/'],
    ['GET', 'jeux/{jeu}/planification/versions/'],
    ['GET', 'jeux/{jeu}/planification/versions/{version}/'],
    ['GET', 'jeux/{jeu}/planification/versions/comparer/'],
    ['GET', 'jeux/{jeu}/quotas/'],
    ['PUT', 'jeux/{jeu}/quotas/{annee}/{territoire}/'],
    ['POST', 'jeux/{jeu}/quotas/valider/'],
    ['GET', 'jeux/{jeu}/quotas/historique/'],
    ['GET', 'jeux/{jeu}/indicateurs/'],
    ['GET', 'jeux/{jeu}/indicateurs/evolution/'],
  ],

  nominations: [
    ['GET', 'jeux/{jeu}/vivier/'],
    ['POST', 'jeux/{jeu}/vivier/import/'],
    ['GET', 'jeux/{jeu}/vivier/{personne}/'],
    ['GET', 'jeux/{jeu}/vivier/{personne}/postes-compatibles/'],
    ['GET', 'jeux/{jeu}/postes-ouverts/'],
    ['GET', 'jeux/{jeu}/postes-ouverts/{poste}/candidats/'],
    ['GET', 'jeux/{jeu}/nominations/'],
    ['POST', 'jeux/{jeu}/nominations/'],
    ['POST', 'jeux/{jeu}/nominations/generer/'],
    ['POST', 'jeux/{jeu}/nominations/lot/'],
    ['POST', 'jeux/{jeu}/nominations/import/'],
    ['GET', 'jeux/{jeu}/nominations/synthese/'],
    ['GET', 'jeux/{jeu}/nominations/{nomination}/'],
    ['POST', 'jeux/{jeu}/nominations/{nomination}/valider/'],
    ['POST', 'jeux/{jeu}/nominations/{nomination}/rejeter/'],
    ['POST', 'jeux/{jeu}/nominations/{nomination}/mettre-en-oeuvre/'],
    ['POST', 'jeux/{jeu}/nominations/{nomination}/annuler/'],
    ['GET', 'jeux/{jeu}/mouvements/'],
    ['GET', 'jeux/{jeu}/mouvements/controles/'],
    ['GET', 'jeux/{jeu}/mouvements/{mouvement}/'],
    ['POST', 'jeux/{jeu}/mouvements/{mouvement}/mettre-en-oeuvre/'],
    ['GET', 'jeux/{jeu}/personnes/{matricule}/mouvements/'],
  ],

  audit: [
    ['GET', 'jeux/{jeu}/journal-audit/'],
    ['GET', 'jeux/{jeu}/journal-audit/{evenement}/'],
  ],
} as const satisfies Record<string, readonly Entree[]>

/** Toutes les routes du manifeste, à plat, sous la forme `MÉTHODE gabarit`. */
export function routesDuManifeste(): string[] {
  return Object.values(MANIFESTE_ROUTES).flatMap(groupe => groupe.map(([methode, gabarit]) => `${methode} ${gabarit}`))
}
