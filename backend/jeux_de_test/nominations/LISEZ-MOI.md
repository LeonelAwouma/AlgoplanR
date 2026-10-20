# Jeu de test « nominations »

Jeu fictif complet : les deux fichiers de base que l'application traite déjà (établissements, enseignants), les
entrées des contextes recrutement et Prince, des personnes venues d'autres sources, et un fichier de décisions de
nomination avec des cas valides et des refus voulus.

Tout est en `.xlsx` (pas de CSV : un CSV « UTF-8 avec BOM » exporté par Excel casse la première colonne à l'import).
`generer.py` régénère les fichiers ; `backend/tests/test_jeu_nominations.py` vérifie tous les chiffres ci-dessous
contre le moteur.

## Ordre d'import

| # | Fichier | Où | Résultat attendu |
|---|---------|----|------------------|
| 1 | `etablissements.xlsx` + `enseignants.xlsx` | création du jeu | 40 écoles, 300 enseignants, 0 erreur, 3 avertissements : 18 retraités exclus, 19 motifs de demande sans école citée, 39 écoles sur 40 dont l'effectif déclaré diffère des matricules rattachés (effectifs fictifs indépendants des matricules) |
| 2 | — | scénario retenu | **départemental** (`geo_departement`) |
| 3 | `recrues.xlsx` | recrues | 8 acceptées, 2 refusées |
| 4 | `faits_prince.xlsx` | faits du Prince | 2 acceptés, 3 refusés |
| 5 | `vivier_reintegration.xlsx` (source *reintegration*) | vivier | 4 ajoutées, 2 refusées |
| 6 | `vivier_disponibilite.xlsx` (source *disponibilite*) | vivier | 3 ajoutées |
| 7 | `vivier_fin_detachement.xlsx` (source *fin_detachement*) | vivier | 2 ajoutées |
| 8 | `vivier_autre.xlsx` (source *autre*) | vivier | 2 ajoutées (sans matricule) |
| 9 | — | hypothèses → vivier | cocher les 6 sources, sinon les personnes importées restent invisibles |
| 10 | `nominations.xlsx` | nominations → import | **6 importées, 9 refusées** |

Le jeu doit être importé en tant que DRH (jeu national). Les fichiers 3 à 8 contiennent plusieurs régions.

## Ce que contient chaque fichier

**Écoles** : jeu de démonstration (graine 2026) où quatre écoles sont sous-dotées pour créer des postes ouverts :
ECO011 (Yaoundé 1, francophone), ECO025 et ECO039 (Yaoundé 1, anglophones), ECO014 (Monatele).

**Recrues** : 3 francophones (rangs 1 à 3) et 5 anglophones (rangs 4 à 8) pour 4 postes anglophones : LAU-008 reste
sans poste et entre au vivier comme lauréat. Refus : identifiant manquant, doublon `LAU-003`.

**Faits du Prince** : MAT00229 → ECO011 et MAT00094 → ECO014 acceptés. Refus : matricule inconnu (MAT99999), école
inconnue (ECO999), enseignant déjà rattaché à l'école de destination (MAT00001 → ECO019). Seules les impossibilités
matérielles sont refusées : un enseignant « non mobilisable » (école d'attache non excédentaire, ancienneté faible, hors
vivier) est accepté avec des alertes, car un fait du Prince peut créer un déficit comme un excédent.

**Vivier** : réintégrations REI-0001 à REI-0004 (un refus pour nom manquant, un pour matricule déjà au vivier),
disponibilités DIS-0001 à 0003, fins de détachement DET-0001 et 0002, deux personnes « autre » sans matricule.

## État attendu avant import des nominations

- **Vivier : 30 personnes** : 18 excédentaires, 1 lauréat sans poste (`laureat-LAU-008`), 4 réintégrations,
  3 disponibilités, 2 fins de détachement, 2 autres.
- **Postes ouverts : 11**, tous libres : 9 en zone verte (ECO012_P2 à P5, ECO008_P2 à P4, ECO011_P3 et P4) et 2 en
  zone rouge (ECO040_P4, ECO026_P2). Aucun poste anglophone ne reste : les lauréats les ont pris.
- **Registre** : faits du Prince, redéploiements et déploiements de recrues sont présents, sans nomination.

## `nominations.xlsx` : 15 lignes

| Ligne | Matricule | Poste | Statut | Résultat |
|-------|-----------|-------|--------|----------|
| 2 | MAT00207 | ECO012_P2 | MISE_EN_OEUVRE | importée, poste *pourvu* |
| 3 | MAT00159 | ECO012_P3 | VALIDEE | importée, poste *réservé* |
| 4 | MAT00273 | ECO008_P2 | PROPOSEE | importée |
| 5 | REI-0001 | ECO011_P3 | VALIDEE | importée (personne d'une autre source) |
| 6 | DET-0001 | école ECO012 | VALIDEE | importée, résolue sur ECO012_P4 (première école libre) |
| 7 | MAT00067 | ECO008_P2 | PROPOSEE | importée : concurrente de la ligne 4 |
| 8 | MAT99998 | ECO008_P3 | VALIDEE | refusée : n'est pas dans le vivier |
| 9 | MAT00087 | ECO777_P1 | VALIDEE | refusée : aucun poste ouvert correspondant |
| 10 | MAT00253 | ECO008_P3 | REJETEE | refusée : statut non importable |
| 11 | MAT00207 | ECO008_P4 | VALIDEE | refusée : personne déjà engagée |
| 12 | MAT00017 | ECO012_P2 | VALIDEE | refusée : poste déjà réservé ou pourvu |
| 13 | MAT00179 | ECO040_P4 | VALIDEE | refusée : zone rouge, volontariat requis |
| 14 | MAT00068 | ECO008_P3 | VALIDEE | refusée : anglophone sur un poste francophone |
| 15 | MAT00023 | ECO008_P3 | VALIDEE | refusée : année N+9 hors plan |
| 16 | *(vide)* | ECO008_P4 | VALIDEE | refusée : matricule vide |

Après l'import : 6 nominations (1 mise en œuvre, 3 validées, 2 proposées) et 4 mouvements de type nomination dont 1
réalisé.

## Parcours à dérouler ensuite

1. **Concurrence** : valider la nomination de MAT00273 sur ECO008_P2 → celle de MAT00067 sur le même poste est
   refusée (409, poste déjà réservé).
2. **Mise en œuvre** : réaliser le mouvement de REI-0001 (date d'effet + référence d'acte) ; la nomination devient
   définitive et ne peut plus être annulée.
3. **Génération automatique** (N+1) sur un jeu sans import de nominations : 9 propositions, jamais sur une zone
   rouge ni sur un poste d'un autre sous-système ; 2 postes restent sans candidat.
4. **Contrôles** : le registre des mouvements ne doit signaler aucun double comptage.
5. **Rejet / annulation** : rejeter une proposition sans motif → refusé (motif obligatoire).
