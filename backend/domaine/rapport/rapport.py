"""Rapport de décision (construireRapport) : document JSON prêt à être mis en forme par le frontend."""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List

from ..diagnostic.synthese import points_attention, texte_narratif
from ..donnees import colonnes as C
from ..mobilite.analyses import calculer_flux, verifier_invariants


def construire_rapport(res: Dict[str, Any], *, jeu: dict, scenario: dict, faits_prince: List[dict],
                       arbitrages: List[dict], genere_le: str) -> dict:
    s = res["synthese"]
    perim = res.get("perimetre", {"titre": s.get("scope_title", "National")})
    tension = Counter(l.get(C.COL_ETAB_DEPT) for l in res["postes_non_pourvus"])
    inv = verifier_invariants(res)
    return {
        "titre": f"Rapport de décision — {scenario.get('nom', '')}",
        "genere_le": genere_le, "jeu": jeu, "scenario": scenario, "perimetre": perim,
        "synthese": s, "narratif": texte_narratif(s, perim.get("titre", "National")),
        "couverture": round(s["affectes"] / s["besoin_total"], 4) if s["besoin_total"] else 0.0,
        "points_attention": points_attention(s, res["etab_enrichi"]),
        "repartition_phases": s["stats_phase"],
        "departements_en_tension": [{"departement": d, "postes_non_pourvus": n} for d, n in tension.most_common(5)],
        "flux_regionaux": calculer_flux(res["affectations"], "region"),
        "faits_prince": {"nombre": len(faits_prince), "details": faits_prince},
        "arbitrages": {"nombre": len(arbitrages), "details": arbitrages},
        "invariants": {"tous_respectes": all(i["ok"] for i in inv), "controles": inv},
        "projections": {
            "quota_recrutement_n2": sum(int(l["Quota_Recrutement_Estime_N+2"]) for l in res["projections_n3"]),
            "quota_recrutement_n3": sum(int(l["Quota_Recrutement_Estime_N+3"]) for l in res["projections_n3"]),
            "departs_retraite_n1": sum(int(l["Departs_Retraite_N+1"]) for l in res["projections_n3"]),
        },
        "recommandations": _recommandations(s),
    }


def _recommandations(s: dict) -> List[str]:
    r = []
    if s["postes_non_pourvus"] > 0:
        r.append(f"Programmer le recrutement de {s['postes_non_pourvus']} enseignant(s) pour les postes restants.")
    if s["postes_rouge_non_pourvus"] > 0:
        r.append("Étudier des mesures d'incitation pour les postes de zone rouge non pourvus.")
    if s["non_affectes"] > 0:
        r.append("Réexaminer la situation des enseignants du vivier sans poste compatible (sous-système, vœux).")
    if not r:
        r.append("Aucune action corrective majeure : le besoin est couvert par la mobilité interne.")
    return r
