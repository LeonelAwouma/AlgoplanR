"""Tableau prévisionnel complet de « Planification – Projection sur 5 ans » : base puis N+1 à N+5.

Cinq groupes d'indicateurs (rapport MINEDUB d'octobre 2026, « Analyse prévisionnelle des effectifs, des postes et de
l'attrition ») calculés sur les données importées, jamais recopiés du rapport :
  A. population scolaire : N(t+1) = N(t) × (1 + G_PRI_PCT), écoles à effectif inconnu jamais complétées ;
  B. ressources humaines : stock administratif S, retraites nominatives, autres départs, décharges de directeurs H,
     enseignants disponibles U = S − H ;
  C. besoins pédagogiques : C = ⌈N ÷ REM_REF_PRI⌉ (ratio) distinct de Σ P, Σ m, Σ D, Σ K (école par école) ;
  D. scénarios de recrutement (S-min, S-maintien, S-besoin, sous plafond), chacun avec son propre stock ;
  E. taux d'encadrement : réel à la base, de référence, projeté par scénario, écart à la référence.
Chaque case porte sa nature (`natures`) : observé (source de l'année de base), projeté (calculé pour une année future),
estimé (déduit d'informations partielles), hypothèse (paramètre retenu), provisoire (dépend d'une hypothèse importante
non confirmée), non disponible (`None` avec sa raison, jamais zéro) ou sans objet (base d'un flux). Les tableaux, graphiques et exports de
l'interface lisent tous ce résultat.

Années : la base est l'année scolaire du jeu (celle des données importées) ; N+1 est l'année suivante, et ainsi de
suite jusqu'à N+5. Le stock observé à la base est retenu comme situation de début de N+1 (HYPOTHESE_TRANSITION).
"""
from __future__ import annotations

from typing import Dict, List, Optional

from ..commun.encadrement import CHIFFRES_ENCADREMENT
from ..diagnostic.indicateurs import MESSAGE_MULTIGRADES_NON_RENSEIGNES, besoin_rem
from ..donnees.annee_scolaire import _FORME
from ..donnees.modeles import Enseignant
from .parametres import ANNEES_PLAN, STOCK_NATIONAL_PRIMAIRE
from .projection import SCENARIOS, ProjectionEcole, age_exploitable, annee_depart
from .rapport import LIBELLES_SCENARIOS, eleves_base, raison_rems, rem_base, rems

OBSERVE, ESTIME, HYPOTHESE, PROVISOIRE, NON_DISPONIBLE = "observe", "estime", "hypothese", "provisoire", "non_disponible"
PROJETE = "projete"

#: Résultat calculé en supposant, faute de données, qu'aucun départ à la retraite n'est modélisé : ni observé ni prévu.
CONDITIONNEL = "conditionnel"
#: Actes enregistrés, jamais calculés : le quota retenu par l'administration et les nominations mises en œuvre.
DECISION, REALISE = "decision", "realise"

#: Case sans objet : la base d'un flux (départs, recrutements), qui ne commence qu'en N+1. Ce n'est pas une donnée
#: manquante : elle n'a pas de raison d'indisponibilité.
SANS_OBJET = "sans_objet"

#: Passage de l'année des données à N+1, affiché dans les hypothèses et les rapports.
HYPOTHESE_TRANSITION = ("Le stock d'enseignants et les effectifs d'élèves observés à la base sont retenus comme "
                        "situation de début de N+1 : les mouvements entre la date des données et la rentrée de N+1 "
                        "ne sont pas connus et ne sont pas inventés.")

DETAIL_SCENARIOS = {
    "min": "Remplace les seules retraites de l'année.",
    "maintien": "Remplace les retraites, les autres départs et les décharges de directeurs : U reste constant.",
    "besoin": "Besoin de recrutement calculé (avant plafond), jamais sous les retraites.",
    "plafond": "Quota calculé (sous plafond, plancher compris), supposé recruté tant que les quotas sont supposés "
               "réalisés ; ce n'est pas un recrutement réalisé.",
}


def annee_base(annee_scolaire: str) -> Optional[str]:
    """Année de base : l'année scolaire du jeu, celle des données importées ; None si inconnue."""
    m = _FORME.match(str(annee_scolaire or "").strip())
    return f"{int(m.group(1))}-{int(m.group(1)) + 1}" if m else None


def libelles_annees(annee_scolaire: str, horizon: int) -> List[str]:
    """« Base (2024-2025) », puis « N+1 (2025-2026) »… : la base est l'année du jeu, N+1 l'année scolaire suivante,
    jusqu'à N+5. Aucune année n'est codée en dur ni décalée."""
    m = _FORME.match(str(annee_scolaire or "").strip())
    base = annee_base(annee_scolaire)
    out = [f"Base ({base})" if base else "Base"]
    for k in range(horizon):
        if m:
            debut = int(m.group(1)) + 1 + k
            out.append(f"{ANNEES_PLAN[k]} ({debut}-{debut + 1})")
        else:
            out.append(ANNEES_PLAN[k])
    return out


#: Avertissement sur Enseignants_Actuels : affiché par l'interface et les exports (même texte, vérifié par les tests).
AVERTISSEMENT_PERSONNELS = ("Les effectifs enseignants sont ceux des personnels rapprochés dans la cartographie "
                            "(Enseignants_Actuels). Ces personnels ne sont pas nécessairement tous des maîtres "
                            "chargés de classe : leur statut n'est pas fourni par les fichiers importés.")


#: Bandeau des jeux d'origine fictive vérifiable (source « demonstration » ou marqueur déclaré) : texte exact repris
#: par les vues Décideur et Analyste et par les exports Excel et Word.
TEXTE_DONNEES_FICTIVES = ("Données fictives — simulation de démonstration. Ces résultats ne représentent pas la "
                          "situation réelle du Cameroun.")

#: Nombre maximal d'écoles détaillées dans le rapprochement (les anomalies d'abord) ; la synthèse porte sur toutes.
MAX_ECOLES_RAPPROCHEMENT = 500


# --- Fiabilité des retraites : quatre situations à ne jamais confondre ---------------------------------------------
#: 1. zéro départ établi sur une population exploitable ; 2. départs partiellement identifiés ; 3. départs totalement
#: inconnus (fichier nominatif absent) ; 4. estimation statistique, seulement par une règle validée à part (aucune
#: aujourd'hui : le taux de 1,08 % du rapport n'est jamais utilisé).
RETRAITES_COMPLETES, RETRAITES_PARTIELLES, RETRAITES_NON_CALCULABLES = "complet", "partiel", "non_calculable"

MESSAGE_RETRAITES_NON_CALCULABLES = ("Retraites non calculables : le fichier nominatif des enseignants est indisponible. "
                                     "Les scénarios de recrutement qui dépendent des retraites sont incomplets.")
MESSAGE_SIMULATION_CONDITIONNELLE = ("Simulation conditionnelle : aucun départ à la retraite n'a été modélisé faute de "
                                     "données nominatives. Le résultat ne représente pas une prévision des retraites.")
RAISON_RETRAITES_INCONNUES = ("Retraites non calculables : le fichier nominatif des enseignants est indisponible.")
RAISON_RETRAITES_PERIMETRE = ("Retraites non calculables : aucun agent du fichier nominatif n'est rattaché au périmètre.")

