"""Modèles de scénarios : un scénario = un jeu de règles de phases + éventuelles surcharges de paramètres."""
from __future__ import annotations

from typing import Any, Dict, List

SCENARIO_PRESETS: Dict[str, Dict[str, Any]] = {
    "geo_iaeb": {
        "nom": "Mobilité de proximité (circonscription IAEB)",
        "description": "Vœux puis proximité IAEB uniquement.",
        "geographique": True,
        "parametres": {"regles_dreb": {"phase1_voeux_actif": True, "phase2_proximite_iaeb": True,
                                       "phase2_proximite_departement": False, "phase3_extension_regionale": False}},
    },
    "geo_departement": {
        "nom": "Mobilité départementale",
        "description": "Vœux, proximité IAEB puis proximité départementale.",
        "geographique": True,
        "parametres": {"regles_dreb": {"phase1_voeux_actif": True, "phase2_proximite_iaeb": True,
                                       "phase2_proximite_departement": True, "phase3_extension_regionale": False}},
    },
    "geo_region": {
        "nom": "Mobilité régionale (référence)",
        "description": "Toutes les phases, y compris l'extension régionale.",
        "geographique": True,
        "parametres": {"regles_dreb": {"phase1_voeux_actif": True, "phase2_proximite_iaeb": True,
                                       "phase2_proximite_departement": True, "phase3_extension_regionale": True}},
    },
    "voeux_seuls": {
        "nom": "Vœux uniquement",
        "description": "Seuls les vœux des enseignants sont satisfaits.",
        "geographique": False,
        "parametres": {"regles_dreb": {"phase1_voeux_actif": True, "phase2_proximite_iaeb": False,
                                       "phase2_proximite_departement": False, "phase3_extension_regionale": False}},
    },
}

SCENARIOS_GEOGRAPHIQUES: List[str] = [k for k, v in SCENARIO_PRESETS.items() if v["geographique"]]


def comparer(resultats: Dict[str, Dict[str, Any]]) -> List[dict]:
    """Compare des scénarios : avant/après et réduction du déficit (reductionDuDeficit)."""
    out = []
    for code, r in resultats.items():
        s = r["synthese"]
        besoin = s["besoin_total"]
        out.append({
            "scenario": code, "besoin_total": besoin, "affectes": s["affectes"],
            "postes_non_pourvus": s["postes_non_pourvus"], "non_affectes": s["non_affectes"],
            "deficit_avant": besoin, "deficit_apres": s["postes_non_pourvus"],
            "reduction_du_deficit": round(1 - s["postes_non_pourvus"] / besoin, 4) if besoin else 0.0,
            "stats_phase": s["stats_phase"],
        })
    return out
