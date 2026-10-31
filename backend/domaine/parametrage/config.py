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
    # Besoin d'une école : UNE SEULE méthode, le minimum pédagogique commun (lue par
    # domaine/diagnostic/indicateurs.py), identique pour toutes les écoles :
    #   P = max(1 ; ceil((N - effectif_premiere_section) / norme_eleves_par_maitre)),
    #   B = De = max(plancher_pedagogique ; P),
    #   BMAX = salles simple flux + 2 x salles double flux (1 x si le double flux n'est pas autorisé).
    # Les trois paramètres du besoin sont réglables dans le Référentiel : minimum pédagogique commun M
    # (plancher_pedagogique), norme d'encadrement R (norme_eleves_par_maitre) et tolérance T
    # (effectif_premiere_section). Les classes multigrades et ouvertes n'y interviennent pas.
    "besoin": {
        "norme_eleves_par_maitre": 60,
        "effectif_premiere_section": 20,
        "plancher_pedagogique": 3,
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

#: Norme d'encadrement par défaut d'AlgoPlanR (60 élèves par enseignant). Le REM de référence du rapport MINEDUB
#: d'octobre 2026 (74,4) reste sélectionnable en modifiant la norme dans le Référentiel.
NORME_HISTORIQUE = 60
NORME_REFERENCE_2026 = 74.4


def config_historique() -> Dict[str, Any]:
    """Référentiel de l'ancienne interface : norme de 60, tolérance de 20 et minimum pédagogique commun de 3. Sert
    aux comparaisons et à la parité avec le moteur d'origine."""
    cfg = defaut()
    cfg["besoin"].update({"norme_eleves_par_maitre": NORME_HISTORIQUE, "plancher_pedagogique": 3})
    return cfg


# Groupes dont la somme des poids est attendue égale à 1 (avertissement, jamais bloquant).
GROUPES_POIDS = ("poids_bareme_individuel", "poids_score_appariement")


# Réglages supprimés du moteur, encore présents dans des configurations enregistrées : ignorés sans erreur.
# `phase4_vivier_recrutement` n'était lue par aucun calcul : le vivier de recrutement relève de la planification.
#: Les réglages multigrades du besoin (minimum selon multigrades, niveaux regroupés, groupes de secours, lecture des
#: classes ouvertes, mobilisation des excédents incertains) ont disparu avec la méthode unique du minimum commun.
CLES_ABANDONNEES: tuple = (("regles_dreb", "phase4_vivier_recrutement"),
                           ("besoin", "nombre_niveaux"), ("besoin", "niveaux_par_maitre_multigrade"),
                           ("besoin", "groupes_secours"), ("besoin", "minimum_selon_multigrades"),
                           ("besoin", "groupes_depuis_classes_ouvertes"), ("besoin", "mobiliser_excedent_incertain"))


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
    if float(b["plancher_pedagogique"]) != int(b["plancher_pedagogique"]):
        erreurs.append("besoin.plancher_pedagogique doit être un nombre entier")
    if not 1 <= b["plancher_pedagogique"] <= 30:
        erreurs.append("besoin.plancher_pedagogique doit être compris entre 1 et 30")
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
