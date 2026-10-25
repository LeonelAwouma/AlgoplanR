"""Paramétrage du moteur (DEFAULT_CONFIG du moteur d'origine). Python pur."""
from __future__ import annotations

import copy
from typing import Any, Dict, List, Tuple

DEFAULT_CONFIG: Dict[str, Any] = {
    "seuils": {
        "anciennete_poste_recevabilite_ans": 5,
        "age_senior_ans": 50,
        "age_jeune_ans": 35,
        "age_retraite_ans": 60,
    },
    "poids_bareme_individuel": {
        "C1_carriere_zone": 0.30,
        "C2_anciennete_poste": 0.25,
        "C3_charges_familiales": 0.20,
        "C4_formation_continue": 0.15,
        "C5_cohorte_age": 0.10,
    },
    "points_situation_familiale": {"celibataire": 10, "divorce": 8, "veuf": 8, "marie": 5},
    "poids_score_appariement": {
        "Z1_bareme_individu": 0.25,
        "Z2_poids_poste_Up": 0.25,
        "Z3_proximite": 0.25,
        "Z4_ajustements": 0.25,
    },
    "points_proximite": {"meme_commune": 60, "meme_departement": 30, "autre": 0},
    "ajustements_contextuels": {
        "appui_multigrades_jeune": 15,
        "senior_vers_encadrement": 15,
        "allegement_senior_standard": 8,
        "transition_rural_urbain": 12,
        "bonification_ciblee": 20,
    },
    "vulnerabilite": {"t1": 0.30, "t2": 0.70},
    # Besoin d'une école (formules du guide MINEDUB et du rapport MINEDUB d'octobre 2026, lues par
    # domaine/diagnostic/indicateurs.py) :
    #   C = ceil(N / norme_eleves_par_maitre)                       (besoin selon le REM de référence, indicatif),
    #   P = max(1 ; ceil((N - effectif_premiere_section) / norme_eleves_par_maitre)),
    #   m = max(plancher_pedagogique ; G), G = groupes pédagogiques observés, estimés ou de secours :
    #       Classes_Ouvertes (observé, si groupes_depuis_classes_ouvertes),
    #       sinon nombre_niveaux - M x (niveaux_par_maitre_multigrade - 1) avec M = Classes_Multigrades (estimé),
    #       sinon groupes_secours (provisoire : Classes_Multigrades non renseigné),
    #   BMAX = salles simple flux + 2 x salles double flux (1 x si le double flux n'est pas autorisé).
    # Un excédent qui dépend d'un minimum non observé n'alimente le vivier que dans la part sûre (voir indicateurs.py),
    # sauf si mobiliser_excedent_incertain.
    "besoin": {
        "norme_eleves_par_maitre": 74.4,
        "effectif_premiere_section": 20,
        "plancher_pedagogique": 3,
        "nombre_niveaux": 6,
        "niveaux_par_maitre_multigrade": 2,
        "groupes_secours": 6,
        "minimum_selon_multigrades": True,
        "groupes_depuis_classes_ouvertes": True,
        "mobiliser_excedent_incertain": False,
        "double_flux_autorise": True,
    },
    "regles_dreb": {
        "phase1_voeux_actif": True,
        "phase2_proximite_iaeb": True,
        "phase2_proximite_departement": True,
        "phase3_extension_regionale": True,
        # Un enseignant n'est affecté que dans sa région : les autres restent dans le vivier (commission d'arbitrage).
        "regions_etanches": True,
    },
}

#: Norme d'encadrement historique d'AlgoPlanR (note de cadrage), remplacée par le REM de référence du rapport MINEDUB
#: d'octobre 2026 (74,4 élèves par enseignant). Conservée pour la traçabilité et les comparaisons avant/après.
NORME_HISTORIQUE = 60
NORME_REFERENCE_2026 = 74.4


def config_historique() -> Dict[str, Any]:
    """Référentiel d'avant octobre 2026 : norme de 60, minimum pédagogique de 6 niveaux (ou 3 pour une école
    « multigrade »), excédents tous mobilisables. Sert aux comparaisons et à la parité avec le moteur d'origine."""
    cfg = defaut()
    cfg["besoin"].update({"norme_eleves_par_maitre": NORME_HISTORIQUE, "plancher_pedagogique": 1,
                          "mobiliser_excedent_incertain": True})
    return cfg


# Groupes dont la somme des poids est attendue égale à 1 (avertissement, jamais bloquant).
GROUPES_POIDS = ("poids_bareme_individuel", "poids_score_appariement")


# Réglages supprimés du moteur, encore présents dans des configurations enregistrées : ignorés sans erreur.
# `phase4_vivier_recrutement` n'était lue par aucun calcul : le vivier de recrutement relève de la planification.
CLES_ABANDONNEES: tuple = (("regles_dreb", "phase4_vivier_recrutement"),)


