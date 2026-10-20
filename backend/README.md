# AlgoPlanR — Backend Django (DDD)

Moteur d'affectation des enseignants (MINEDUB / PAREC) exposé en API REST. La logique métier est celle de
`app_algoplanr.py` (v2.1), portée en Python pur ; les routes suivent le plan « Plan-backend-Django-DDD ».

## Démarrage

```bash
python -m venv .venv && source .venv/bin/activate        # Python 3.12+ (testé 3.14)
pip install -r requirements.txt pytest pytest-django
python manage.py migrate
ALGOPLANR_DEBUG=1 python -m algoplanr.serveur --port 8000  # ou : python manage.py runserver
pytest                                                      # parité, parcours API, sécurité des accès
```
Swagger : `http://127.0.0.1:8000/api/v1/docs/` — contrat OpenAPI : `/api/v1/schema/`
(types TypeScript : `npx openapi-typescript http://127.0.0.1:8000/api/v1/schema/ -o src/shared/api/schema.d.ts`).

Variables d'environnement : `ALGOPLANR_DATA_DIR` (dossier SQLite), `ALGOPLANR_JETON` (jeton exigé dans l'en-tête
`X-AlgoPlanR-Jeton`, vide = désactivé), `ALGOPLANR_CODE_PRINCE` (en-tête `X-AlgoPlanR-Code-Prince` exigé pour écrire
des faits de Prince, vide = désactivé), `ALGOPLANR_DEBUG=1` (CORS vers localhost:3000), `ALGOPLANR_FRONTEND_DIR`
(dossier `out/` servi à la racine), `GEMINI_API_KEY` (routes IA).

## Accès et sécurité (`contextes/acces`) — postes autonomes

Chaque poste (le DRH, chaque délégué régional) a sa propre installation et sa propre base SQLite, **sans réseau**
entre eux. Toute l'API exige une session (`Authorization: Bearer <jeton>`), sauf `sante/`, `acces/etat/`,
`acces/activation/`, `acces/connexion/` et `acces/code/`. Le jeton local `X-AlgoPlanR-Jeton` reste exigé en plus :
il authentifie le processus, pas la personne.

**Rien n'expire** : ni le fichier d'activation du DRH, ni les codes des délégués, ni les mots de passe (seules les
sessions se ferment : 20 min sans activité, 12 h au plus). Les champs `expire_le` des anciens fichiers sont ignorés.

### Poste du DRH : fichier d'activation signé
- Le poste n'embarque que la **clé publique** Ed25519 (`contextes/acces/cle_publique_activation.pem`). L'activation
  initiale doit créer le compte DRH ; signature, intégrité et unicité du fichier (pas de rejeu) sont vérifiées.
- Liaison facultative au poste : l'écran d'activation affiche l'**identifiant du poste** (`acces/etat/`), que
  l'administration reporte dans le fichier (`--poste`). C'est un repère administratif, **pas une protection contre
  le clonage** (une copie de la base copie aussi l'identifiant).
- Première connexion : `drh` + mot de passe temporaire, puis création obligatoire du mot de passe personnel.
- **Mot de passe oublié** : fichier signé de `reinitialisation`, **lié au poste (obligatoire)** et à usage unique.

### Postes des délégués : région + code de 8 caractères
- Les codes sont tirés au hasard par l'administration (31 symboles sans ambiguïté : ni 0, O, 1, I ni L), par région
  et par usage : **activation** (premier accès) ou **récupération** (mot de passe oublié, distincts).
- L'installation embarque un **catalogue signé** de vérificateurs `scrypt` (`catalogue_codes.algoplanr-catalogue`) :
  **aucun code ni secret commun** dans l'exécutable. Un nouveau catalogue (codes supplémentaires, révocations)
  s'importe par « Importer un fichier » ; les codes non révoqués restent valables.
- Le délégué choisit sa région et saisit son code (`POST acces/code/`) : session limitée à la création du mot de
  passe. Le code est **consommé dans la même transaction** que l'enregistrement du mot de passe personnel
  (`CodeConsomme`, identifiant unique) ; s'il abandonne avant, le code reste utilisable. Un poste ne sert qu'une
  région ; le poste du DRH refuse les codes. 5 codes refusés en 15 min bloquent la saisie 15 min.
- Le cloisonnement régional est imposé par Django (`perimetre.py`) : le délégué ne voit que sa région.
- **Aucune donnée n'est supprimée** par une activation ou une récupération.

### Codes à remettre : livrés chiffrés avec l'installation
- Les codes en clair sont livrés **chiffrés** avec l'installation (`carnet_codes.algoplanr-carnet`, signé). Leur clé,
  tirée au hasard, n'est dans aucune installation : seul le fichier d'activation du DRH l'apporte, enveloppée par
  son mot de passe temporaire. Les postes des délégués n'ont donc que du texte chiffré, sans clé.
- À la création du mot de passe personnel du DRH, les codes s'installent sur son poste (AES-256-GCM, clé de données
  enveloppée par son mot de passe et par une **clé de secours** affichée une seule fois, juste après). Aucun import,
  aucune phrase à saisir.