#: Première colonne (0 = base, 1 = N+1…) qui dépend des retraites, par ligne du tableau. Les autres lignes (élèves,
#: besoin au REM, Σ P, Σ m, Σ D, Σ K, plafond, directeurs, décharges) restent calculées et certaines.
DEPEND_DES_RETRAITES = {
    "effectif_debut": 2, "departs_attrition": 2, "rem_reel": 2,
    "departs_retraite": 1, "retraites_identifiees": 1, "retraites_non_imputables": 1, "effectif_fin": 1,
    "disponibles_fin": 1, "besoin_non_couvert": 1, "ressources_vivier": 1, "quota_avant_plafond": 1,
    "plancher_retraites": 1, "quota_calcule": 1, "depassement_plafond": 1, "quota_plafond_prioritaire": 1,
    "recrutement_min": 1, "recrutement_maintien": 1, "recrutement_besoin": 1, "recrutement_plafond": 1,
    "rem_min": 1, "rem_maintien": 1, "rem_besoin": 1, "rem_plafond": 1, "ecart_reference": 1,
}
#: Lignes dont la valeur est inconnue (jamais zéro) quand les retraites sont non calculables : les retraites ellesmêmes,
#: ce qui les remplace (plancher, S-min, S-maintien) et ce qui n'a de sens qu'avec elles.
INCONNUES_SANS_RETRAITES = frozenset({
    "departs_retraite", "retraites_identifiees", "retraites_non_imputables", "plancher_retraites",
    "depassement_plafond", "quota_plafond_prioritaire", "recrutement_min", "recrutement_maintien", "rem_min",
    "rem_maintien"})

LIBELLE_FIABILITE_SCENARIO = {"complet": "Complet", "provisoire": "Provisoire", "conditionnel": "Simulation conditionnelle",
                              "non_calculable": "Non calculable"}


def fiabilite_retraites(ecoles: List[ProjectionEcole], rappro: dict, audit: dict, hyp: dict,
                        agents_du_jeu: int) -> dict:
    """État des retraites du périmètre : non calculables (aucun agent nominatif), partiellement identifiées (âges
    absents, agents sans école, stock déclaré et liste discordants) ou identifiées sur une population exploitable.

    Une retraite non calculable n'est jamais un zéro : aucune valeur de remplacement n'est posée ici."""
    s = rappro["synthese"]
    stock, agents = s["stock_declare"], s["agents_nominatifs"]
    avec_age = max(0, agents - s["agents_sans_age"])
    hypothese_age = not hyp["retraite"].get("annee_ages")
    # Part du stock déclaré couverte par la liste nominative ; au-delà de 100 % la liste dépasse le stock (écart
    # décrit à part) : aucune couverture n'a de sens.
    population = {"stock_declare": stock, "agents_nominatifs": agents, "agents_avec_age": avec_age,
                  "couverture": _pct(avec_age, stock) if avec_age <= stock else None}
    base = {"hypothese_age": hypothese_age, "population": population,
            "retraites_identifiees": s["retraites_horizon"], "zero_etabli": False, "message": None}
    if agents == 0 and stock > 0:
        raison = RAISON_RETRAITES_INCONNUES if agents_du_jeu == 0 else RAISON_RETRAITES_PERIMETRE
        return {**base, "statut": RETRAITES_NON_CALCULABLES, "libelle": "Retraites non calculables",
                "raisons": [raison], "raison": raison,
                "message": MESSAGE_RETRAITES_NON_CALCULABLES.replace(
                    "le fichier nominatif des enseignants est indisponible",
                    "le fichier nominatif des enseignants est indisponible" if agents_du_jeu == 0 else
                    "aucun agent du fichier nominatif n'est rattaché au périmètre"),
                "message_conditionnel": MESSAGE_SIMULATION_CONDITIONNELLE}
    raisons = []
    if s["agents_sans_age"]:
        raisons.append(f"{_n(s['agents_sans_age'])} agent(s) sans âge exploitable")
    if s.get("agents_hors_ecoles"):
        raisons.append(f"{_n(s['agents_hors_ecoles'])} agent(s) rattaché(s) à aucune école")
    if s["ecoles_ecart_positif"] or s["ecoles_ecart_negatif"]:
        raisons.append(f"stock déclaré et liste nominative différents dans "
                       f"{_n(s['ecoles_ecart_positif'] + s['ecoles_ecart_negatif'])} école(s)")
    if s["retraites_non_imputables"]:
        raisons.append(f"{_n(s['retraites_non_imputables'])} retraite(s) au-delà du stock de leur école")
    if raisons:
        part = (f" ({str(population['couverture']).replace('.', ',')} %)" if population["couverture"] is not None
                else "")
        message = (f"Retraites partiellement identifiées : {_n(avec_age)} agent(s) avec un âge exploitable pour "
                   f"{_n(stock)} personnel(s) déclaré(s){part} ; "
                   + " ; ".join(raisons) + ". Le nombre de retraites identifiées n'est pas un total exhaustif : les "
                   "indicateurs qui en dépendent sont provisoires.")
        return {**base, "statut": RETRAITES_PARTIELLES, "libelle": "Retraites partiellement identifiées",
                "raisons": raisons, "raison": None, "message": message}
    zero = s["retraites_horizon"] == 0
    return {**base, "statut": RETRAITES_COMPLETES, "libelle": "Retraites identifiées sur une population exploitable",
            "raisons": [], "raison": None, "zero_etabli": zero,
            "message": (f"0 retraite identifiée sur une population exploitable ({_n(avec_age)} agent(s) avec un âge pour "
                        f"{_n(stock)} personnel(s) déclaré(s)).") if zero else None}


def fiabilite_scenario(s: str, fiab: dict) -> dict:
    """Fiabilité d'un scénario, fixée par le serveur : l'interface et les exports ne la reconstituent pas."""
    if fiab["statut"] == RETRAITES_NON_CALCULABLES:
        code = "non_calculable" if s in ("min", "maintien") else "conditionnel"
        raison = (fiab["raison"] if code == "non_calculable" else MESSAGE_SIMULATION_CONDITIONNELLE)
    elif fiab["statut"] == RETRAITES_PARTIELLES or fiab["hypothese_age"]:
        code = "provisoire"
        raison = "Retraites provisoires : " + " ; ".join(fiab["raisons"] + (
            ["année de mesure des âges non précisée"] if fiab["hypothese_age"] else [])) + "."
    else:
        code, raison = "complet", None
    return {"fiabilite": code, "fiabilite_libelle": LIBELLE_FIABILITE_SCENARIO[code], "fiabilite_raison": raison}


def qualifier_retraites(groupes: List[dict], fiab: dict, horizon: int) -> None:
    """Propage la fiabilité des retraites aux seules cases qui en dépendent : inconnues, conditionnelles ou
    provisoires. Les lignes indépendantes (élèves, besoin au REM, Σ P, plafond…) ne changent pas."""
    statut, hyp_age = fiab["statut"], fiab["hypothese_age"]
    provisoire = statut == RETRAITES_PARTIELLES or hyp_age
    for g in groupes:
        for l in g["lignes"]:
            debut = DEPEND_DES_RETRAITES.get(l["cle"])
            l["depend_retraites"] = debut is not None
            if debut is None:
                continue
            natures, valeurs = l["natures"], l["valeurs"]
            if statut == RETRAITES_NON_CALCULABLES:
                if l["cle"] in INCONNUES_SANS_RETRAITES:
                    raison = fiab["raison"]
                    for i in range(debut, len(valeurs)):
                        valeurs[i], natures[i] = None, NON_DISPONIBLE
                    l["raisons"] = [r if i < debut else raison for i, r in
                                    enumerate(l.get("raisons") or [None] * len(valeurs))]
                else:
                    for i in range(debut, len(valeurs)):
                        if valeurs[i] is not None:
                            natures[i] = CONDITIONNEL
                    l["detail"] = f"{l['detail']} {MESSAGE_SIMULATION_CONDITIONNELLE}".strip()
            elif provisoire:
                for i in range(debut, len(valeurs)):
                    if valeurs[i] is not None and natures[i] in (PROJETE, ESTIME):
                        natures[i] = PROVISOIRE
                motifs = fiab["raisons"] + (["année de mesure des âges non précisée"] if hyp_age else [])
                l["detail"] = f"{l['detail']} Provisoire : {' ; '.join(motifs)}.".strip()
            l["nature"] = natures[0] if valeurs[0] is not None else natures[-1]


