# Recette visuelle — phases A à D

Procédure de contrôle à l'écran des travaux des phases A à D : configuration du moteur, faits du Prince, indicateurs de
suivi, rapport paginé, impression / PDF, document Word. Les contrôles automatiques (tests, types, build) ne remplacent
pas ces vérifications : aucun navigateur ne les a exercées.

Durée : environ 45 minutes. Cocher chaque ligne ; noter toute différence avec l'attendu (capture d'écran + étape).

## 0. Préparation

1. **Contrôles automatiques** (doivent être verts avant de commencer).
   - `cd backend` puis `.venv/Scripts/python.exe -m pytest tests` (≈ 250 tests).
   - `cd frontend` puis `npx tsc --noEmit`, `npx eslint components tests --max-warnings 0`, `npx prettier --check components tests`, `npm test`, `npx next build`.
2. **Serveur** : `cd backend` ; `ALGOPLANR_DEBUG=1 .venv/Scripts/python -m algoplanr.serveur --port 8000`.
3. **Interface** : `frontend/.env.local` contient `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` ; `cd frontend` ; `pnpm dev` ; ouvrir `http://localhost:3000`. Vider le cache du navigateur (ou fenêtre privée) : une ancienne version affichait encore le panneau « S = A + Z + B ».
4. **Compte DRH** : activer le poste avec le fichier d'activation de test (`C:\Users\MARCOM\AlgoPlanR-admin\activation-drh-test.algoplanr-activation`). Le DRH est nécessaire pour les faits du Prince et le jeu national.
5. **Jeu d'essai** : classeurs de `backend/jeux_de_test/nominations/` (40 écoles, 300 enseignants — voir `LISEZ-MOI.md`). Écran « Ajouter les données » : déposer `etablissements.xlsx` et `enseignants.xlsx`.
   Option : mode sans serveur (`pnpm dev:factice`) pour vérifier que les données d'exemple restent lisibles (§7).

## 1. Import et qualité des données

| # | Action | Attendu |
|---|--------|---------|
| 1.1 | Champ « Année scolaire du jeu » : saisir `2027-2030`. | Message « deux années consécutives » ; le bouton d'analyse est désactivé. |
| 1.2 | Saisir `2027-2028`, lancer l'analyse. | Jeu créé ; l'année `2027-2028` apparaît dans la liste des jeux et en haut de l'application. |
| 1.3 | « Qualité des données ». | 0 erreur ; 3 avertissements : 18 retraités exclus, 19 motifs sans école citée, 39 écoles sur 40 en écart d'effectif. La section « Écarts d'effectif » liste ces écoles, avec la règle « l'effectif déclaré fait foi ». |
| 1.4 | Réimporter après avoir retiré la colonne `Age` du classeur des enseignants (copie de travail). | Avertissement explicite « 35 ans supposés » ; dans la liste des enseignants, l'âge s'affiche « — » et non 35. |
| 1.5 | Réimporter après avoir retiré les colonnes de salles / l'effectif d'élèves. | Avertissements « capacité inconnue » et « sans effectif d'élèves » ; la fiche école indique « Capacité inconnue ». |

## 2. Configuration du moteur (vue analyste)

| # | Action | Attendu |
|---|--------|---------|
| 2.1 | Ouvrir « Configuration du moteur ». | **Plus de panneau « S = A + Z + B »**, ni « B — bonification pour motif justifié », ni bonus de stabilité. Restent : barème C1 à C5, poids de l'école, score d'appariement, points par situation. |
| 2.2 | Points de proximité. | Trois champs seulement : même commune (60), même département (30), ailleurs (0). Pas de « même IAEB » ni « même région ». |
| 2.3 | Ajustements contextuels. | Cinq lignes dont **Bonification ciblée (rapprochement de conjoint, suivi médical) sur l'école visée : 20**. |
| 2.4 | Sous le barème. | Paragraphe « Fixés dans le moteur, donc non modifiables ici » : C3 −2 par enfant, C4 2 par formation plafonnée à 10, C5 10 / 8 / 5. |
| 2.5 | Modifier un poids (curseur), enregistrer, recharger la page. | La valeur modifiée est conservée (réglage transmis au serveur). |
| 2.6 | Référentiel → Mobilité. | Les champs et interrupteurs inactifs sont **grisés avec « Non appliqué : le calcul n'utilise pas ce réglage »** : nombre de vœux, ordre d'examen, proche de la retraite, stabilité pour l'obligatoire, protection des proches de la retraite, solution proche, redéploiement obligatoire, zone rouge, projection N+2, départage, taux d'attrition. Restent actifs : stabilité minimale, vœux, régions étanches. |
| 2.7 | Référentiel → Besoin. | Actifs : norme, tolérance (première section), niveaux, minimum selon multigrades, double flux, âge de retraite. Grisés : déduction des départs connus, repli sans effectif, source des postes. L'année scolaire est en lecture seule. |
| 2.8 | Référentiel → Gravité / Priorité. | Seuils de sévérité, points α / σ, seuils de niveau, tranches β : grisés (« non appliqué »). Les coefficients t1 / t2 restent actifs. |
| 2.9 | Simulation → scénario personnalisé. | Norme, tolérance, niveaux, double flux, stabilité : actifs. Ordre d'examen, solution proche, redéploiement obligatoire, zone rouge : grisés. |

