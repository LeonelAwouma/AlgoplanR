# Décisions métier en attente de validation

## C3 — composante matrimoniale du barème (règle v2) — **EN ATTENTE DE VALIDATION MÉTIER**

**Statut : implémentée techniquement, NON approuvée officiellement.** Ne pas l'utiliser pour une décision officielle
tant que la validation administrative n'est pas obtenue.

| Situation déclarée | Avant (règle d'origine, v1) | Maintenant (v2) |
|---|---|---|
| « Célibataire » (explicite) | 10 points | 10 points |
| Marié(e) | 5 | 5 |
| Divorcé(e) | 8 | 8 |
| Veuf(ve) | 8 | 8 |
| **Vide, absente ou non reconnue** (« séparé(e) », « union libre », « N/A »…) | **10 points** (assimilée à « célibataire ») | **0 point** |

Les autres composantes de C3 (−2 points par enfant) sont inchangées. Une situation vide ou non reconnue génère
l'avertissement de qualité `ENS_SITUATION_ABSENTE_OU_INCONNUE`.

### Impact mesuré (jeu synthétique, 900 enseignants, poids C3 = 0,2)

| Situations vides + non reconnues | Enseignants concernés | Baisse de barème | Rangs modifiés (cascade) | Affectations différentes (sur 55) |
|---|---|---|---|---|
| 0 % | 0 | — | 0 | 0 |
| 5 % + 2 % | 45 (5,5 %) | **−2,0 point** chacun | 67 % | 2 |
| 10 % + 3 % | 107 (13,0 %) | −2,0 | 89 % | 2 |
| 20 % + 5 % | 217 (26,4 %) | −2,0 | 97 % | 0 |

Lecture : chaque enseignant concerné perd exactement 10 × 0,2 = 2,0 point. Le barème total est dominé par C1 (de l'ordre de
plusieurs centaines de points), donc peu d'affectations changent ; en revanche le **rang** de nombreux enseignants se
décale (un décalage en entraîne d'autres). Sur le fichier national réaliste de recette, toutes les situations sont
renseignées : impact nul. L'impact réel dépend de la qualité des fichiers de l'administration.

### Mécanisme et conséquences
- Les scénarios calculés sous l'ancienne règle sont marqués **obsolètes** (mécanisme existant) ; « Calculer » les
  recalcule. Les décisions déjà validées (nominations, arbitrages) ne sont **jamais modifiées rétroactivement** ; seules
  les nouvelles décisions exigent un scénario à jour.
- Retour à l'ancienne règle : `REGLE_SITUATION_VERSION` et `points_situation` dans `backend/domaine/mobilite/bareme.py`.

## Autres points à trancher
- Aléa calculé sur tous les enseignants déclarés (le rapport de référence le calcule sur les enseignants payés par l'État).
- Taux d'encadrement projeté « Non disponible » dès N+2 quand des écoles ont un effectif d'élèves inconnu.

## Projections sur 5 ans (PR #7) — **EN ATTENTE DE VALIDATION MÉTIER**

Les règles ci-dessous sont implémentées et testées, mais aucune n'est approuvée officiellement.

| Réf. | Sujet | Règle en vigueur | Ce qui reste à trancher |
|---|---|---|---|
| D1 | Plancher des retraites face au plafond | Q = max(min(B ; P) ; R) : le remplacement des retraites peut dépasser le plafond. La règle alternative Q' = min(max(B ; R) ; P) est affichée à côté, jamais appliquée. Le dépassement est signalé (« validation administrative ou budgétaire »). | Le plancher peut-il dépasser le plafond ? |
| D2 | Année de mesure des âges | Date réelle si elle est précisée dans les hypothèses ; sinon âges supposés mesurés au début de N+1, retraites **provisoires**, avertissement affiché. | Année de mesure des âges du fichier national. |
| D3 | 59 ans à la rentrée | Âge légal atteint dans l'année : départ à la rentrée suivante, règle conservée et signalée. | Confirmer le traitement des agents qui atteignent 60 ans entre deux rentrées. |
| D4 | Sens de l'année d'un jeu | Anciens jeux : calendrier historique conservé (année = rentrée préparée, base = année précédente), sens tracé (`sens_annee_origine`). Jeux ambigus : « non confirmé », avertissement, jamais d'année réelle inventée. Nouveaux jeux : sens enregistré explicitement (par défaut : année des données). | Confirmer ou corriger le sens des jeux « non confirmés » (action journalisée, projections marquées à recalculer). |
| D5 | Qualification des valeurs | Observé, projeté, hypothèse, décision enregistrée, réalisé, conditionnel, non disponible. | Valider le vocabulaire. |
| D6 | Stock déclaré et liste nominative discordants | Retraites bornées au stock restant de l'école ; excédent « non imputable », visible, non remplacé. Le bornage est une protection arithmétique, pas une preuve de concordance. | Méthode à retenir (bornage actuel, proratisation, ou liste nominative comme stock). |
| D7 | Import sans fichier nominatif | L'import exige un fichier des enseignants non vide (erreur bloquante). Un jeu sans fichier nominatif ne peut donc être créé que par programme ; ses retraites sont « non calculables » (jamais zéro, jamais le taux de 1,08 %). | Autoriser l'import de la base nationale sans fichier nominatif, avec avertissement ? |