def _ligne(cle: str, libelle: str, base, valeurs: List, *, nature: str = OBSERVE, projete: str = PROJETE,
           natures_annees: Optional[List[str]] = None, decimal: bool = False, unite: str = "nombre", detail: str = "",
           raisons: Optional[List[Optional[str]]] = None) -> dict:
    """Une ligne : base puis une valeur par année. `natures` : nature de chaque case (la base vaut `nature`, chaque
    année `projete`, ou `natures_annees`). `raisons` (même longueur) dit pourquoi une valeur est absente : une case
    vide avec sa raison est « non disponible », une case vide sans raison est « sans objet » (base d'un flux)."""
    vals = [base] + list(valeurs)
    natures = [nature] + list(natures_annees or [projete] * len(valeurs))
    motifs = list(raisons) if raisons is not None else [""] * len(vals)
    natures = [n if v is not None else NON_DISPONIBLE if r is not None else SANS_OBJET
               for v, n, r in zip(vals, natures, motifs)]
    out = {"cle": cle, "libelle": libelle, "valeurs": vals, "nature": natures[0] if base is not None else natures[-1],
           "natures": natures, "decimal": decimal, "unite": unite, "detail": detail}
    if raisons is not None:
        out["raisons"] = [r if v is None else None for v, r in zip(vals, raisons)]
    return out


def _fr(x) -> str:
    """Nombre en écriture française (virgule décimale) pour les textes affichés : 74,4 ; 2,25."""
    return f"{float(x):g}".replace(".", ",")


def _ecart(rem: Optional[float], ref: float) -> Optional[float]:
    return None if rem is None else round(rem - ref, CHIFFRES_ENCADREMENT)


def _pct(n: float, total: float) -> Optional[float]:
    return round(100.0 * n / total, 1) if total else None


def resume_scenario(s: str, lignes: List[dict], ref: float, fiab: Optional[dict] = None) -> dict:
    """Recrutements, effectifs projetés, REM obtenu, écart à la référence et besoin restant d'un scénario, avec sa
    fiabilité. Quand les retraites sont non calculables, S-min et S-maintien (définis par le remplacement des
    retraites) n'ont aucun résultat : des valeurs inconnues, jamais des zéros."""
    etat = fiabilite_scenario(s, fiab) if fiab else {"fiabilite": "complet", "fiabilite_libelle": "Complet",
                                                      "fiabilite_raison": None}
    if etat["fiabilite"] == "non_calculable":
        n = len(lignes)
        return {"scenario": s, "libelle": LIBELLES_SCENARIOS[s], "recrutements": [None] * n, "recrutements_total": None,
                "effectif_fin": [None] * n, "disponibles_fin": [None] * n, "rem": [None] * n,
                "ecart_reference": [None] * n, "rem_final": None, "ecart_final": None, "besoin_restant_final": None,
                "besoin_restant_raison": etat["fiabilite_raison"], **etat}
    r = rems(lignes)
    fin = lignes[-1] if lignes else {}
    complet = all(l.get("population_complete", True) for l in lignes)
    # Enseignants qui manquent encore pour atteindre le REM de référence à la fin de l'horizon : C − U.
    restant = (max(0, besoin_rem(fin.get("eleves_brut", 0.0), ref) - fin.get("disponibles_fin", 0))
               if lignes and complet else None)
    return {"scenario": s, "libelle": LIBELLES_SCENARIOS[s],
            "recrutements": [l["recrutement"] for l in lignes], "recrutements_total": sum(l["recrutement"] for l in lignes),
            "effectif_fin": [l.get("effectif_fin") for l in lignes],
            "disponibles_fin": [l.get("disponibles_fin") for l in lignes],
            "rem": r, "ecart_reference": [_ecart(x, ref) for x in r],
            "rem_final": r[-1] if r else None, "ecart_final": _ecart(r[-1], ref) if r else None,
            "besoin_restant_final": restant,
            "besoin_restant_raison": None if restant is not None or not lignes else
            next((l.get("rem_raison") for l in lignes if l.get("rem_raison")), None), **etat}


def donnees_non_disponibles(ecoles: List[ProjectionEcole], enseignants: List[Enseignant]) -> List[dict]:
    """Indicateurs du rapport MINEDUB qu'aucune donnée importée ne permet de calculer : « Non disponible » et la source
    manquante, jamais une valeur inventée ni ajoutée aux totaux."""
    out = [
        {"indicateur": "Chargés de classe déclarés au SIGE", "valeur": None,
         "source_manquante": "Extraction SIGE des chargés de classe par école (non importée dans AlgoPlanR)."},
        {"indicateur": "Agents hors cartographie", "valeur": None,
         "source_manquante": "Rapprochement SIGE ↔ fichier de cartographie des personnels (non disponible)."},
        {"indicateur": "Écart de couverture SIGE − cartographie", "valeur": None,
         "source_manquante": "Les deux sources ci-dessus."},
        {"indicateur": "Qualité réelle des personnels rattachés (chargés de classe ou non)", "valeur": None,
         "source_manquante": ("Enseignants_Actuels compte les personnes rattachées à l'école ; leur qualité de maître "
                              "chargé de classe n'est pas vérifiée.")},
    ]
    sans_mg = sum(1 for e in ecoles if e.minimum_provisoire)
    if sans_mg:
        out.append({"indicateur": "Groupes pédagogiques réels (classes multigrades)", "valeur": None,
                    "source_manquante": (f"Classes_Multigrades non renseigné ou illisible pour {sans_mg} école(s) : "
                                         + MESSAGE_MULTIGRADES_NON_RENSEIGNES)})
    flux = sum(1 for e in ecoles if e.bmax_incertain)
    if flux:
        out.append({"indicateur": "Mode d'utilisation des salles (simple ou double flux)", "valeur": None,
                    "source_manquante": (f"Salles_Double_Flux non renseigné pour {flux} école(s) : le total des salles "
                                         "est compté en simple flux (BMAX approché).")})
    ids = {e.id for e in ecoles}
    rattaches = [t for t in enseignants if t.ecole_attache in ids]
    sans_age = sum(1 for t in rattaches if t.age is None)
    if sans_age:
        out.append({"indicateur": "Âge des enseignants", "valeur": None,
                    "source_manquante": f"{sans_age} enseignant(s) sans âge : leurs retraites ne sont pas comptées."})
    return out


