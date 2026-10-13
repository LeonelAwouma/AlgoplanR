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
    "regles_dreb": {
        "phase1_voeux_actif": True,
        "phase2_proximite_iaeb": True,
        "phase2_proximite_departement": True,
        "phase3_extension_regionale": True,
        "phase4_vivier_recrutement": True,
    },
}

# Groupes dont la somme des poids est attendue égale à 1 (avertissement, jamais bloquant).
GROUPES_POIDS = ("poids_bareme_individuel", "poids_score_appariement")


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
    erreurs = _inconnues(DEFAULT_CONFIG, surcharge or {})
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