## 3. Bonification ciblée (effet sur les vœux)

Préparer une copie de `enseignants.xlsx` : pour un agent ayant au moins un vœu, écrire dans `Motif_Bonification` : `Rapprochement de conjoint <code de son vœu 2>`. Pour un autre : `Rapprochement familial` (sans école). Importer comme nouveau jeu.

| # | Action | Attendu |
|---|--------|---------|
| 3.1 | Qualité des données. | Avertissement « motif de demande qui ne désigne aucune de leurs écoles » : 19 agents d'origine (motif « Rapprochement familial » du jeu d'essai) + l'agent sans école citée que vous venez d'ajouter ; le premier agent n'y figure pas. |
| 3.2 | Simulation → Vœux. | Vœu 2 du premier agent : `S = … (dont X d'ajustements contextuels)` avec X supérieur d'environ 5 points (20 × 0,25) à celui des autres vœux ; vœu sans poste ouvert : « aucun poste ouvert, pas de score ». |
| 3.3 | Second agent. | Aucun point supplémentaire sur aucun vœu. |
| 3.4 | Configuration du moteur : mettre la bonification à 0, enregistrer, recalculer. | Le X du premier agent revient au niveau des autres vœux ; le scénario passe « obsolète » puis se recalcule. |

## 4. Faits du Prince

