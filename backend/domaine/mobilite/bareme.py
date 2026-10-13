"""Barème individuel (composantes C1 à C5) — fidèle à calculer_bareme_individuel."""
from __future__ import annotations

from typing import Dict

from ..commun.texte import norm
from ..donnees.modeles import Enseignant


def points_situation(situation: str, cfg: dict) -> float:
    s = norm(situation)
    p = cfg["points_situation_familiale"]
    if "mari" in s:
        return float(p["marie"])
    if "divorc" in s:
        return float(p["divorce"])
    if "veuf" in s or "veuve" in s:
        return float(p["veuf"])
    return float(p["celibataire"])


def categorie_situation(situation: str) -> str:
    s = norm(situation)
    if "mari" in s:
        return "marie"
    if "divorc" in s:
        return "divorce"
    if "veuf" in s or "veuve" in s:
        return "veuf"
    return "celibataire"


def _age(e: Enseignant) -> float:
    return float(e.age or 35)   # le moteur d'origine remplace un âge nul par 35


def composantes_bareme(e: Enseignant, cfg: dict) -> Dict[str, float]:
    seuils = cfg["seuils"]
    anc_car = float(e.anciennete_carriere or 0)
    n1 = float(e.annees_zone_1 or 0)
    n2 = float(e.annees_zone_2 or 0)
    if n1 == 0 and n2 == 0:
        z = norm(e.zone_attache)
        if "enclav" in z or "rouge" in z:
            n1 = anc_car
        elif "rural" in z or "jaune" in z:
            n2 = anc_car
    facteur_zone = max(10.0, 2.0 * n1 + 1.0 * n2)
    c1 = anc_car * facteur_zone

    anc_poste = float(e.anciennete_poste or 0)
    c2 = 0.0
    if anc_poste >= 5:
        c2 = 5.0 + max(0.0, anc_poste - 5.0)
    age = _age(e)
    if age >= (seuils.get("age_retraite_ans", 60) - 5):
        c2 -= 5.0

    c3 = points_situation(e.situation, cfg) - 2.0 * float(e.enfants or 0)
    c4 = min(10.0, float(e.formations or 0) * 2.0)

    if age < seuils["age_jeune_ans"]:
        c5 = 10.0
    elif age < seuils["age_senior_ans"]:
        c5 = 8.0
    else:
        c5 = 5.0
    return {"C1_carriere_zone": c1, "C2_anciennete_poste": c2, "C3_charges_familiales": c3,
            "C4_formation_continue": c4, "C5_cohorte_age": c5}


def calculer_bareme(e: Enseignant, cfg: dict) -> float:
    w = cfg["poids_bareme_individuel"]
    comp = composantes_bareme(e, cfg)
    score = sum(w[k] * v for k, v in comp.items())
    return round(float(score), 4)


def detail_bareme(e: Enseignant, cfg: dict) -> dict:
    w = cfg["poids_bareme_individuel"]
    comp = composantes_bareme(e, cfg)
    return {
        "composantes": [
            {"code": k, "valeur": v, "poids": w[k], "contribution": round(w[k] * v, 4)}
            for k, v in comp.items()
        ],
        "total": round(float(sum(w[k] * v for k, v in comp.items())), 4),
    }
