# AlgoPlanR — Backend Django (DDD)

Moteur d'affectation des enseignants (MINEDUB / PAREC) exposé en API REST. La logique métier est celle de
`app_algoplanr.py` (v2.1), portée en Python pur ; les routes suivent le plan « Plan-backend-Django-DDD ».

## Démarrage

```bash
python -m venv .venv && source .venv/bin/activate        # Python 3.13
pip install -r requirements.txt pytest pytest-django
python manage.py migrate
ALGOPLANR_DEBUG=1 python -m algoplanr.serveur --port 8000  # ou : python manage.py runserver
pytest                                                      # 18 tests dont la parité avec le code d'origine
```
Swagger : `http://127.0.0.1:8000/api/v1/docs/` — contrat OpenAPI : `/api/v1/schema/`
(types TypeScript : `npx openapi-typescript http://127.0.0.1:8000/api/v1/schema/ -o src/shared/api/schema.d.ts`).

Variables d'environnement : `ALGOPLANR_DATA_DIR` (dossier SQLite), `ALGOPLANR_JETON` (jeton exigé dans l'en-tête
`X-AlgoPlanR-Jeton`, vide = désactivé), `ALGOPLANR_CODE_PRINCE` (en-tête `X-AlgoPlanR-Code-Prince` exigé pour écrire
des faits de Prince, vide = désactivé), `ALGOPLANR_DEBUG=1` (CORS vers localhost:3000), `ALGOPLANR_FRONTEND_DIR`
(dossier `out/` servi à la racine), `GEMINI_API_KEY` (routes IA).

## Architecture

```
domaine/          PYTHON PUR (testé : aucun import django/pandas/numpy)
  commun/         texte, nombres, pagination, horloge injectable
  parametrage/    DEFAULT_CONFIG, fusion, validation
  donnees/        colonnes, entités Ecole/Enseignant/Poste, détection des colonnes, recherche, jeu de démo
  qualite/        rapport de qualité
  diagnostic/     indicateurs (Pe, De, BMAX, be, xe, se, Wp, Up...), territoires, synthèse, priorités
  mobilite/       barème C1-C5, score Z1-Z4, vivier, moteur (phases 0-4), projections N+3, flux, invariants,
                  candidatures, combinaisons, explication, scénarios, recrues
  prince/         vérification des faits, analyse de fichier
  rapport/        rapport de décision
contextes/        applications Django : models.py · depots.py · services.py · views.py · urls.py
  donnees parametrage diagnostic prince simulation arbitrage recrutement rapports ia
algoplanr/        settings, urls, serveur.py (waitress)
tests/            domaine pur · parité avec l'original · parcours API complet
```
Agrégat racine : `JeuDeDonnees` (suppression en cascade). Calcul synchrone ; résultats stockés compressés avec
empreinte. Règles de recalcul : fait de Prince / arbitrage / recrue modifié → tous les scénarios sont recalculés ;
paramètres modifiés → cache du diagnostic invalidé et scénarios marqués `obsolete`.

## Routes (`/api/v1/`) — pagination `?page=&taille=&tri=` ; filtres `?region=&departement=&commune=` ; refus métier = 422

Toutes les routes du plan Word sont implémentées (`jeux/{jeu}/…`). Ajouts : `scenarios/{sid}/export/` (Excel),
`…/postes-zone-rouge/`, `…/ecoles-en-besoin/`, `…/ecoles-fournisseurs/`, `…/ia/note-strategique|audit-equite|copilot/`,
`schema/`, `docs/`. Voir Swagger pour la liste exhaustive (57 chemins).

## Ce qui vient du .py et ce qui est une adaptation à valider

| Fidèle au .py (parité testée) | Adapté ou inventé (absent du .py) |
|---|---|
| indicateurs, barème, score, phases 0-3, vivier, synthèse, projections N+3, filtre territorial, export Excel, IA | scénarios (3 préréglages géographiques = combinaisons de phases), arbitrages (phase `arbitrage_commission`), déploiement des recrues, `candidatures`, `combinaisons`, `invariants`, `flux`, `comparaison`, `priorites`, `rapport`, `explication` |

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
