"""Pagination et tri de listes de dictionnaires (Python pur)."""
from __future__ import annotations

from typing import Any, Iterable, List

from .texte import cle_tri_fr, est_nan


def _cle(v: Any):
    if v is None or est_nan(v):
        return (2, 0, "")
    if isinstance(v, bool):
        return (0, float(v), "")
    if isinstance(v, (int, float)):
        return (0, float(v), "")
    return (1, 0, cle_tri_fr(v))


def trier(lignes: List[dict], tri: str | None) -> List[dict]:
    """tri='champ' (croissant) ou '-champ' (décroissant) ; plusieurs champs séparés par des virgules."""
    if not tri:
        return lignes
    res = list(lignes)
    for champ in reversed([t.strip() for t in tri.split(",") if t.strip()]):
        desc = champ.startswith("-")
        nom = champ.lstrip("-")
        res.sort(key=lambda l: _cle(l.get(nom)), reverse=desc)
    return res


def paginer(lignes: Iterable[dict], page: int = 1, taille: int = 50, taille_max: int = 1000) -> dict:
    lignes = list(lignes)
    taille = max(1, min(int(taille), taille_max))
    page = max(1, int(page))
    debut = (page - 1) * taille
    total = len(lignes)
    return {
        "count": total,
        "page": page,
        "taille": taille,
        "pages": (total + taille - 1) // taille if total else 0,
        "resultats": lignes[debut:debut + taille],
    }