def audit_retraites(ecoles: List[ProjectionEcole], enseignants: List[Enseignant], departs: List, hyp: dict,
                    horizon: int, decalage: int = 0) -> dict:
    """Audit des départs à la retraite du périmètre, année par année : départs comptés, agents ayant déjà l'âge légal
    au début de N+1 (CORR_60), agents l'atteignant pendant l'année, âges inexploitables et doublons de matricule.

    `departs` : départs nominatifs du périmètre (école occupée après le plan). Les autres comptes portent sur les
    enseignants rattachés aux écoles du périmètre dans le fichier importé. Aucun âge n'est inventé."""
    ids = {e.id for e in ecoles}
    rattaches = [t for t in enseignants if t.ecole_attache in ids]
    vus: Dict[str, int] = {}
    for t in rattaches:
        vus[t.matricule] = vus.get(t.matricule, 0) + 1
    doublons = sum(n - 1 for n in vus.values() if n > 1)
    sans_age = sum(1 for t in rattaches if age_exploitable(t) is None)
    stock = sum(e.effectif_initial for e in ecoles)
    nominatifs = len(vus)
    corr = bool(hyp["drh"].get("CORR_60", True))
    deja = sum(1 for t in {t.matricule: t for t in rattaches}.values()
               if age_exploitable(t) is not None and age_exploitable(t) - decalage >= hyp["retraite"]["age_legal"])
    lignes = []
    for k in range(horizon):
        de_l_annee = [x for x in departs if x.annee == k]
        lignes.append({
            "annee": ANNEES_PLAN[k], "departs": len(de_l_annee),
            "deja_eligibles": sum(1 for x in de_l_annee if x.deja_eligible),
            "atteignant_age_legal": sum(1 for x in de_l_annee if not x.deja_eligible),
            "taux_stock_declare": _pct(len(de_l_annee), stock), "taux_personnels_nominatifs": _pct(len(de_l_annee),
                                                                                                    nominatifs)})
    legal = hyp["retraite"]["age_legal"]
    quand = ("au 31 décembre" if hyp["retraite"].get("date_reference") == "fin_annee_civile" else "à la rentrée")
    exemple = ("" if hyp["retraite"].get("date_reference") == "fin_annee_civile"
               else f" : un agent de {legal - 1} ans au début de N+1 part en N+2")
    methode = (f"Nominative : départ compté l'année scolaire où l'agent a {legal} ans révolus {quand}{exemple}. "
               + (f"Les {deja} agent(s) ayant déjà cet âge au début de N+1 sont imputés à N+1 (CORR_60). " if corr
                  else f"Les {deja} agent(s) ayant déjà cet âge au début de N+1 ne sont pas comptés (CORR_60 désactivé). ")
               + (f"Âges du fichier ramenés de {decalage} an(s) au début de N+1 (mesurés après N+1). " if decalage > 0
                  else f"Âges du fichier avancés de {-decalage} an(s) au début de N+1 (mesurés avant N+1). "
                  if decalage < 0 else "Âges mesurés au début de N+1 (année de mesure déclarée). "
                  if hyp["retraite"].get("annee_ages")
                  else "Année de mesure des âges non précisée : âges supposés mesurés au début de N+1. ")
               + "Un agent sans âge exploitable n'est pas compté ; un matricule en double n'est compté qu'une fois. "
               "Le taux de 1,08 % du rapport n'est jamais utilisé.")
    return {"lignes": lignes, "deja_eligibles_debut": deja, "sans_age": sans_age, "doublons": doublons,
            "personnels_nominatifs": nominatifs, "stock_declare": stock, "methode": methode,
            "decalage_ages": decalage, "annee_ages": hyp["retraite"].get("annee_ages")}


def rapprochement_effectifs(ecoles: List[ProjectionEcole], enseignants: List[Enseignant], *,
                            hors_ecoles: Optional[int] = None) -> dict:
    """Rapprochement, école par école, du stock déclaré (Enseignants_Actuels) et des agents nominatifs rattachés.

    Les deux sources sont indépendantes : le stock déclaré fixe le besoin et le stock S ; la liste nominative fournit
    les âges, donc les retraites. Rien n'est complété ni corrigé : les écarts sont décrits, et une retraite identifiée
    au-delà du stock déclaré restant de son école n'en est pas retirée (« non imputable »). `hors_ecoles` : agents du
    jeu rattachés à aucune école projetée (structure, école absente) ; None quand le périmètre est filtré."""
    par_ecole: Dict[str, Dict[str, int]] = {}
    for t in enseignants:
        par_ecole.setdefault(t.ecole_attache, {}).setdefault(t.matricule, 0)
        par_ecole[t.ecole_attache][t.matricule] += 1
    sans_age_par: Dict[str, set] = {}
    for t in enseignants:
        if age_exploitable(t) is None:
            sans_age_par.setdefault(t.ecole_attache, set()).add(t.matricule)
    lignes = []
    for e in ecoles:
        agents = par_ecole.get(e.id, {})
        nominatifs, doublons = len(agents), sum(n - 1 for n in agents.values() if n > 1)
        ident = list(e.retraites_identifiees or e.retraites)
        non_imp = list(e.retraites_non_imputables or [0] * len(ident))
        ecart = e.effectif_declare - nominatifs
        anomalies = []
        if ecart > 0:
            anomalies.append("declare_superieur_nominatif")
        elif ecart < 0:
            anomalies.append("nominatif_superieur_declare")
        if sum(non_imp):
            anomalies.append("retraites_superieures_au_stock")
        if doublons:
            anomalies.append("matricules_en_double")
        if sans_age_par.get(e.id):
            anomalies.append("agents_sans_age")
        lignes.append({
            "id_ecole": e.id, "nom_ecole": e.nom, "region": e.region, "stock_declare": e.effectif_declare,
            "stock_apres_plan": e.effectif_initial, "agents_nominatifs": nominatifs, "ecart": ecart,
            "retraites_n1": ident[0] if ident else 0, "retraites_horizon": sum(ident),
            "retraites_retirees_du_stock": sum(ident) - sum(non_imp), "retraites_non_imputables": sum(non_imp),
            "agents_sans_age": len(sans_age_par.get(e.id, ())), "doublons": doublons, "anomalies": anomalies})
    concordantes = [l for l in lignes if l["ecart"] == 0]
    positives = [l for l in lignes if l["ecart"] > 0]
    negatives = [l for l in lignes if l["ecart"] < 0]
    depasse = [l for l in lignes if l["retraites_non_imputables"]]
    synthese = {
        "ecoles": len(lignes), "stock_declare": sum(l["stock_declare"] for l in lignes),
        "stock_apres_plan": sum(l["stock_apres_plan"] for l in lignes),
        "agents_nominatifs": sum(l["agents_nominatifs"] for l in lignes),
        "ecoles_concordantes": len(concordantes),
        "ecoles_ecart_positif": len(positives), "ecart_positif": sum(l["ecart"] for l in positives),
        "ecoles_ecart_negatif": len(negatives), "ecart_negatif": sum(l["ecart"] for l in negatives),
        "agents_hors_ecoles": hors_ecoles, "doublons": sum(l["doublons"] for l in lignes),
        "agents_sans_age": sum(l["agents_sans_age"] for l in lignes),
        "retraites_n1": sum(l["retraites_n1"] for l in lignes),
        "retraites_horizon": sum(l["retraites_horizon"] for l in lignes),
        "retraites_retirees_du_stock": sum(l["retraites_retirees_du_stock"] for l in lignes),
        "retraites_non_imputables": sum(l["retraites_non_imputables"] for l in lignes),
        "ecoles_retraites_superieures_au_stock": len(depasse),
        "concordance_complete": not positives and not negatives,
    }
    tri = sorted(lignes, key=lambda l: (not l["anomalies"], -l["retraites_non_imputables"], -abs(l["ecart"]),
                                        l["id_ecole"]))
    return {"synthese": synthese, "ecoles": tri[:MAX_ECOLES_RAPPROCHEMENT], "ecoles_tronquees": len(tri) >
            MAX_ECOLES_RAPPROCHEMENT,
            "methode": ("Stock déclaré : Enseignants_Actuels du fichier des établissements (fixe le besoin et le stock "
                        "S). Agents nominatifs : matricules distincts du fichier des enseignants rattachés à l'école. "
                        "Écart = stock déclaré − agents nominatifs ; aucun des deux n'est corrigé. Les retraites sont "
                        "identifiées sur la liste nominative et retirées du stock déclaré de l'école, sans jamais "
                        "dépasser ce qui y reste : l'excédent est « non imputable », compté à part et non remplacé.")}