| # | Action | Attendu |
|---|--------|---------|
| 4.1 | Page « Fait de Prince » : lire la légende. | Quatre notions distinguées : école de référence, destination décidée, destination projetée, école effective. |
| 4.2 | Saisir MAT00001 → ECO011 (agent d'une école sans excédent, ancienneté faible). | L'aperçu affiche les deux écoles **avant / après** (effectif, besoin, excédent) et les alertes ; l'enregistrement est **accepté** avec le message « À vérifier : … ». |
| 4.3 | Saisir le même agent vers une autre école. | Refus : « Un fait de Prince actif existe déjà pour cet enseignant ». |
| 4.4 | Saisir MAT99999 → ECO011, puis MAT00130 → ECO999. | Refus : enseignant introuvable ; école de destination inconnue. |
| 4.5 | Importer `faits_prince.xlsx` (aperçu puis import). | 2 acceptés (MAT00229, MAT00094), 3 refusés (matricule inconnu, école inconnue, déjà rattaché à cette école). |
| 4.6 | Liste des enseignants → MAT00001. | « Destination décidée : … » et, dessous, « École de référence : … ». |
| 4.7 | « Application aux bases » : écarts d'effectif des écoles touchées. | Bandeau rouge « Effectifs à réconcilier avant de valider le jeu ». Avec ce jeu d'essai (39 écoles sur 40 en écart), c'est le cas pour presque tout fait ; « Validation » affiche alors le contrôle bloquant « Effectifs réconciliés pour les écoles touchées par un fait du Prince » en échec. C'est le comportement voulu, pas une anomalie. |
| 4.8 | Annuler un fait. | Les scénarios se recalculent ; l'enseignant retrouve son école de référence. |

## 5. Rapports → Indicateurs de suivi

| # | Action | Attendu |
|---|--------|---------|
| 5.1 | Sélectionner un scénario calculé, ouvrir « Indicateurs de suivi ». | Panneau **« REM et degré d'aléa, avant / après »** : lignes National + régions ; colonnes REM avant, REM après, écart, aléa avant, aléa après, écart. |
| 5.2 | Contrôle de sens. | « Avant » = bases importées : sans faits du Prince, ni algorithme. Annuler tous les faits du Prince : le REM « avant » et l'aléa « avant » ne changent pas. Ajouter un fait : seul « après » bouge (REM et aléa, région par région). |
| 5.2 bis | Choisir une région dans le filtre territorial, revenir sur « Indicateurs de suivi ». | La première ligne porte le nom de la région ; une seule région est listée, pour le REM comme pour l'aléa ; les deux blocs (REM / aléa et Encadrement et rotation) parlent du même périmètre. |
| 5.3 | Région avec moins de 3 écoles à effectif connu. | « — » et, au survol, le motif. |
| 5.4 | Bouton « Exporter (Excel) ». | Classeur « REM et aléa » + feuille « Définitions » ; valeurs identiques à l'écran. |

## 6. Rapport : consultation, impression, Word

Préparation : scénario calculé avec de nombreuses affectations (idéalement 1 000 et plus : jeu réaliste national).

| # | Action | Attendu |
|---|--------|---------|
| 6.1 | Rapports → Rapport, section « Consulter les affectations ». | **Aucune barre de défilement verticale** sur le tableau. 50 lignes par page ; sélecteur 50 / 100 ; « Propositions 1 à 50 sur N » ; pages Précédente / Suivante. Défilement horizontal seulement si l'écran est étroit. |
| 6.2 | Filtres région → département → commune, recherche (matricule, nom, école). | Le choix d'une région vide département et commune ; retour à la page 1 ; compteur à jour ; « Aucune proposition » si vide. |
| 6.3 | Le texte au-dessus rappelle que l'impression, le PDF et le Word reprennent **toutes** les propositions. | Présent. |
| 6.4 | « Imprimer / PDF » → aperçu avant impression (Chrome : Ctrl+P), avec **un filtre actif et la page 3 affichée**. | La consultation paginée est masquée ; apparaît « Annexe A — Propositions d'affectation » avec **toutes** les lignes (N), sans filtre. |
| 6.5 | Aperçu d'impression de l'annexe. | Pages en **paysage**, en-tête de colonnes répété sur chaque page, aucune ligne coupée entre deux pages, aucune barre de défilement ; le reste du rapport reste en portrait. |
| 6.6 | « Word ». Ouvrir le .docx dans Word. | Corps du rapport en **portrait** ; dernière section « Annexe A — Propositions d'affectation » en **paysage**. |
| 6.7 | Dans Word, parcourir l'annexe. | Première ligne = n° 1, dernière = n° N (N identique au compteur de l'écran, même si 50 lignes sont visibles à l'écran). En-tête répété à chaque page, lignes entières, pied de page « page x / y ». |
| 6.8 | Refaire l'export Word après avoir changé de page et de filtre à l'écran. | Document identique (même nombre de propositions). |
| 6.9 | Scénario non calculé (situation actuelle). | Pas d'annexe, pas de section paysage. |

## 7. Mode démonstration (sans serveur) et données d'exemple

| # | Action | Attendu |
|---|--------|---------|
| 7.1 | `pnpm dev:factice`, ouvrir fiche école, vœux, configuration du moteur. | Pages lisibles ; « Classes ouvertes : Non renseigné » ; capacité en maîtres affichée ; aucun champ « NaN » ni vide inattendu. |
| 7.2 | Routes du Prince en mode factice. | Pas d'erreur bloquante (la saisie réelle d'un fait demande le serveur). |

## 8. Nominations et scénarios obsolètes

| # | Action | Attendu |
|---|--------|---------|
| 8.1 | Modifier un paramètre du moteur (ex. âge senior 52) sans recalculer, ouvrir « Nominations ». | Bandeau rouge « Scénario de référence obsolète : recalculez d'abord ». |
| 8.2 | Proposer / valider / générer une nomination, ou saisir un arbitrage. | Refus « Le scénario de référence est obsolète — recalculez d'abord ». Rejeter / annuler restent possibles. |
| 8.3 | Recalculer les scénarios (page Simulation), revenir. | Bandeau disparu ; les actions fonctionnent. |

## 9. Compte rendu

Pour chaque étape non conforme : numéro, capture, comportement observé, navigateur et version. Les points bloquants sont
ceux qui empêchent un usage correct (donnée fausse, export incomplet, réglage trompeur) ; les autres sont des
améliorations.
