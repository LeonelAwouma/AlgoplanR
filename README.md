# AlgoPlanR

Plateforme locale d'analyse, de planification et d'aide à la décision sur les ressources enseignantes.

```
AlgoplanR/
├── frontend/   interface Next.js (ce dépôt)
└── backend/    serveur Django (à venir)
```

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