def neutraliser_rapprochement(rappro: dict, fiab: dict) -> dict:
    """Sans fichier nominatif, le rapprochement n'a rien à rapprocher : écarts, concordances et retraites seraient des
    zéros ou des écarts artificiels (« stock déclaré supérieur à la liste » dans chaque école). Ils sont inconnus (None),
    le stock déclaré et le nombre d'écoles restent affichés."""
    if fiab["statut"] != RETRAITES_NON_CALCULABLES:
        return rappro
    inconnus = ("ecoles_concordantes", "ecoles_ecart_positif", "ecart_positif", "ecoles_ecart_negatif", "ecart_negatif",
                "agents_hors_ecoles", "doublons", "agents_sans_age", "retraites_n1", "retraites_horizon",
                "retraites_retirees_du_stock", "retraites_non_imputables", "ecoles_retraites_superieures_au_stock",
                "concordance_complete")
    return {**rappro, "synthese": {**rappro["synthese"], **{k: None for k in inconnus}}, "ecoles": [],
            "ecoles_tronquees": False}


def _n(x: int) -> str:
    """Entier en écriture française (espace des milliers, vrai signe moins) pour les messages."""
    return f"{x:,}".replace(",", "\u202f").replace("-", "−")


def avertissements_coherence(suivi: List[dict], traj_plafond: List[dict], rappro: dict, contexte: dict, hyp: dict,
                             annees: List[str], audit: dict, fiab: dict) -> List[dict]:
    """Avertissements explicites affichés en tête de la projection et des exports : jamais un recalage silencieux."""
    out = []
    inconnues = fiab["statut"] == RETRAITES_NON_CALCULABLES
    if contexte.get("donnees_fictives"):
        out.append({"code": "donnees_fictives", "gravite": "important", "message": TEXTE_DONNEES_FICTIVES})
    saisie = contexte.get("annee_saisie") or ""
    if contexte.get("sens_annee_scolaire") == "non_confirme":
        out.append({"code": "sens_annee_non_confirme", "gravite": "important", "message": (
            f"Le sens de l'année {saisie} n'est pas confirmé pour ce jeu : l'année des données réelles n'est pas "
            f"connue. Le calendrier historique de l'application est conservé (base {contexte.get('annee_donnees') or ''}"
            ", l'année saisie étant lue comme la rentrée préparée) pour ne pas décaler une simulation existante. "
            "Confirmez le sens dans la liste des jeux : si l'année saisie est celle des données, les années des "
            "colonnes avancent d'un an ; aucun chiffre ne change.")})
    elif contexte.get("sens_annee_scolaire") == "rentree_preparee" and contexte.get("sens_annee_origine") == "migration":
        out.append({"code": "sens_annee_historique", "gravite": "information", "message": (
            f"Ce jeu a été créé quand l'année saisie ({saisie}) désignait la rentrée préparée : la base est "
            f"{contexte.get('annee_donnees') or ''}, comme dans les simulations antérieures. Sens établi par "
            "l'historique de l'application ; modifiable par un utilisateur autorisé.")})
    sy = rappro["synthese"]
    if inconnues:
        out.append({"code": "retraites_non_calculables", "gravite": "important", "message": fiab["message"]})
        out.append({"code": "simulation_conditionnelle", "gravite": "important",
                    "message": fiab["message_conditionnel"]})
    elif fiab["statut"] == RETRAITES_PARTIELLES:
        out.append({"code": "retraites_partielles", "gravite": "important", "message": fiab["message"]})
    elif fiab["zero_etabli"]:
        out.append({"code": "zero_retraite_etabli", "gravite": "information", "message": fiab["message"]})
    if inconnues:
        return out
    if sy["ecoles_ecart_positif"] or sy["ecoles_ecart_negatif"]:
        out.append({"code": "effectifs_discordants", "gravite": "important", "message": (
            f"Stock déclaré et liste nominative diffèrent dans "
            f"{_n(sy['ecoles_ecart_positif'] + sy['ecoles_ecart_negatif'])} école(s) sur {_n(sy['ecoles'])} "
            f"({_n(sy['stock_declare'])} personnels déclarés, {_n(sy['agents_nominatifs'])} agents nominatifs) : "
            f"+{_n(sy['ecart_positif'])} dans {_n(sy['ecoles_ecart_positif'])} école(s), {_n(sy['ecart_negatif'])} "
            f"dans {_n(sy['ecoles_ecart_negatif'])} école(s). Les retraites, identifiées sur la "
            "liste nominative, sont retirées du stock déclaré : les deux populations ne sont pas identiques.")})
    if sy["retraites_non_imputables"]:
        out.append({"code": "retraites_non_imputables", "gravite": "important", "message": (
            f"{_n(sy['retraites_non_imputables'])} retraite(s) identifiée(s) dépassent le stock déclaré de leur école "
            f"({_n(sy['ecoles_retraites_superieures_au_stock'])} école(s)) : elles ne sont ni retirées du stock ni "
            "remplacées par le plancher.")})
    if sy.get("agents_hors_ecoles"):
        out.append({"code": "agents_hors_ecoles", "gravite": "important", "message": (
            f"{_n(sy['agents_hors_ecoles'])} agent(s) du fichier nominatif ne sont rattachés à aucune école projetée : "
            "leurs retraites ne sont pas comptées.")})
    for k, l in enumerate(traj_plafond[:len(suivi)]):
        x = l.get("depassement_plafond") or 0
        if x:
            annee = annees[k + 1] if k + 1 < len(annees) else ANNEES_PLAN[k]
            out.append({"code": "depassement_plafond", "gravite": "information", "annee": ANNEES_PLAN[k], "message": (
                f"Le quota proposé dépasse le plafond de recrutement de {_n(x)} poste{'s' if x > 1 else ''} en {annee} "
                f"en raison du remplacement des départs à la retraite ({_n(l['departs_retraite'])} retraites pour un "
                f"plafond de {_n(l['plafond'])}). Avec un plafond strict, le quota serait de "
                f"{_n(l['quota_plafond_prioritaire'])}. Ce dépassement nécessite une validation administrative ou "
                "budgétaire.")})
    if not hyp["retraite"].get("annee_ages"):
        out.append({"code": "annee_ages_absente", "gravite": "information", "message": (
            "Année de mesure des âges non précisée : les âges sont supposés mesurés au début de N+1 ; les retraites "
            "sont provisoires.")})
    if audit.get("sans_age"):
        out.append({"code": "agents_sans_age", "gravite": "information", "message": (
            f"{_n(audit['sans_age'])} agent(s) sans âge exploitable : leurs retraites ne sont pas comptées (aucun âge "
            "n'est supposé) ; les retraites sont provisoires.")})
    return out


