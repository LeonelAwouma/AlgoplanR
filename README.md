# AlgoPlanR

Plateforme locale d'analyse, de planification et d'aide à la décision sur les ressources enseignantes.

```
AlgoplanR/
├── frontend/   interface Next.js
└── backend/    serveur Django (voir backend/README.md)
```

## Lancer le backend

Prérequis : Python 3.12 ou plus (testé avec 3.14).

```bash
cd backend
py -3.14 -m venv .venv                  # Windows ; ailleurs : python3 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt pytest pytest-django
ALGOPLANR_DEBUG=1 .venv/Scripts/python -m algoplanr.serveur --port 8000
```

Sous PowerShell :

```powershell
cd backend
$env:ALGOPLANR_DEBUG = "1"
.\.venv\Scripts\python.exe -m algoplanr.serveur --port 8000
```

`ALGOPLANR_DEBUG=1` autorise les appels de l'interface servie par `pnpm dev` (CORS vers `localhost:3000`).
La base SQLite est lue dans `backend/donnees/algoplanr.sqlite3`.

## Lancer le frontend

Prérequis : Node.js 20 ou plus et pnpm.

```bash
cd frontend
pnpm install
```

**Sans serveur, avec les données factices** (jeu de démonstration fictif, fourni dans `frontend/public/donnees-factices`) :

```bash
pnpm dev:factice
```

**Avec le serveur Django** : créer `frontend/.env.local` contenant

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_API_MOCK=0
```

puis lancer `pnpm dev`. L'interface s'ouvre sur `http://localhost:3000`.

## Branchement sur le serveur Django

Le serveur Django sert les chemins de l'API dans ses propres formats (noms de colonnes du fichier,
pagination `{count, page, taille, pages, resultats}`, erreurs `{detail, code, motifs}`). L'interface
les convertit au format du contrat dans `frontend/components/shared/api/backend/` : une conversion par
route, appliquée par le transport HTTP, sans toucher aux écrans. Les données factices, déjà au format du
contrat, ne passent pas par ces conversions.

- Les agrégats que le serveur ne calcule pas (sévérité, arbre territorial, synthèse, flux, comparaison)
  sont recalculés côté interface avec les fonctions du moteur de référence
  (`frontend/components/shared/api/backend/moteur/`), à partir des indicateurs du serveur.
- Les listes sont lues en entier (pages de 5 000 lignes), puis filtrées et paginées selon le contrat ;
  elles restent en cache 30 minutes, et toute écriture sur un jeu vide son cache.
- Toutes les routes de l'interface sont servies. La planification sur cinq ans, les quotas et indicateurs,
  le vivier et les nominations, les mouvements et le journal d'audit reprennent la logique de la version
  desktop v3.0 (codeSource : moteur DRH de planification, suivi des nominations, journal d'audit), portée dans
  `backend/domaine/planification` et `backend/domaine/nominations` ; la validation et l'actualisation des jeux
  et le scénario retenu sont propres au serveur. Une route que le serveur ne servirait pas ne partirait pas :
  l'écran indiquerait que la fonction n'est pas encore disponible.
- Règles de l'interface que le serveur ne paramètre pas (sévérité, besoin, zone rouge…) : affichées
  telles que le serveur les applique, non enregistrées si on les modifie.

## Contrat de l'API

Le backend doit servir les routes attendues par l'interface, sous le préfixe `/api/v1/` :

- liste des routes : `frontend/components/shared/api/manifeste.ts` ;
- format JSON de chaque réponse : `frontend/components/shared/api/contrat/` ;
- exemples de réponses : `frontend/public/donnees-factices/*.json` ;
- erreurs : `{ "code", "motif", "details" }`, statut 422 (règle de gestion) ou 409 (conflit) ;
- listes paginées : `{ "elements", "total", "page", "taille" }`.

## Vérifier

```bash
cd frontend
pnpm check
```
