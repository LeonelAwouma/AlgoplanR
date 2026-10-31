# Minimum pédagogique commun : méthode unique du besoin

AlgoPlanR calcule le besoin en enseignants d'une école avec **une seule formule**, identique pour toutes les écoles :

```
B = max(M ; max(1 ; ⌈(N − T) ÷ R⌉))
```

| Symbole | Réglage (Référentiel → Besoin d'une école) | Clé serveur (`besoin`) | Valeur de référence |
|---|---|---|---|
| M | Minimum pédagogique commun | `plancher_pedagogique` | 3 |
| R | Norme d'encadrement | `norme_eleves_par_maitre` | 60 (74,4 : REM du rapport MINEDUB) |
| T | Tolérance pédagogique | `effectif_premiere_section` | 20 |

Avec M = 3, R = 60, T = 20 : 50, 100 et 200 élèves → 3 enseignants ; 300 → 5 ; 500 → 8.

## Règles

- `De = max(Pe, M)`. `Ke = min(De, BMAX)`, `be = max(0, Ke − Ee)`, `xe = max(0, Ee − De)`. Les règles de salles (simple flux,
  double flux) sont inchangées.
- `Classes_Multigrades` et `Classes_Ouvertes` restent dans les données et les statistiques ; elles n'interviennent ni
  dans le besoin, ni dans le minimum, ni dans la fiabilité, ni dans l'excédent.
- Effectif d'élèves absent ou illisible : le besoin reste **provisoire** (minimum commun seul) et l'excédent n'alimente
  aucune sortie automatique (`xe_sur = 0`, `xe_a_verifier = xe`).
- Inchangés : âge de retraite, ancienneté minimale au poste, éligibilité individuelle, restrictions géographiques,
  faits du Prince.
- Un excédent théorique n'est pas une affectation : chaque enseignant reste soumis aux conditions individuelles.

## Enregistrement et compatibilité

- « Enregistrer » écrit M, R, T dans les paramètres du jeu, invalide le cache du diagnostic et marque les scénarios
  obsolètes. Les rapports (hypothèses du prévisionnel, feuille `Synthese` de l'export Excel) citent les valeurs utilisées.
- Les anciens réglages (`minimum_selon_multigrades`, `niveaux_par_maitre_multigrade`, `nombre_niveaux`, `groupes_secours`,
  `groupes_depuis_classes_ouvertes`, `mobiliser_excedent_incertain`) sont ignorés sans erreur dans les paramètres déjà
  enregistrés.
- Les simulations archivées ne sont pas effacées. Le marqueur `_regles_du_calcul.besoin = "minimum_commun_v1"` n'est
  inscrit que sur les résultats calculés avec cette méthode : les autres sont signalés obsolètes.

## Comparer avec une référence historique

```bash
cd backend
python outils/comparer_minimum_commun.py etablissements_national.xlsx enseignants_national.xlsx --minimum 3 --norme 60 --tolerance 20
```

Le script n'embarque aucun résultat de référence : il recalcule besoin, excédents, éligibilité individuelle, vivier et
affectations, et liste les écoles dont le besoin diffère de l'ancienne règle multigrade.