def construire(ecoles: List[ProjectionEcole], enseignants: List[Enseignant], traj: Dict[str, List[dict]],
               suivi: List[dict], hyp: dict, *, annee_scolaire: str = "", norme: Optional[float] = None,
               contexte: Optional[dict] = None, decalage: int = 0, departs: Optional[List] = None,
               enseignants_import: Optional[List[Enseignant]] = None, hors_ecoles: Optional[int] = None) -> dict:
    """Tableau complet. `traj` : lignes de chaque scénario (calculer_annees sur le périmètre) ; `suivi` : lignes de la
    trajectoire sous plafond après report des décisions (quotas retenus) — celles du tableau principal.
    `enseignants_import` : liste nominative à l'import, rapprochée du stock déclaré (à défaut `enseignants`)."""
    drh = hyp["drh"]
    ref = float(drh["REM_REF_PRI"])
    norme = ref if norme is None else float(norme)
    horizon = len(suivi)
    nb = len(ecoles)
    inconnues = sum(1 for e in ecoles if not e.eleves_connus)
    provisoires = sum(1 for e in ecoles if e.minimum_provisoire)
    # Minimum provisoire ≠ besoin final incertain : un minimum de secours est sans effet quand l'effectif d'élèves ou
    # les salles fixent le besoin de l'école.
    besoin_provisoire = sum(1 for e in ecoles if e.statut_besoin == "provisoire")
    besoin_estime = sum(1 for e in ecoles if e.statut_besoin == "estime")
    sans_effet = sum(1 for e in ecoles if e.minimum_provisoire and e.statut_besoin == "confirme")
    base_eleves = eleves_base(ecoles)
    stock = sum(e.effectif_initial for e in ecoles)
    nature_besoin = PROVISOIRE if besoin_provisoire else ESTIME
    rem0 = rem_base(ecoles)
    contexte = contexte or {}
    audit = audit_retraites(ecoles, enseignants, departs or [], hyp, horizon, decalage)
    rappro = rapprochement_effectifs(ecoles, enseignants_import if enseignants_import is not None else enseignants,
                                     hors_ecoles=hors_ecoles)
    fiab = fiabilite_retraites(ecoles, rappro, audit, hyp, len(enseignants_import if enseignants_import is not None
                                                                else enseignants))
    raison_base = None if rem0 is not None else "Aucune école du périmètre n'a d'effectif d'élèves connu."

    a = [
        _ligne("eleves", "Effectifs d'élèves (écoles à effectif connu)", round(base_eleves),
               [round(l.get("eleves_brut", l["eleves"])) for l in suivi], nature=OBSERVE,
               detail="Base : effectifs importés (observés) ; années suivantes : projection N(t+1) = N(t) × "
                      "(1 + croissance), arrondie à l'unité à l'affichage seulement."),
        _ligne("croissance", "Taux de croissance annuel des élèves", None, [drh["G_PRI_PCT"]] * horizon,
               nature=HYPOTHESE, projete=HYPOTHESE, decimal=True, unite="pourcentage",
               detail="Hypothèse G_PRI_PCT (2,7 % par défaut), appliquée à chaque école dont l'effectif est connu.",
               raisons=[None] + [None] * horizon),
        _ligne("ecoles_eleves_inconnus", "Écoles dont l'effectif d'élèves est inconnu", inconnues,
               [inconnues] * horizon, nature=OBSERVE,
               detail="Aucun effectif n'est inventé pour ces écoles : elles ne comptent ni dans les élèves projetés "
                      "ni dans le taux d'encadrement."),
    ]
    b = [
        _ligne("effectif_debut", "Personnels enseignants en début d'année (stock administratif)", stock,
               [l["effectif_debut"] for l in suivi], nature=OBSERVE, natures_annees=[ESTIME] + [PROJETE] * (horizon - 1),
               detail="Base : Enseignants_Actuels (personnels rapprochés dans la cartographie, pas nécessairement "
                      "tous chargés de classe). N+1 : stock observé retenu comme début de N+1, après les mouvements "
                      "du scénario retenu (estimé). Dès N+2 : projeté, recrutements de l'année précédente supposés "
                      "réalisés (quota retenu, sinon quota calculé)."),
        _ligne("departs_retraite", "Départs à la retraite retirés du stock", None,
               [l["departs_retraite"] for l in suivi],
               detail="Retraites identifiées nominativement d'après les âges connus (jamais par le taux de 1,08 %), "
                      "retirées du stock déclaré de leur école sans dépasser ce qui y reste ; voir l'audit des "
                      "retraites. Une retraite non calculable n'est jamais comptée comme zéro.",
               raisons=[None] + [None] * horizon),
        _ligne("retraites_identifiees", "Retraites identifiées nominativement (liste des enseignants)", None,
               [l.get("retraites_identifiees", l["departs_retraite"]) for l in suivi],
               detail="Agents du fichier nominatif atteignant l'âge légal, matricules distincts, rattachés aux écoles "
                      "du périmètre.", raisons=[None] + [None] * horizon),
        _ligne("retraites_non_imputables", "dont non imputables au stock déclaré", None,
               [l.get("retraites_non_imputables", 0) for l in suivi],
               detail="Retraites identifiées au-delà du stock déclaré restant de leur école (sources discordantes) : "
                      "ni retirées du stock, ni remplacées par le plancher ; voir le rapprochement des effectifs.",
               raisons=[None] + [None] * horizon),
        _ligne("departs_attrition", "Autres départs par attrition (hors retraite)", None,
               [l["departs_attrition"] for l in suivi],
               detail=f"Projetés par hypothèse statistique : taux d'autres départs "
                      f"({_fr(suivi[0]['taux_attrition'] if suivi else drh['A_AUT_PRI_PCT'])} %) × stock de début. "
                      "Les retraites n'y sont pas recomptées.", raisons=[None] + [None] * horizon),
        _ligne("directeurs_decharges", "Directeurs déchargés de classe (nouveaux)", None,
               [l["directeurs_decharges"] for l in suivi],
               detail="Prises de fonction de l'année sans classe (DIR_NOM_AN × DIR_H_PRI_PCT, rapportés au périmètre).",
               raisons=[None] + [None] * horizon),
        _ligne("decharges_cumulees", "Décharges cumulées depuis la base", 0, [l["decharges_cumulees"] for l in suivi],
               detail="Un directeur déchargé reste dans le stock ; il n'est retranché qu'une fois "
                      "des enseignants disponibles."),
        _ligne("effectif_fin", "Enseignants en fin d'année (stock administratif)", None,
               [l["effectif_fin"] for l in suivi],
               detail="S(t+1) = S(t) − retraites − autres départs + recrutements supposés réalisés.",
               raisons=[None] + [None] * horizon),
        _ligne("disponibles_fin", "Enseignants disponibles pour tenir une classe (fin d'année)", stock,
               [l["disponibles_fin"] for l in suivi], detail="U = S − décharges cumulées (base : U = S)."),
    ]
    nb_ = nature_besoin
    c = [
        _ligne("besoin_rem", "Enseignants nécessaires selon le REM de référence", besoin_rem(base_eleves, ref),
               [l["besoin_rem"] for l in suivi], nature=ESTIME,
               detail=f"⌈élèves ÷ {_fr(ref)}⌉ : estimation par ratio, distincte de la somme des besoins des écoles."),
        _ligne("somme_pe", "Besoin pédagogique lié aux élèves (Σ P)", sum(e.pe_initial for e in ecoles),
               [l["somme_pe"] for l in suivi], nature=ESTIME,
               detail=f"P = max(1 ; ⌈(N − tolérance) ÷ {_fr(norme)}⌉), école par école."),
        _ligne("somme_me", "Minimum pédagogique (Σ m)", sum(e.me_initial for e in ecoles),
               [l["somme_me"] for l in suivi], nature=nb_, projete=nb_ if nb_ == PROVISOIRE else PROJETE,
               detail="m = max(plancher ; G) ; G de secours (6) quand Classes_Multigrades n'est pas renseigné."),
        _ligne("somme_de", "Dotation théorique (Σ D)", sum(e.de_initial for e in ecoles),
               [l["somme_de"] for l in suivi], nature=nb_, projete=nb_ if nb_ == PROVISOIRE else PROJETE,
               detail="D = max(P ; m)."),
        _ligne("somme_ke", "Cible réalisable (Σ K)", sum(e.cible_initial for e in ecoles),
               [l["somme_ke"] for l in suivi], nature=nb_, projete=nb_ if nb_ == PROVISOIRE else PROJETE,
               detail="K = min(D ; BMAX)."),
        _ligne("besoin_non_couvert", "Besoin non couvert (Σ b)", sum(e.deficit_initial for e in ecoles),
               [l["besoin_non_couvert"] for l in suivi], nature=nb_,
               projete=nb_ if nb_ == PROVISOIRE else PROJETE,
               detail="b = max(0 ; K − enseignants restants après les retraites), école par école."),
        _ligne("ressources_vivier", "Ressources mobilisables (vivier)", None, [l["ressources_vivier"] for l in suivi],
               projete=nb_,
               detail="N+1 : excédents sûrs des écoles après leurs retraites de N+1 (un retraité n'est pas aussi une "
                      "ressource), et personnes du vivier retenues. Les années suivantes : aucune ressource nouvelle.",
               raisons=[None] + [None] * horizon),
        _ligne("part_provisoire", "Part des écoles au minimum pédagogique provisoire", _pct(provisoires, nb),
               [_pct(provisoires, nb)] * horizon, nature=OBSERVE, decimal=True, unite="pourcentage",
               detail=MESSAGE_MULTIGRADES_NON_RENSEIGNES if provisoires else "Toutes les écoles renseignent leurs "
                                                                            "groupes pédagogiques."),
        _ligne("part_besoin_incertain", "Part des écoles au besoin final incertain (provisoire ou estimé)",
               _pct(besoin_provisoire + besoin_estime, nb), [_pct(besoin_provisoire + besoin_estime, nb)] * horizon,
               nature=OBSERVE, decimal=True, unite="pourcentage",
               detail="Écoles dont le besoin ou l'excédent change selon l'organisation pédagogique plausible, ou dont "
                      "l'effectif d'élèves est inconnu. Une école au minimum provisoire dont le besoin est fixé par "
                      "les élèves ou les salles n'y figure pas."),
    ]
    plancher = bool(drh["PLANCHER_RET"])
    d = [_ligne(f"recrutement_{s}", f"Recrutements projetés – {LIBELLES_SCENARIOS[s]}", None,
                [l["recrutement"] for l in traj[s][:horizon]], detail=DETAIL_SCENARIOS[s],
                raisons=[None] + [None] * horizon) for s in SCENARIOS]
    d += [
        _ligne("quota_avant_plafond", "Besoin de recrutement calculé (avant plafond)", None,
               [l["quota_avant_plafond"] for l in traj["plafond"][:horizon]],
               detail="Besoin de l'année − déficit initial + rattrapage étalé − ressources du vivier, jamais négatif.",
               raisons=[None] + [None] * horizon),
        _ligne("plafond", "Plafond de recrutement du périmètre", None,
               [l["plafond"] for l in traj["plafond"][:horizon]], projete=HYPOTHESE,
               detail=f"PLAF_PRI ({drh['PLAF_PRI']} au national) × stock du périmètre ÷ {STOCK_NATIONAL_PRIMAIRE}.",
               raisons=[None] + ["Aucun plafond (PLAF_PRI = 0)."] * horizon),
        _ligne("plancher_retraites", "Plancher : retraites de l'année (PLANCHER_RET)", None,
               [l["departs_retraite"] if plancher else None for l in suivi],
               detail="Le quota calculé ne descend jamais sous les retraites de l'année, même au-delà du plafond."
                      if plancher else "PLANCHER_RET désactivé : aucun plancher.",
               raisons=[None] + [None if plancher else "PLANCHER_RET désactivé."] * horizon),
        _ligne("depassement_plafond", "Dépassement du plafond dû au remplacement des retraites", None,
               [l["depassement_plafond"] if l["plafond"] is not None else None for l in traj["plafond"][:horizon]],
               detail="Quota calculé − plafond, quand le plancher des retraites porte le quota au-delà du plafond.",
               raisons=[None] + [None if l["plafond"] is not None else "Aucun plafond (PLAF_PRI = 0)."
                                 for l in traj["plafond"][:horizon]]),
        _ligne("quota_plafond_prioritaire", "Quota si le plafond primait (règle alternative, non appliquée)", None,
               [l["quota_plafond_prioritaire"] for l in traj["plafond"][:horizon]], projete=ESTIME,
               detail="Q' = min(max(besoin calculé ; retraites) ; plafond), année par année sur la trajectoire du "
                      "tableau : présenté pour la décision D1 (le plancher ou le plafond prime-t-il ?), sans effet sur "
                      "les trajectoires.",
               raisons=[None] + [None] * horizon),
        _ligne("quota_calcule", "Quota calculé (sous plafond, plancher compris)", None,
               [l["quota_calcule"] for l in suivi],
               detail=("Q = max(min(besoin calculé ; plafond) ; retraites)." if plancher
                       else "Q = min(besoin calculé ; plafond).") + " Proposition de calcul, pas une décision.",
               raisons=[None] + [None] * horizon),
        _ligne("quota_retenu", "Quota retenu (décision administrative)", None, [l["quota_retenu"] for l in suivi],
               projete=DECISION,
               detail="Décision enregistrée sur la page « Quotas » ; vide tant qu'elle n'est pas prise.",
               raisons=[None] + ["Aucune décision administrative enregistrée pour cette année."] * horizon),
        _ligne("nominations_realisees", "Recrutements réalisés (nominations mises en œuvre)", None,
               [l.get("nominations_realisees") or None for l in suivi], projete=REALISE,
               detail="Seules les nominations mises en œuvre et enregistrées comptent : un quota calculé ou retenu "
                      "n'est jamais compté comme réalisé.",
               raisons=[None] + ["Aucune nomination mise en œuvre n'est enregistrée pour cette année."] * horizon),
    ]
    resumes = {s: resume_scenario(s, traj[s][:horizon], ref, fiab) for s in SCENARIOS}
    e = [
        _ligne("rem_reel", "REM en début d'année (élèves par enseignant disponible)", rem0,
               [l.get("rem") for l in suivi], nature=OBSERVE, decimal=True,
               detail="Base : écoles à effectif connu (élèves et enseignants de ces seules écoles). Années : élèves de "
                      "l'année ÷ enseignants disponibles au début de l'année, trajectoire du tableau.",
               raisons=[raison_base] + [l.get("rem_raison") for l in suivi]),
        _ligne("rem_reference", "REM de référence", ref, [ref] * horizon, nature=HYPOTHESE, projete=HYPOTHESE,
               decimal=True),
    ]
    for s in ("min", "maintien", "besoin", "plafond"):
        r = raison_rems(traj[s][:horizon]) or "Taux non calculable pour cette année."
        e.append(_ligne(f"rem_{s}", f"REM projeté en fin d'année – {LIBELLES_SCENARIOS[s]}", rem0, resumes[s]["rem"],
                        nature=OBSERVE, decimal=True,
                        detail="Élèves de l'année ÷ enseignants disponibles en fin d'année, après départs et "
                               "recrutements du scénario (même dénominateur pour les quatre scénarios).",
                        raisons=[raison_base] + [r] * horizon))
    r = raison_rems(traj["plafond"][:horizon]) or "Taux non calculable pour cette année."
    e.append(_ligne("ecart_reference", "Écart au REM de référence (sous plafond, fin d'année)", _ecart(rem0, ref),
                    resumes["plafond"]["ecart_reference"], nature=OBSERVE, decimal=True,
                    detail="REM projeté sous plafond − REM de référence (positif : plus d'élèves par enseignant).",
                    raisons=[raison_base] + [r] * horizon))
    groupes = [
        {"code": "A", "titre": "Population scolaire", "lignes": a},
        {"code": "B", "titre": "Ressources humaines", "lignes": b},
        {"code": "C", "titre": "Besoins pédagogiques", "lignes": c},
        {"code": "D", "titre": "Scénarios de recrutement", "lignes": d},
        {"code": "E", "titre": "Taux d'encadrement", "lignes": e},
    ]
    qualifier_retraites(groupes, fiab, horizon)
    return {
        "annees": libelles_annees(annee_scolaire, horizon), "annee_scolaire_plan": annee_scolaire or None,
        "groupes": groupes, "scenarios": [resumes[s] for s in SCENARIOS], "rem_reference": ref,
        "rem_indisponible": next((l["rem_raison"] for l in suivi if l.get("rem_raison")), None),
        "annee_base": annee_base(annee_scolaire), "hypothese_transition": HYPOTHESE_TRANSITION,
        "contexte": contexte, "audit_retraites": audit,
        "rapprochement": neutraliser_rapprochement(rappro, fiab), "retraites_fiabilite": fiab,
        "avertissements": avertissements_coherence(suivi, traj["plafond"], rappro, contexte, hyp,
                                                   libelles_annees(annee_scolaire, horizon), audit, fiab),
        "texte_donnees_fictives": TEXTE_DONNEES_FICTIVES if contexte.get("donnees_fictives") else None,
        "avertissement_personnels": AVERTISSEMENT_PERSONNELS,
        "ecoles": nb, "ecoles_minimum_provisoire": provisoires, "ecoles_eleves_inconnus": inconnues,
        "fiabilite": {"minimum_provisoire": provisoires, "minimum_provisoire_sans_effet": sans_effet,
                      "besoin_provisoire": besoin_provisoire, "besoin_estime": besoin_estime,
                      "besoin_confirme": nb - besoin_provisoire - besoin_estime},
        "message_minimum_provisoire": MESSAGE_MULTIGRADES_NON_RENSEIGNES if provisoires else None,
        "minimum_pedagogique": {
            "observe": sum(1 for x in ecoles if x.provenance_groupes == "observe"),
            "estime": sum(1 for x in ecoles if x.provenance_groupes == "estime"),
            "secours": sum(1 for x in ecoles if x.provenance_groupes == "secours"),
            "indetermine": sum(1 for x in ecoles if x.provenance_groupes == "indetermine"),
        },
        "besoins_par_statut": {st: sum(x.deficit_initial for x in ecoles if x.statut_besoin == st)
                               for st in ("confirme", "estime", "provisoire")},
        "non_disponibles": donnees_non_disponibles(ecoles, enseignants),
        "hypotheses": hypotheses_methodologiques(hyp),
    }


