# Procédure de validation Windows 11 — AlgoPlanR

> **Statut : À EXÉCUTER.** Aucun contrôle de ce document n'a encore été exécuté sur Windows. Les recettes faites
> jusqu'ici l'ont été sous **Linux** (build PyInstaller Linux, Electron sous Xvfb) : elles ne certifient pas
> l'application Windows. Ne cochez une case qu'après l'avoir réellement exécutée, avec une preuve (capture, fichier,
> sortie de commande) rangée dans `preuves-windows/`.

## 0. Poste et préparation

| Élément | Attendu |
|---|---|
| Système | Windows 11 à jour, session standard (pas administrateur), antivirus Defender actif |
| Outils | Python (celui de `backend/.venv`), Node.js LTS, pnpm, Git |
| Dépôt | branche à valider, `git status` propre, `git log -1` noté dans le rapport |
| Données de test | `backend/jeux_de_test/realiste/generer.py` (jeu national 13 000 écoles) + jeu de démonstration |
| Sauvegarde | si le poste a déjà AlgoPlanR : copier `%APPDATA%\AlgoPlanR\donnees` ailleurs **avant** tout test |

Fichier d'activation : utiliser un fichier **signé pour ce poste** (clé du build à valider). Ne jamais mettre la clé
privée sur le poste de test.

Rapport : un tableau `Contrôle | Résultat (OK / KO / non testé) | Preuve | Remarque`. Un contrôle non exécuté reste « non testé ».

## 1. Build PyInstaller réel

Le défaut corrigé au lot 4.10 : un build lancé depuis `backend\packaging` produisait un exécutable sans les modules
métier (`No module named 'algoplanr.settings'`). Les deux manières de lancer le build doivent donc être testées.

```powershell
cd backend
.\.venv\Scripts\python -m pip install pyinstaller
# A. depuis backend\packaging (le cas qui échouait)
cd packaging
..\.venv\Scripts\python -m PyInstaller --noconfirm --distpath C:\build\A\dist --workpath C:\build\A\work algoplanr-serveur.spec
# B. depuis backend\
cd ..
.\.venv\Scripts\python -m PyInstaller --noconfirm --distpath C:\build\B\dist --workpath C:\build\B\work packaging\algoplanr-serveur.spec
```

| # | Contrôle | OK? |
|---|---|---|
| 1.1 | Les deux builds se terminent par « Build complete » ; aucun message « Build interrompu : aucun module collecté » | ☐ |
| 1.2 | `C:\build\A\dist\algoplanr-serveur\_internal\docx\parts` existe | ☐ |
| 1.3 | `_internal\contextes\acces\` contient `cle_publique_activation.pem`, le catalogue et le carnet | ☐ |
| 1.4 | Defender ne met pas l'exécutable en quarantaine (UPX est activé dans le `.spec` : si faux positif, noter et tester `upx=False`) | ☐ |

## 2. Démarrage de Django depuis le `.exe`

```powershell
$env:ALGOPLANR_DATA_DIR = "C:\test\donnees"; $env:ALGOPLANR_JETON = "jeton-test"
& C:\build\A\dist\algoplanr-serveur\algoplanr-serveur.exe --port 8765
# autre fenêtre :
curl.exe -H "X-AlgoPlanR-Jeton: jeton-test" http://127.0.0.1:8765/api/v1/acces/etat/
```

| # | Contrôle | OK? |
|---|---|---|
| 2.1 | La console affiche `ALGOPLANR_PRET http://127.0.0.1:8765` en moins de 30 s | ☐ |
| 2.2 | `acces/etat/` répond 200 ; `algoplanr.sqlite3` est créé dans `C:\test\donnees` | ☐ |
| 2.3 | Aucune erreur `ModuleNotFoundError` ni `FileNotFoundError` dans la console | ☐ |
| 2.4 | Le serveur n'écoute que sur `127.0.0.1` (`netstat -ano | findstr 8765`) | ☐ |

## 3. Exports Excel et Word depuis l'exécutable