- Changement de mot de passe : la clé est réenveloppée dans la même transaction. Mot de passe réinitialisé : le
  fichier de récupération du DRH apporte à nouveau la clé et les codes se réinstallent ; à défaut, la clé de secours
  rouvre le coffre. Les **remises déjà faites sont conservées**.
- Chaque code remis (`POST acces/codes/remettre/`, mot de passe redemandé) n'est affiché qu'une fois ; le journal
  ne contient jamais de code.

### Procédure de l'administrateur (machine de l'administrateur, clé privée — jamais sur un poste)

```powershell
python manage.py acces_generer_cles --dossier D:\AlgoPlanR-admin --installer        # une fois
# Catalogue et codes chiffrés (embarqués dans le build) : 10 codes d'activation + 10 de récupération par région ;
# la clé des codes va dans un fichier secret, jamais dans le build
python manage.py acces_preparer_codes --cle-privee D:\AlgoPlanR-admin\cle_privee_activation.pem --numero 1 `
    --sortie-catalogue contextes\acces\catalogue_codes.algoplanr-catalogue `
    --sortie-carnet contextes\acces\carnet_codes.algoplanr-carnet --sortie-cle D:\AlgoPlanR-admin\cle-carnet-1.txt
# Poste du DRH (mot de passe temporaire tiré au hasard et affiché une fois), lié à son poste, avec la clé des codes
python manage.py acces_preparer_activation --cle-privee ... --type initiale --cle-carnet D:\AlgoPlanR-admin\cle-carnet-1.txt `
    --compte drh:DRH::"Direction des ressources humaines" --poste <identifiant> --sortie activation-drh.algoplanr-activation
# Récupération du DRH (réinstalle aussi les codes)
python manage.py acces_preparer_activation --cle-privee ... --type reinitialisation --cible drh --poste <identifiant> `
    --cle-carnet D:\AlgoPlanR-admin\cle-carnet-1.txt ...
# Renouvellement : nouveaux codes de récupération, révocation de codes compromis (les autres restent valables)
python manage.py acces_preparer_codes ... --numero 2 --activation 0 --recuperation 5 --revoquer C1-CEN-A003 ...
```

**Avant un build de production** : remplacer `cle_publique_activation.pem`, `catalogue_codes.algoplanr-catalogue` et `carnet_codes.algoplanr-carnet`
(le catalogue livré ici est signé par la clé de **développement**).

### Mesures (`manage.py acces_mesurer_codes`, poste de développement)

Vérificateurs `scrypt` n=2^16, r=8, p=1 (64 Mo par calcul, ~0,75 s). Un seul sel par groupe (région, usage) :

| Codes dans le catalogue | Saisie d'un code (mesurée) | Variante « un sel par code » | Génération du catalogue |
|---|---|---|---|
| 100 | 0,3 à 0,9 s | ~75 s | ~1,2 min |
| 500 | 0,3 à 0,9 s | ~6 min | ~6 min |
| 1 000 | 0,3 à 0,9 s | ~12 min | ~12 min |

La saisie ne dépend pas de la taille du catalogue (un calcul par version de catalogue qui couvre la région).

### Risque d'attaque hors ligne et limites
- **8 caractères** sur 31 symboles : 31^8 ≈ 8,5·10^11 combinaisons (~39,6 bits). Quelqu'un qui extrait le catalogue
  de l'installation peut tester des codes **sans limite d'essais** ; avec un sel par groupe, chaque essai vise les
  N codes du groupe à la fois. Coût moyen pour trouver *un* code, au coût mesuré, sur 16 cœurs : ~63 ans (10 codes
  par groupe), ~13 ans (50), ~3 ans (200). Un tel code n'ouvre qu'**un poste vierge de sa région** : aucune donnée
  d'un autre poste n'est accessible. Garder des groupes petits (10 codes) et renouveler ou révoquer au besoin.
- **Usage unique par poste seulement** : hors réseau, un code d'activation peut encore servir sur un autre poste
  vierge de la même région ; restaurer une sauvegarde antérieure à la consommation rend un code à nouveau
  utilisable sur ce poste.
- **Révocation** : effective seulement sur les postes où le nouveau catalogue est installé.
- Le carnet est en clair seulement en mémoire, le temps d'une remise ; il est chiffré au repos sur le poste du DRH.

