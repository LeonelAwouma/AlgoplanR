"""Score d'appariement enseignant/poste (Z1 à Z4) — fidèle à score_enseignant_poste."""
from __future__ import annotations

from ..commun.texte import est_oui, norm
from ..donnees.modeles import Enseignant, Poste
from .bonification import ecole_bonifiee


def score_proximite(e: Enseignant, p: Poste, cfg: dict) -> float:
    pts = cfg["points_proximite"]
    c1 = norm(e.commune_attache)
    if c1 and c1 == norm(p.commune):
        return float(pts["meme_commune"])
    d1 = norm(e.departement_attache)
    if d1 and d1 == norm(p.departement):
        return float(pts["meme_departement"])
    return float(pts["autre"])


def ajustements_contextuels(e: Enseignant, p: Poste, cfg: dict) -> float:
    """Ajustements d'âge, de type de structure et de zone, et bonification ciblée sur l'école visée par le motif
    (voir `bonification.ecole_bonifiee`)."""
    pts = 0.0
    age = float(e.age or 35)
    seuils = cfg["seuils"]
    ajust = cfg["ajustements_contextuels"]
    multigrade = est_oui(p.multigrade)
    type_etab = str(p.type_etab or "").upper()

    if age <= seuils["age_jeune_ans"] and multigrade:
        pts += ajust["appui_multigrades_jeune"]
    if age >= seuils["age_senior_ans"] and type_etab in ("IAEB", "DREB", "DELEGATION"):
        pts += ajust["senior_vers_encadrement"]
    if age >= seuils["age_senior_ans"] and not multigrade and type_etab not in ("IAEB", "DREB"):
        pts += ajust["allegement_senior_standard"]

    z_from = norm(e.zone_attache)
    z_to = norm(p.accessibilite)
    if "rural" in z_from and ("urbain" in z_to or "semi" in z_to) and float(e.anciennete_poste or 0) >= 5:
        pts += ajust["transition_rural_urbain"]

    if ecole_bonifiee(e) == p.id_etab.strip():
        pts += ajust["bonification_ciblee"]
    return float(pts)


def score_enseignant_poste(e: Enseignant, p: Poste, cfg: dict) -> float:
    w = cfg["poids_score_appariement"]
    return round(
        w["Z1_bareme_individu"] * float(e.bareme or 0)
        + w["Z2_poids_poste_Up"] * float(p.Up or 0)
        + w["Z3_proximite"] * score_proximite(e, p, cfg)
        + w["Z4_ajustements"] * ajustements_contextuels(e, p, cfg),
        4,
    )


def detail_score(e: Enseignant, p: Poste, cfg: dict) -> dict:
    w = cfg["poids_score_appariement"]
    z = {
        "Z1_bareme_individu": float(e.bareme or 0),
        "Z2_poids_poste_Up": float(p.Up or 0),
        "Z3_proximite": score_proximite(e, p, cfg),
        "Z4_ajustements": ajustements_contextuels(e, p, cfg),
    }
    return {
        "composantes": [{"code": k, "valeur": v, "poids": w[k], "contribution": round(w[k] * v, 4)}
                        for k, v in z.items()],
        "total": score_enseignant_poste(e, p, cfg),
    }