Activer le poste (fichier d'activation), se connecter en DRH, créer un jeu de démonstration puis un jeu national.

| # | Contrôle | OK? |
|---|---|---|
| 3.1 | Export `xlsx` du périmètre et `national_complet` : HTTP 200, s'ouvre dans **Excel** sans réparation | ☐ |
| 3.2 | Export `docx` du périmètre et `national_complet` : HTTP 200 (la 500 `FileNotFoundError … docx/parts/../templates` ne doit plus apparaître), s'ouvre dans **Word** sans réparation | ☐ |
| 3.3 | Word : page **A4 paysage**, en-têtes de tableau répétés, numéro de page, « Scénario : n », virgule décimale | ☐ |
| 3.4 | Les totaux du fichier = ceux de l'écran (même jeu, même scénario) | ☐ |
| 3.5 | Durée de l'export national complet notée (Linux : ~50 s) ; l'interface affiche la progression et reste utilisable | ☐ |

## 4. Installation et lancement d'Electron

```powershell
cd frontend; pnpm install --frozen-lockfile; pnpm build      # produit frontend\out
cd ..\electron-app; npm ci; npm run dist                      # NE PAS lancer « npm run release » (publie)
```

| # | Contrôle | OK? |
|---|---|---|
| 4.1 | L'installateur est produit dans `dist\` ; il s'installe sans droits administrateur | ☐ |
| 4.2 | Le lancement affiche la fenêtre de démarrage, puis l'application ; le backend est lancé par l'application (processus `algoplanr-serveur.exe`) | ☐ |
| 4.3 | Dans l'application : connexion DRH, ouverture d'un jeu, export Excel **et** Word depuis l'interface (téléchargement enregistré) | ☐ |
| 4.4 | À la fermeture, le processus `algoplanr-serveur.exe` s'arrête (Gestionnaire des tâches) | ☐ |

## 5. Fonctionnement sans Internet

Débrancher le réseau (mode avion) ou bloquer l'application au pare-feu, **puis** lancer l'application.

| # | Contrôle | OK? |
|---|---|---|
| 5.1 | Démarrage, connexion, import, calcul, exports : tout fonctionne | ☐ |
| 5.2 | La recherche de mise à jour échoue silencieusement (aucun blocage, aucune fenêtre d'erreur) | ☐ |
| 5.3 | `netstat -ano` / Moniteur de ressources : seul `127.0.0.1` est utilisé par l'application | ☐ |

## 6. Persistance SQLite

| # | Contrôle | OK? |
|---|---|---|
| 6.1 | Créer un jeu, un fait du Prince, retenir un scénario ; fermer l'application normalement ; relancer : tout est présent | ☐ |
| 6.2 | Idem après arrêt brutal (Gestionnaire des tâches → fin de tâche de l'application et du serveur) | ☐ |
| 6.3 | Idem après redémarrage de Windows | ☐ |
| 6.4 | La base est dans `%APPDATA%\AlgoPlanR\donnees` ; les sauvegardes sont dans `donnees\sauvegardes` | ☐ |

## 7. Changement de compte DRH / délégué

| # | Contrôle | OK? |
|---|---|---|
| 7.1 | Déconnexion DRH puis connexion d'un délégué (identifiant de région) : seule sa région est visible | ☐ |
| 7.2 | Le délégué ne voit pas les jeux du DRH ; `export national complet` refusé (403) ; filtre d'une autre région ignoré | ☐ |
| 7.3 | Retour au DRH : jeux et exports inchangés ; aucune donnée du délégué visible par un autre délégué | ☐ |
| 7.4 | Une seconde connexion du même compte invalide la première (session unique) : comportement noté | ☐ |

## 8. Mise à jour sans risque pour les données

Principe : la mise à jour remplace le programme, jamais `%APPDATA%\AlgoPlanR\donnees`. Le serveur sauvegarde la base
(`sauvegardes\avant-migration-*.sqlite3`) avant d'appliquer une migration.

1. Installer la version N, créer des données (jeu national, fait du Prince, scénario retenu), **copier le dossier `donnees`**.
2. Produire la version N+1 (incrémenter `version` dans `electron-app\package.json`, `npm run dist`).
3. Installer N+1 **par-dessus** N (sans désinstaller).

| # | Contrôle | OK? |
|---|---|---|
| 8.1 | Les données de N sont intactes dans N+1 (jeux, comptes, Prince, scénario retenu, journal d'audit) | ☐ |
| 8.2 | Les scénarios calculés avant la règle matrimoniale v2 sont marqués **obsolètes** ; « Calculer » les recalcule ; les décisions déjà validées sont inchangées | ☐ |
| 8.3 | Si une migration existe : `sauvegardes\avant-migration-*.sqlite3` est créé | ☐ |
| 8.4 | Retour arrière : remettre la copie de `donnees` et réinstaller N → l'application démarre avec les données d'origine | ☐ |
| 8.5 | La mise à jour automatique (`electron-updater`) n'est pas testée sur un dépôt de production ; si elle l'est, sur un canal de test | ☐ |

## 9. Critères d'acceptation

Livraison Windows possible seulement si : tous les contrôles des sections 1 à 8 sont **OK** (aucun « non testé »),
et la validation métier de la règle C3 (voir `docs/validation-metier-en-attente.md`) est obtenue ou son statut
explicitement accepté par l'administration pour la version livrée.