def sans_cles_abandonnees(surcharge: Dict[str, Any] | None) -> Dict[str, Any]:
    res = copy.deepcopy(surcharge or {})
    for groupe, cle in CLES_ABANDONNEES:
        if isinstance(res.get(groupe), dict):
            res[groupe].pop(cle, None)
    return res


class ParametresInvalides(ValueError):
    def __init__(self, erreurs: List[str]):
        super().__init__("; ".join(erreurs))
        self.erreurs = erreurs


def defaut() -> Dict[str, Any]:
    return copy.deepcopy(DEFAULT_CONFIG)


def fusionner(base: Dict[str, Any], surcharge: Dict[str, Any] | None) -> Dict[str, Any]:
    """Fusion récursive : seules les clés connues de `base` sont retenues (mergeSettings)."""
    res = copy.deepcopy(base)
    if not surcharge:
        return res
    for cle, val in surcharge.items():
        if cle not in res:
            continue
        if isinstance(res[cle], dict) and isinstance(val, dict):
            res[cle] = fusionner(res[cle], val)
        elif isinstance(res[cle], bool):
            res[cle] = bool(val)
        elif isinstance(res[cle], (int, float)) and isinstance(val, (int, float)) and not isinstance(val, bool):
            res[cle] = val
    return res


def _inconnues(modele: Dict[str, Any], valeur: Dict[str, Any], chemin: str = "") -> List[str]:
    out = []
    for cle, val in valeur.items():
        ch = f"{chemin}{cle}"
        if cle not in modele:
            out.append(f"Clé inconnue : {ch}")
        elif isinstance(modele[cle], dict):
            if isinstance(val, dict):
                out += _inconnues(modele[cle], val, ch + ".")
            else:
                out.append(f"{ch} doit être un objet")
        elif isinstance(modele[cle], bool):
            if not isinstance(val, bool):
                out.append(f"{ch} doit être un booléen")
        elif isinstance(val, bool) or not isinstance(val, (int, float)):
            out.append(f"{ch} doit être un nombre")
    return out


def valider(surcharge: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """Valide une surcharge partielle. Retourne (config complète, avertissements). Lève ParametresInvalides."""
    surcharge = sans_cles_abandonnees(surcharge)
    erreurs = _inconnues(DEFAULT_CONFIG, surcharge)
    if erreurs:
        raise ParametresInvalides(erreurs)
    cfg = fusionner(DEFAULT_CONFIG, surcharge)
    erreurs = []
    s = cfg["seuils"]
    if not (0 < s["age_jeune_ans"] <= s["age_senior_ans"] < s["age_retraite_ans"]):
        erreurs.append("Seuils d'âge incohérents : jeune <= senior < retraite attendu")
    if s["anciennete_poste_recevabilite_ans"] < 0:
        erreurs.append("anciennete_poste_recevabilite_ans doit être positif")
    v = cfg["vulnerabilite"]
    if v["t1"] < 0 or v["t2"] < 0:
        erreurs.append("Les coefficients de vulnérabilité doivent être positifs")
    b = cfg["besoin"]
    if b["norme_eleves_par_maitre"] <= 0:
        erreurs.append("besoin.norme_eleves_par_maitre doit être strictement positif")
    if not (0 <= b["effectif_premiere_section"] < max(b["norme_eleves_par_maitre"], 1)):
        erreurs.append("besoin.effectif_premiere_section doit être compris entre 0 et la norme (exclue)")
    if b["nombre_niveaux"] < 1 or b["niveaux_par_maitre_multigrade"] < 1:
        erreurs.append("besoin.nombre_niveaux et besoin.niveaux_par_maitre_multigrade doivent valoir au moins 1")
    for cle in ("plancher_pedagogique", "groupes_secours", "nombre_niveaux", "niveaux_par_maitre_multigrade"):
        if float(b[cle]) != int(b[cle]):
            erreurs.append(f"besoin.{cle} doit être un nombre entier")
    if not 1 <= b["plancher_pedagogique"] <= 30:
        erreurs.append("besoin.plancher_pedagogique doit être compris entre 1 et 30")
    if not 1 <= b["groupes_secours"] <= 30:
        erreurs.append("besoin.groupes_secours doit être compris entre 1 et 30")
    for g in GROUPES_POIDS:
        if any(p < 0 for p in cfg[g].values()):
            erreurs.append(f"{g} : poids négatif interdit")
    if erreurs:
        raise ParametresInvalides(erreurs)
    avertissements = []
    for g in GROUPES_POIDS:
        total = sum(cfg[g].values())
        if abs(total - 1.0) > 1e-9:
            avertissements.append(f"La somme de {g} vaut {total:.4f} (1 attendu)")
    return cfg, avertissements