### Essais
- `pytest` : `tests/test_acces.py`, `tests/test_acces_codes.py` (sécurité, atomicité, cloisonnement, carnet,
  récupérations), `tests/test_domaine_codes.py`, `tests/test_sauvegarde_migration.py` (sauvegarde avant migration).
- `pwsh -File scripts\essai_deux_postes.ps1` : deux serveurs, deux bases, aucun fichier partagé (19 contrôles).

### Recette sur deux PC Windows réellement déconnectés
1. Installer l'.exe sur les deux PC ; couper Wi-Fi et câble réseau.
2. PC du DRH : « Activer ce poste » → DRH → fichier d'activation ; se connecter (`drh`) ; créer le mot de passe.
3. À la création du mot de passe, **noter la clé de secours** affichée ; dans « Comptes et accès », remettre un code
   d'activation pour la région du PC du délégué.
4. PC du délégué : « Activer ce poste » → délégué → région + code ; créer le mot de passe ; noter l'identifiant.
5. Vérifier : seules les données de la région sont visibles ; le même code est refusé ensuite.
6. Redémarrer les deux PC : les connexions fonctionnent toujours, les données sont présentes.
7. Mot de passe oublié du délégué : code de récupération remis par le DRH → nouveau mot de passe, données intactes ;
   le code de récupération est refusé à la seconde saisie.
8. Mot de passe oublié du DRH : fichier de réinitialisation lié au poste → nouveau mot de passe : les codes se
   réinstallent, et ceux déjà remis restent marqués comme remis.
9. Contrôler `donnees\sauvegardes\` : une copie de la base existe avant chaque mise à jour de l'application.

## Architecture

```
domaine/          PYTHON PUR (testé : aucun import django/pandas/numpy)
  commun/         texte, nombres, pagination, horloge injectable
  parametrage/    DEFAULT_CONFIG, fusion, validation
  donnees/        colonnes, entités Ecole/Enseignant/Poste, détection des colonnes, recherche, jeu de démo
  qualite/        rapport de qualité
  diagnostic/     indicateurs (Pe, De, BMAX, be, xe, se, Wp, Up...), territoires, synthèse, priorités
  mobilite/       barème C1-C5, score Z1-Z4, vivier, moteur (phases 0-4), projections N+3 (obsolètes : voir planification), flux, invariants,
                  candidatures, combinaisons, explication, scénarios, recrues
  prince/         vérification des faits, analyse de fichier
  rapport/        rapport de décision
  planification/  hypothèses et 13 arbitrages DRH, projection N+1 → N+5, suivi des décisions (codeSource v3.0)
  nominations/    cycle de vie des nominations, rapprochement vivier / postes, contrôles du registre
contextes/        applications Django : models.py · depots.py · services.py · views.py · urls.py
  donnees parametrage diagnostic prince simulation arbitrage recrutement rapports ia
  audit planification nominations
