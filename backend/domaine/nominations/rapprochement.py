"""Rapprochement d'une personne du vivier et d'un poste ouvert : score, proximité, compatibilité.

Un enseignant excédentaire est classé par le score d'appariement du moteur (Z1 à Z4) ; une personne d'une autre
source (lauréat, réintégration…) par sa note. Le sous-système doit concorder ; un poste en zone rouge demande un
volontariat et n'est jamais proposé d'office.
"""
from __future__ import annotations

from typing import Optional

from ..commun.texte import norm
from ..donnees import colonnes as C
from ..mobilite.rehydratation import enseignant_depuis_dict, poste_depuis_dict
from ..mobilite.score import detail_score


def proximite(personne: dict, poste: dict) -> str:
    p = poste["_poste"]
    if personne.get("commune") and norm(personne["commune"]) == norm(p.get(C.COL_ETAB_COMMUNE)):
        return "meme_commune"
    if personne.get("iaeb") and norm(personne["iaeb"]) == norm(p.get(C.COL_ETAB_IAEB)):
        return "meme_iaeb"
    if personne.get("departement") and norm(personne["departement"]) == norm(p.get(C.COL_ETAB_DEPT)):
        return "meme_departement"
    if personne.get("region") and norm(personne["region"]) == norm(p.get(C.COL_ETAB_REGION)):
        return "meme_region"
    return "hors_region"


def sous_systemes_compatibles(a: Optional[str], b: Optional[str]) -> bool:
    return not a or not b or a == b


def rapprocher(personne: dict, poste: dict, cfg: dict) -> dict:
    """{score: {composantes, total}, proximite, compatible, motifs}."""
    if personne.get("_ens") is not None:
        score = detail_score(enseignant_depuis_dict(personne["_ens"]), poste_depuis_dict(poste["_poste"]), cfg)
    elif personne.get("note") is not None:
        note = float(personne["note"])
        score = {"composantes": [{"code": "note_admission", "valeur": note, "poids": 1, "contribution": note}],
                 "total": note}
    else:
        # Lauréat classé par rang, sans note : le rang départage les candidats (vivier trié par rang), pas le score.
        rang = personne.get("_rang")
        composantes = [{"code": "rang_concours", "valeur": rang, "poids": 0, "contribution": 0}] if rang else []
        score = {"composantes": composantes, "total": 0}
    motifs = []
    compatible = sous_systemes_compatibles(personne.get("sous_systeme"), poste.get("sous_systeme"))
    if not compatible:
        motifs.append("Sous-système du poste différent de celui de la personne")
    if poste["_poste"].get("est_zone_rouge"):
        motifs.append("Poste en zone rouge : volontariat requis")
    return {"score": score, "proximite": proximite(personne, poste),
            "compatible": compatible and not poste["_poste"].get("est_zone_rouge"), "motifs": motifs}


def classer(rapprochements: list) -> list:
    """Compatibles d'abord, puis par score décroissant."""
    return sorted(rapprochements, key=lambda r: (not r["compatible"], -float(r["score"]["total"])))
