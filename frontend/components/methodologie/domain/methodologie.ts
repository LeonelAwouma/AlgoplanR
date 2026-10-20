/**
 * Contenu de la page Méthodologie, séparé de l'affichage pour être réutilisé
 * tel quel dans les exports (Word, rapport décisionnel).
 *
 * Il reprend le Référentiel technique de modélisation des plans de rotation, de
 * redéploiement et de déploiement. Le texte s'adresse d'abord à un lecteur non
 * informaticien : on explique ce que signifie chaque notion avant d'en donner la
 * formule, qui reste disponible en second plan.
 */

export interface NotionMethodologique {
  /** Question telle qu'un utilisateur se la pose. */
  titre: string
  /** Réponse en langage courant, sans notation mathématique. */
  explication: string
  /** Formule exacte appliquée par le moteur, affichée en second plan. */
  formule?: string
  /** Ce qui change si on modifie le paramétrage. */
  parametrable?: string
}

export const NOTIONS: NotionMethodologique[] = [
  {
    titre: 'Maîtres retenus — combien l’école en aura à la rentrée',
    explication:
      "On part des enseignants de l'État qui tiennent une classe et on retire les départs déjà connus, notamment les retraites. Sans cette déduction, une école dont un maître part à la retraite paraîtrait équilibrée et son poste ne serait ouvert qu'après la rentrée.",
    formule: 'E = enseignants de l’État en poste − départs connus',
    parametrable:
      "Les départs sont lus dans le fichier des établissements quand il les déclare ; sinon, ils sont repérés dans le fichier des enseignants à partir de l'âge de la retraite (60 ans par défaut).",
  },
  {
    titre: 'Norme — de combien de maîtres les élèves ont besoin',
    explication:
      "Le moteur retient un maître pour la première section (jusqu'à 20 élèves), puis un maître par tranche de 60 élèves au-delà, arrondi à l'entier supérieur : 250 élèves demandent ⌈(250 − 20) ÷ 60⌉ = 4 maîtres. La note de cadrage, elle, parle d'un maître pour 60 élèves : cet écart est à faire valider par la DRH. Une école ne descend cependant jamais sous un minimum pédagogique, qui dépend de ses niveaux ouverts : une école complète de 6 niveaux, regroupés deux à deux en classes multigrades, a besoin d'au moins 3 maîtres.",
    formule:
      'P = 1 si N ≤ 20, sinon ⌈(N − 20) ÷ 60⌉ ; m = 6 niveaux, ou 3 si l’école a des classes multigrades ; dotation D = max(P ; m)',
    parametrable:
      "Quand le fichier renseigne les classes multigrades, le minimum pédagogique se calcule école par école : sans multigrade, un maître par niveau ouvert (6 pour une école complète) ; avec multigrades, chaque classe multigrade économise un maître, jusqu'au regroupement deux à deux (3 maîtres). La norme, la tolérance d'arrondi et le regroupement sont des paramètres à valider par la DRH. Sans effectif d'élèves, l'application se replie sur « une classe, un maître » et le signale.",
  },
  {
    titre: 'BMAX — combien de maîtres les salles permettent d’affecter',
    explication:
      "Le besoin des élèves peut dépasser ce que les salles permettent d'accueillir. Une salle en simple flux compte pour un maître, une salle en double flux pour deux ; un local qui ne peut pas servir de salle de classe n'est pas compté. Le besoin reconnu est plafonné par BMAX ; ce qui dépasse n'est pas perdu : il devient un besoin en salles.",
    formule: 'BMAX = salles en simple flux + 2 × salles en double flux ; cible K = min(D ; BMAX)',
    parametrable: 'Le double flux peut être désactivé : chaque salle compte alors pour un seul maître.',
  },
  {
    titre: 'Besoin, excédent, surnombre et salles manquantes',
    explication:
      "Le besoin se mesure par rapport à la cible K, c'est-à-dire à ce que les salles permettent d'affecter ; l'excédent par rapport à la dotation D, c'est-à-dire à ce dont les élèves ont besoin. Cette asymétrie est voulue : un maître n'est mobilisable que s'il est de trop pour les élèves, et pas seulement de trop pour les salles. Les maîtres au-delà des salles mais utiles aux élèves forment un surnombre : ils ne sont pas redéployés, le passage au double flux permet de les employer.",
    formule: 'b = max(0 ; K − E) ; x = max(0 ; E − D) ; a = max(0 ; min(E ; D) − BMAX) ; s = max(0 ; D − BMAX)',
  },
  {
    titre: 'Classement des écoles',
    explication:
      'Une école est nécessiteuse si elle a un besoin (b > 0) : ses postes sont ouverts au redéploiement, puis au recrutement. Elle est excédentaire si elle a un excédent (x > 0) : ses maîtres au-delà de la dotation forment le vivier. Elle est à examiner si elle a un surnombre lié aux salles (a > 0), et équilibrée dans les autres cas. Un manque de salles (s > 0) est signalé à part, comme besoin en infrastructures, quel que soit le classement.',
  },
  {
    titre: 'Sous-systèmes francophone et anglophone',
    explication:
      "Un maître formé pour un sous-système n'enseigne en règle générale pas dans l'autre. Les deux sous-systèmes sont traités séparément à toutes les étapes : une école bilingue forme deux unités de calcul, une par section, chacune avec ses élèves, ses salles et ses maîtres ; aucun besoin n'est compensé d'un sous-système à l'autre ; l'algorithme n'affecte personne hors de son sous-système. Seule une commission d'arbitrage peut décider un changement de sous-système.",
  },
  {
    titre: 'Priorité des écoles — poids de vulnérabilité et indice',
    explication:
      "La vulnérabilité d'une école combine des points d'accessibilité (urbain 5, semi-urbain 10, rural 15, rural enclavé 20) et de sécurité (zone verte 0, jaune 10, rouge 25), pondérés par t1 et t2 (t1 + t2 = 1). Elle fixe le niveau de difficulté de l'école. Comme elle ne mesure pas l'ampleur du besoin, on lui ajoute des points de besoin selon le REM actuel : c'est le poids du poste Up. Les postes sont servis par poids décroissant ; à poids égal, les écoles passent avant les structures, puis l'école au REM le plus élevé.",
    formule:
      'wp = 0,4 × α + 0,6 × σ ; niveau 1 si wp ≥ 14, 2 si wp ≥ 6, sinon 3 ; βp = 0 (REM ≤ 80), 5 (≤ 100), 10 (≤ 150), 15 au-delà ou sans maître ; Up = wp + βp',
    parametrable: 'Points, seuils et tranches sont à valider par la hiérarchie et modifiables dans le Référentiel.',
  },
  {
    titre: 'Demandes de mutation — qui est recevable',
    explication:
      "Les enseignants qui demandent une mutation formulent jusqu'à trois vœux classés. Une demande est recevable si l'enseignant compte au moins 5 ans de stabilité au poste et si son départ ne crée pas de déficit : son école d'attache doit être excédentaire, et ses départs restent dans la limite de son excédent. Les vœux qui portent sur l'autre sous-système sont transmis à la commission.",
    parametrable: 'La durée de stabilité (5 ans) et le nombre de vœux (3) sont des paramètres à confirmer.',
  },
  {
    titre: 'Règle d’arbitrage — comment les candidats à un poste sont départagés',
    explication:
      "Pour un poste donné, les candidats sont classés par score d'appariement Score(e, p) décroissant, et le poste revient au plus fort score. Le poids du poste étant le même pour tous les candidats d'un même poste, l'arbitrage se joue sur le poids de l'individu : son barème augmenté de ses ajustements. Un enseignant dont le vœu n'est pas satisfait se voit chercher une école avec un poste ouvert. À score égal, passe d'abord la plus grande ancienneté générale, puis le plus âgé, puis le meilleur rang de tirage au sort ; le rang du vœu et l'ordre de saisie ne départagent jamais.",
    formule:
      'poste p attribué au candidat e de plus fort Score(e, p) ; ex-æquo : ancienneté générale, âge, rang de tirage',
    parametrable: 'En variante, le score de priorité S = A + Z + B de l’ancien référentiel peut classer les candidats.',
  },
  {
    titre: 'Barème individuel (étage 1) — le poids de l’enseignant',
    explication:
      "Le barème additionne cinq critères pondérés : l'ancienneté de carrière multipliée par le service en zone difficile, l'ancienneté au poste et la stabilité, les charges familiales (chaque enfant à charge retire des points), la formation continue et la cohorte d'âge. Il fait le poids de l'individu dans le score d'appariement et ordonne les départs d'une école excédentaire. Exemple : un enseignant marié de 42 ans, trois enfants, 18 ans de service dont 4 en zone de niveau 1, 9 ans à son poste en zone de niveau 2 et 2 stages a un barème de 97,25.",
    formule:
      'barème = 0,30 × C1 + 0,25 × C2 + 0,20 × C3 + 0,15 × C4 + 0,10 × C5 ; C1 = carrière × max(10 ; 2 n1 + n2) ; C2 = années au poste + 5 dès 5 ans + 1 par année au-delà de 6, − 5 à moins de 5 ans de la retraite ; C3 = situation (marié 5, divorcé ou veuf 8, célibataire 10) − 2 par enfant ; C4 = 2 par formation, 10 au plus ; C5 = 10 (< 35 ans), 8 (35 à 49 ans), 5 (≥ 50 ans)',
    parametrable: 'Poids et points se règlent dans la configuration du moteur.',
  },
  {
    titre: 'Score d’appariement (étage 2) — quel maître pour quel poste',
    explication:
      "Pour un enseignant e et un poste p, le score d'appariement combine le barème de l'enseignant, le poids du poste, la proximité géographique (même commune 60 points, même département 30, sinon 0) et des ajustements contextuels : jeune enseignant (≤ 35 ans) vers une école à classes multigrades + 15 ; senior (≥ 50 ans) vers une structure d'encadrement (IAEB, DREB, délégation) + 15 ; senior vers une classe standard monolingue non multigrade + 8 ; transition du rural vers l'urbain après 5 ans au poste + 12 ; bonification ciblée (rapprochement de conjoint, suivi médical) : + 20 uniquement sur l'école visée, qui doit être citée dans le motif parmi les écoles demandées (sans école identifiée, aucun point).",
    formule: 'Score(e, p) = Z1 × barème + Z2 × Up + Z3 × proximité + Z4 × ajustements (Z1 = Z2 = Z3 = Z4 = 0,25)',
    parametrable:
      'Les poids Z1 à Z4, les points de proximité et les ajustements se règlent dans la configuration du moteur.',
  },
  {
    titre: 'Appariement — l’acceptation différée',
    explication:
      "Chaque candidat demande l'école placée en tête de sa liste ; chaque école garde provisoirement les mieux classés dans la limite de ses postes et refuse les autres ; chaque candidat refusé demande l'école suivante. Une acceptation reste provisoire jusqu'à la fin : c'est ce qui donne son nom à l'algorithme. Le résultat ne dépend pas de l'ordre de saisie, chaque refus s'explique par un candidat mieux classé, et ajouter une école à sa liste ne peut jamais nuire à l'enseignant.",
    parametrable:
      "Variante : examiner les vœux de l'école la plus lourde à la plus légère. Elle fait perdre la propriété de sincérité.",
  },
  {
    titre: 'Solutions proches, combinaisons et redéploiement obligatoire',
    explication:
      "Un candidat recevable dont aucun vœu n'est satisfait reçoit le poste ouvert le plus proche de ses vœux (commune, puis IAEB, puis département, puis région), jamais en zone rouge et jamais s'il est à moins de 5 ans de la retraite. Les écoles encore non couvertes sont présentées à la commission avec des combinaisons : redéploiement direct, chaîne de mouvements, permutation. En dernier recours, le redéploiement obligatoire déplace un maître d'une école excédentaire du même sous-système, par passes successives — même commune, même IAEB, même département, puis même région ; hors région, l'enseignant reste dans le vivier et passe en commission d'arbitrage — et, à proximité égale, le maître au meilleur score d'appariement ; les postes en zone rouge n'en font jamais l'objet.",
  },
  {
    titre: 'Niveau régional et niveau central',
    explication:
      "Les vœux à l'intérieur de la région sont traités au niveau régional. Un enseignant n'est affecté que dans sa région : les vœux interrégionaux et les besoins qu'aucune école de la région ne peut couvrir ne sont pas traités automatiquement ; ils restent dans le vivier et vont en commission d'arbitrage, qui peut décider un mouvement entre régions.",
  },
  {
    titre: 'Nouveaux recrutés',
    explication:
      'Les nouveaux recrutés ne sont déployés que sur les postes restés vacants après le redéploiement. Le mieux classé au concours choisit le premier parmi ses trois choix ; à défaut, un poste lui est proposé dans le département, puis dans la région, puis il entre dans un vivier national pour arbitrage. Seuls les postes du sous-système de son concours lui sont proposés.',
  },
  {
    titre: 'Projection sur l’année N+2',
    explication:
      "Un enseignant qui ne peut pas être redéployé immédiatement peut voir un poste se libérer l'année suivante, à la suite d'un départ à la retraite. Les postes projetés en N+2 se calculent comme le besoin, à partir de l'effectif attendu après le plan et des départs prévisibles. Une projection n'est pas un engagement : elle est confirmée ou révisée lors du plan suivant.",
    formule: 'b(N+2) = max(0 ; K − (E(N+1) − départs prévisibles pendant N+1))',
  },
  {
    titre: 'Projection de N+1 à N+3',
    explication:
      "Pour chaque école, l'effectif part de la situation après le plan (mouvements et nouveaux recrutés compris), puis perd les enseignants qui atteignent l'âge de la retraite au cours de chaque année. Le besoin projeté suit la même règle que le besoin de la rentrée. L'attrition hors retraite est appliquée au territoire, par sous-système, et cumulée d'une année sur l'autre en l'absence de recrutement intermédiaire.",
    formule:
      'E(N+k) = E(N+k−1) − retraites ; besoin = max(0 ; K − E) ; recrutement à prévoir = Σ max(0 ; B − X) + attrition cumulée',
  },
  {
    titre: 'Agrégation, recrutement à prévoir et déséquilibre des dotations',
    explication:
      "Les résultats des écoles sont additionnés séparément pour chaque sous-système, après écrêtage à zéro : l'excédent d'une école n'annule pas le déficit d'une autre. Le recrutement à prévoir ajoute au besoin restant après redéploiement les départs imprévisibles attendus. Le taux de déséquilibre des dotations mesure la part de la dotation mal répartie entre les écoles d'un territoire ; il tombe à zéro quand besoin et excédent s'annulent. Il se distingue du degré d'aléa du tableau de bord (1 − R²), qui mesure si le nombre d'enseignants des écoles suit leur nombre d'élèves.",
    formule: 'R = Σ max(0 ; B − X) par sous-système ; REC = R + ⌈τ* × E ÷ 100⌉ ; déséquilibre = (B + X) ÷ Σ K',
    parametrable: "Le taux d'attrition hors retraite τ* se règle dans le Référentiel.",
  },
  {
    titre: 'Arbitrage et traçabilité',
    explication:
      "Le moteur produit des propositions, pas des décisions. Une commission peut valider une proposition, la rejeter ou la corriger ; la proposition initiale, la décision, son motif et l'instance qui l'a prise sont conservés. Après chaque décision, les besoins sont recalculés et l'algorithme est relancé sur les postes et les candidats restants.",
  },
]

