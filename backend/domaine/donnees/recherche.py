"""Rapprochement de saisie (rapprocherSaisie) : recherche tolérante aux accents, à la casse et aux fautes."""
from __future__ import annotations

import difflib
from collections import Counter
from typing import Callable, Iterable, List, Optional, Sequence

from ..commun.texte import cle_recherche

SEUIL = 0.6          # pertinence minimale d'un élément retenu
POIDS_FLOU = 0.8     # une ressemblance approximative vaut au plus 0,8


def _ratio(concordances: int, longueur: int) -> float:
    """Même formule que difflib (_calculate_ratio)."""
    return 2.0 * concordances / longueur if longueur else 1.0


def rapprocher(q: str, items: Iterable[dict], champs: Optional[Callable[[dict], List[str]]] = None,
               limite: int = 10, *, cles: Optional[Sequence[Sequence[str]]] = None) -> List[dict]:
    """Éléments les plus proches de la saisie.

    `cles` : clés déjà normalisées (`cle_recherche`) des champs de chaque élément, dans l'ordre des
    éléments ; à défaut, elles sont calculées à partir de `champs`.
    """
    k = cle_recherche(q)
    if not k:
        return []
    items = list(items)
    if cles is None:
        cles = [[cle_recherche(c) for c in champs(it)] for it in items]
    lk, lettres_k = len(k), Counter(k)
    notes = []
    for it, cles_item in zip(items, cles):
        meilleur = 0.0
        for ck in cles_item:
            if not ck:
                continue
            if ck == k:
                s = 1.0
            elif ck.startswith(k):
                s = 0.95
            elif k in ck:
                s = 0.85
            else:
                # Les bornes supérieures de difflib (real_quick_ratio, quick_ratio), recalculées ici sans
                # construire de SequenceMatcher, écartent une ressemblance qui ne pourrait ni atteindre le
                # seuil, ni dépasser le meilleur champ : résultat inchangé.
                plancher = max(SEUIL, meilleur)
                longueur = lk + len(ck)
                if _ratio(min(lk, len(ck)), longueur) * POIDS_FLOU < plancher:
                    continue
                communes = sum(min(n, ck.count(c)) for c, n in lettres_k.items())
                if _ratio(communes, longueur) * POIDS_FLOU < plancher:
                    continue
                s = difflib.SequenceMatcher(None, k, ck).ratio() * POIDS_FLOU
            meilleur = max(meilleur, s)
        if meilleur >= SEUIL:
            notes.append((meilleur, it))
    notes.sort(key=lambda x: -x[0])
    return [{**it, "pertinence": round(s, 3)} for s, it in notes[:limite]]
