"""Outils communs aux vues : périmètre, pagination, téléversement."""
from __future__ import annotations

from typing import Iterable, List

from domaine.commun.pagination import paginer, trier
from domaine.diagnostic.territoires import Perimetre


def perimetre_depuis(request) -> Perimetre:
    q = request.query_params
    return Perimetre(q.get("region", "").strip(), q.get("departement", "").strip(), q.get("commune", "").strip())


def reponse_paginee(request, lignes: Iterable[dict], tri_defaut: str | None = None) -> dict:
    q = request.query_params
    lignes = trier(list(lignes), q.get("tri") or tri_defaut)
    try:
        page, taille = int(q.get("page", 1)), int(q.get("taille", 50))
    except ValueError:
        page, taille = 1, 50
    return paginer(lignes, page, taille)


def bool_param(request, nom: str, defaut: bool = False) -> bool:
    v = request.query_params.get(nom)
    if v is None:
        return defaut
    return v.strip().lower() in ("1", "true", "oui", "yes")