algoplanr/        settings, urls, serveur.py (waitress)
tests/            domaine pur · parité avec l'original · parcours API complet
```
Agrégat racine : `JeuDeDonnees` (suppression en cascade). Calcul synchrone ; résultats stockés compressés avec
empreinte. Règles de recalcul : fait de Prince / arbitrage / recrue modifié → tous les scénarios sont recalculés ;
paramètres modifiés → cache du diagnostic invalidé et scénarios marqués `obsolete`.

## Routes (`/api/v1/`) — pagination `?page=&taille=&tri=` ; filtres `?region=&departement=&commune=` ; refus métier = 422

Toutes les routes du plan Word sont implémentées (`jeux/{jeu}/…`). Ajouts : `scenarios/{sid}/export/` (Excel),
`…/postes-zone-rouge/`, `…/ecoles-en-besoin/`, `…/ecoles-fournisseurs/`, `…/ia/note-strategique|audit-equite|copilot/`,
`schema/`, `docs/`. Voir Swagger pour la liste exhaustive. Pages de 5 000 lignes au plus.

### Routes reprises de la version desktop v3.0 (codeSource)

| Contexte | Routes | Origine dans codeSource |
|---|---|---|
| `planification` | `hypotheses/defaut/`, `jeux/{jeu}/hypotheses/` (+ `documentation/`, `historique/`, `attrition/estimer/`), `planification/` (+ `territoires/`, `sous-systemes/`, `ecoles/`, `departs/`, `fiabilite/`, `etat/`, `recalculer/`, `versions/…`), `quotas/…`, `indicateurs/…` | `application/planning_5years.py` : `DEFAULT_PLANNING_PARAMS`, `normaliser_parametres`, formules S-min / S-maintien / S-besoin / sous plafond, `DONNEES_REGIONS_REF` (taux régionaux, orientations) |
| `nominations` | `vivier/…`, `postes-ouverts/…`, `nominations/…` (proposer, générer, lot, import, valider, rejeter, mettre en œuvre, annuler, synthèse), `mouvements/…`, `personnes/{matricule}/mouvements/` | `application/nomination_service.py` : cycle PROPOSEE → VALIDEE → MISE_EN_OEUVRE, faits du Prince pré-validés |
| `audit` | `jeux/{jeu}/journal-audit/`, `…/{evenement}/` | `application/audit_service.py`, étendu à toutes les écritures |
| `donnees` | `validation/`, `actualisations/`, `actualisations/{id}/ecarts/` | (propre au serveur) |
| `simulation` | `scenario-retenu/` | (propre au serveur) |

La planification applique les formules DRH aux **données du jeu** : effectifs des écoles après les mouvements
du scénario retenu, retraites nominatives d'après les âges (AGE_RETRAITE, CORR_60), croissance des élèves
(G_PRI_PCT) recalculant la cible K de chaque école, autres départs (modèle M1 : 2,25 %/an, ou taux régionaux),
directeurs déchargés, déficit initial rattrapé sur ETAL_N ans, plafond PLAF_PRI rapporté à l'effectif du
périmètre et plancher des retraites. Les chiffres du rapport national codés en dur ne sont pas repris. Sans
scénario retenu, le scénario par défaut (`geo_region`) sert de référence ; il ne laisse en général au vivier que
des enseignants sans poste compatible : retenez un scénario plus proche (`geo_departement`) pour nommer.

## Performances (jeu de 30 000 écoles / 39 000 enseignants)

| Opération | Avant | Après |
|---|---|---|
| Lecture d'un classeur (envoi) | 30–36 s | 3,5 s |
| Création du jeu (qualité + 3 scénarios) | 201 s | 31 s |
| Liste complète des écoles (1re lecture / suivantes) | 528 s / 38 s | 6,4 s / 2 s |
| Liste complète des enseignants | 22 s | 2 s |
| Recherche (enseignant / école) | 16 s / 9 s | 2,4 s / 0,6 s |
| Fait du Prince : impact / ajout ou annulation (3 scénarios recalculés) | 113 s / 120 s | 11 s / 16 s |

- **Moteur** (`domaine/mobilite/selection.py`) : les phases 2 et 3 évaluent une fois chaque école à postes
  libres (et non chaque poste), via des index par IAEB, département et classe d'ajustements ; résultat
  strictement identique à `choisir_meilleur_poste` (`tests/test_selection.py`, parité avec le code d'origine).
  Les entrées sont copiées superficiellement (le moteur ne fait que réaffecter des attributs).
- **Caches mémoire** (`contextes/diagnostic/services.py`) : écoles enrichies, lignes de la liste des
  enseignants et clés de recherche, par jeu et par empreinte (paramètres, faits du Prince, effectifs).
- **Recherche** : bornes de difflib calculées sans construire de `SequenceMatcher` (`tests/test_recherche.py`).
- **Lecture des classeurs** : `python-calamine` quand il est installé, openpyxl sinon (mêmes valeurs).

## Ce qui vient du .py et ce qui est une adaptation à valider

| Fidèle au .py (parité testée) | Adapté ou inventé (absent du .py) |
|---|---|
| indicateurs, barème, score, phases 0-3, vivier, synthèse, projections N+3 (obsolètes), filtre territorial, export Excel, IA | scénarios (3 préréglages géographiques = combinaisons de phases), arbitrages (phase `arbitrage_commission`), déploiement des recrues, `candidatures`, `combinaisons`, `invariants`, `flux`, `comparaison`, `priorites`, `rapport`, `explication` |

## Points hérités du code d'origine, volontairement conservés

1. `_nb_niveaux` renvoie 6 dans les deux branches : un poste multigrade a donc 3 sections, sinon 6.
2. Le barème C2 utilise le seuil codé en dur 5 ans, pas `anciennete_poste_recevabilite_ans`.
3. Un âge égal à 0 est remplacé par 35.
4. Phase 1 : un seul poste (le premier libre) par école et par vœu.
5. Les projections ne comptent que les agents du vivier (pas tous les enseignants de l'école).
6. Un fait de Prince n'est recevable que pour un agent du vivier ; si l'école n'a aucun poste libre, un poste
   supplémentaire est créé (il augmente `besoin_total`).
7. La phase 4 « vivier de recrutement » n'est qu'une synthèse.

Changements volontaires : le mot de passe `ADMIN2026` n'existe plus (code optionnel par variable d'environnement),
la clé Gemini reste côté serveur, l'horloge est injectée, le moteur ne modifie pas ses entrées.