export interface RegleMoteur {
  titre: string
  texte: string
}

/** Détail des étapes et garde-fous, pour un lecteur qui veut le fonctionnement exact. */
export const REGLES_MOTEUR: RegleMoteur[] = [
  {
    titre: 'Ordre des étapes',
    texte:
      '1. décisions de commission déjà prises ; 2. postes ouverts classés par indice de priorité ; 3. synthèse des vœux et scores ; 4. acceptation différée sur les vœux intrarégionaux ; 5. dans le scénario étendu, acceptation différée sur les vœux interrégionaux ; 6. solution la plus proche ; 7. combinaisons pour la commission ; 8. redéploiement obligatoire ; 9. recalcul des besoins, nouveaux recrutés et projection N+2.',
  },
  {
    titre: 'Limite des départs',
    texte:
      "À chaque étape, les départs d'une école restent dans la limite de son excédent x. Quand plus de candidats d'une même école obtiennent un vœu, les moins bien classés voient leur départ non validé et l'algorithme est relancé sans eux.",
  },
  {
    titre: 'Fait de Prince (décision de la DRH)',
    texte:
      "Un fait de Prince est un redéploiement décidé par la DRH en dehors de l'algorithme : aucun contrôle n'est appliqué. La décision est ensuite prise pour acquise dans tous les calculs : l'enseignant est rattaché à sa nouvelle école, les effectifs des deux écoles sont mis à jour avant le calcul des besoins, et cet enseignant n'est jamais remis en mouvement.",
  },
  {
    titre: 'Redéploiement obligatoire et barème individuel',
    texte:
      "Le référentiel laisse à la DRH la hiérarchie des critères du redéploiement obligatoire. L'application ordonne les départs imposés dans une école excédentaire selon le barème individuel : ancienneté de carrière, ancienneté au poste, situation matrimoniale, nombre d'enfants, formation continue et âge, chacun pondéré et paramétrable. Les enseignants à moins de 5 ans de la retraite en sont protégés.",
  },
  {
    titre: 'Libellés de situation matrimoniale',
    texte:
      'Les graphies sont rapprochées localement, en ignorant les accents, la casse, le genre et la ponctuation : « Marié », « Mariée » et « MARIE(E) » comptent pour la même situation. Une valeur non reconnue vaut zéro point et est listée dans la configuration du moteur.',
  },
  {
    titre: 'Vérifications systématiques',
    texte:
      "Après chaque simulation, onze contrôles sont exécutés : unicité de l'enseignant et du poste, respect de l'excédent, absence de déficit créé, origine légitime de chaque proposition, conservation du besoin, respect du périmètre, absence de mouvement interne, respect des faits de Prince, respect des sous-systèmes et de la règle de la zone rouge.",
  },
  {
    titre: 'Reproductibilité',
    texte:
      "Chaque scénario conserve une copie figée des paramètres avec lesquels il a été exécuté, et recalcule le diagnostic avec eux. Deux exécutions du même scénario sur les mêmes données produisent exactement le même résultat : l'acceptation différée ne dépend pas de l'ordre de saisie, et le départage ultime utilise le rang de tirage consigné au procès-verbal.",
  },
  {
    titre: 'Indicateurs non calculés',
    texte:
      "Les taux de stabilité, de rotation et d'intégration exigent un historique des mouvements sur plusieurs années. Le modèle d'élasticité à la productivité n'est pas défini par les sources : il n'est pas intégré à l'algorithme, conformément au référentiel (§2.7).",
  },
  {
    titre: 'Limites connues',
    texte:
      "La proximité repose sur l'égalité des libellés de commune, de département et de région, pas sur des distances réelles. Les situations individuelles absentes des fichiers ne sont pas prises en compte : elles relèvent de l'arbitrage.",
  },
  {
    titre: 'Traitement local',
    texte:
      "Toutes les étapes — lecture des classeurs, contrôle qualité, calculs, cartographie, textes de diagnostic, exports — s'exécutent sur le poste de l'utilisateur. Aucune intelligence artificielle générative n'intervient.",
  },
]

/** Correspondance entre vocabulaire technique et vocabulaire de la Vue simplifiée. */
export const VOCABULAIRE: { technique: string; simplifie: string }[] = [
  { technique: 'Vivier de redéploiement', simplifie: 'Enseignants potentiellement redéployables' },
  { technique: 'École excédentaire', simplifie: 'École disposant d’un excédent mobilisable' },
  { technique: 'École nécessiteuse', simplifie: 'École en déficit' },
  { technique: 'Cible K', simplifie: 'Maîtres réellement affectables' },
  { technique: 'Dotation D', simplifie: 'Maîtres dont les élèves ont besoin' },
  { technique: 'BMAX', simplifie: 'Maîtres que les salles permettent d’accueillir' },
  { technique: 'Indice de priorité u', simplifie: 'Ordre de service des écoles' },
  { technique: 'Score de priorité S', simplifie: 'Classement des demandes de mutation' },
  { technique: 'Acceptation différée', simplifie: 'Satisfaction des vœux' },
  { technique: 'REM', simplifie: 'Élèves par maître' },
]