def hypotheses_methodologiques(hyp: dict, besoin: Optional[dict] = None, annee_scolaire: str = "") -> List[dict]:
    """Hypothèses du calcul, avec leur valeur : reprises par l'interface (vue Analyste) et les exports."""
    from ..parametrage.config import DEFAULT_CONFIG, NORME_HISTORIQUE
    d, r = hyp["drh"], hyp["retraite"]
    b = {**DEFAULT_CONFIG["besoin"], **(besoin or {})}
    return [
        {"code": "rem_reference", "libelle": "REM de référence (rapport MINEDUB d'octobre 2026)",
         "valeur": f"{_fr(d['REM_REF_PRI'])} élèves par enseignant", "a_valider": False},
        {"code": "norme_historique", "libelle": "Norme historique d'AlgoPlanR (avant octobre 2026)",
         "valeur": f"{NORME_HISTORIQUE} élèves par maître", "a_valider": False},
        {"code": "tolerance", "libelle": "Tolérance pédagogique AlgoPlanR",
         "valeur": f"{_fr(b['effectif_premiere_section'])} élèves", "a_valider": False},
        {"code": "plancher", "libelle": "Plancher du minimum pédagogique",
         "valeur": f"{b['plancher_pedagogique']} enseignants", "a_valider": True},
        {"code": "groupes_secours", "libelle": "Groupes de secours si Classes_Multigrades est absent",
         "valeur": f"{b['groupes_secours']} groupes (école complète de six années supposée)", "a_valider": True},
        {"code": "regroupement", "libelle": "Années réunies par classe multigrade (estimation G = 6 − M)",
         "valeur": f"{b['niveaux_par_maitre_multigrade']} années, sans chevauchement", "a_valider": True},
        {"code": "croissance", "libelle": "Croissance annuelle des élèves", "valeur": f"{_fr(d['G_PRI_PCT'])} %",
         "a_valider": False},
        {"code": "attrition", "libelle": "Attrition totale / dont retraites / autres départs",
         "valeur": f"{_fr(d['A_TOT_PRI_PCT'])} % / {_fr(d['R_PRI_PCT'])} % / {_fr(d['A_AUT_PRI_PCT'])} %", "a_valider": False},
        {"code": "directeurs", "libelle": "Directeurs déchargés de classe",
         "valeur": f"{d['DIR_NOM_AN']} prises de fonction par an, dont {_fr(d['DIR_H_PRI_PCT'])} % sans classe",
         "a_valider": True},
        {"code": "plafond", "libelle": "Plafond annuel de recrutement (primaire national)",
         "valeur": f"{d['PLAF_PRI']} ; rattrapage sur {d['ETAL_N']} an(s)", "a_valider": False},
        {"code": "salles", "libelle": "Salles sans mode de flux connu",
         "valeur": "comptées en simple flux (BMAX approché)", "a_valider": True},
        {"code": "classes_ouvertes", "libelle": "Classes_Ouvertes lu comme le nombre de groupes-classes",
         "valeur": ("oui" if b["groupes_depuis_classes_ouvertes"] else
                    "non (désactivé tant que la définition de la colonne n'est pas validée)"), "a_valider": True},
        {"code": "excedent_estime", "libelle": "Excédent reposant sur des groupes estimés ou de secours",
         "valeur": ("mobilisable" if b["mobiliser_excedent_incertain"] else
                    "soumis à validation administrative (aucune sortie automatique)"), "a_valider": True},
        {"code": "personnels", "libelle": "Enseignants_Actuels compté comme maîtres chargés de classe",
         "valeur": "personnels rapprochés dans la cartographie, statut non vérifié", "a_valider": True},
        {"code": "annee_base", "libelle": "Année de base (année scolaire des données du jeu)",
         "valeur": (f"{annee_base(annee_scolaire)} ; N+1 = année suivante" if annee_base(annee_scolaire)
                    else "non précisée"), "a_valider": True},
        {"code": "transition", "libelle": "Passage de la base à N+1", "valeur": HYPOTHESE_TRANSITION,
         "a_valider": True},
        {"code": "annee_ages", "libelle": "Année de mesure des âges (retraites)",
         "valeur": (f"{r['annee_ages']} (âges ramenés au début de N+1)" if r.get("annee_ages")
                    else "non précisée : âges supposés mesurés au début de N+1"), "a_valider": True},
        {"code": "date_depart_retraite", "libelle": f"Âge légal de départ ({r['age_legal']} ans) : date d'appréciation",
         "valeur": ("au 31 décembre de l'année (départ l'année où l'âge est atteint)"
                    if r.get("date_reference") == "fin_annee_civile" else
                    "à la rentrée de l'année scolaire (règle active : un agent de "
                    f"{r['age_legal'] - 1} ans au début de N+1 part en N+2)"), "a_valider": True},
        {"code": "plancher_retraites", "libelle": "Plancher du quota : retraites de l'année (PLANCHER_RET)",
         "valeur": ("actif : Q = max(min(besoin calculé ; plafond) ; retraites)" if d["PLANCHER_RET"]
                    else "désactivé : Q = min(besoin calculé ; plafond)"), "a_valider": True},
    ]
