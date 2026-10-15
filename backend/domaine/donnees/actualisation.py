"""Écarts introduits par l'actualisation d'un jeu : arrivées, départs, changements d'école, décisions invalidées."""
from __future__ import annotations

from typing import Dict, Iterable, List, Set

from .modeles import Enseignant


def _nom(t: Enseignant) -> str:
    return f"{t.nom} {t.prenom}".strip() or t.matricule


def ecarts(anciens: Iterable[Enseignant], nouveaux: Iterable[Enseignant]) -> Dict[str, List[dict]]:
    avant = {t.matricule: t for t in anciens}
    apres = {t.matricule: t for t in nouveaux}
    return {
        "arrivees": [{"matricule": m, "nom": _nom(t), "ecole": t.ecole_attache}
                     for m, t in apres.items() if m not in avant],
        "departs": [{"matricule": m, "nom": _nom(t), "ecole": t.ecole_attache}
                    for m, t in avant.items() if m not in apres],
        "changements_ecole": [{"matricule": m, "nom": _nom(t), "ancienne_ecole": avant[m].ecole_attache,
                               "nouvelle_ecole": t.ecole_attache}
                              for m, t in apres.items() if m in avant and avant[m].ecole_attache != t.ecole_attache],
    }


def motif_invalidation(matricule: str, id_ecole: str, ids_ecoles: Set[str], matricules: Set[str]) -> str:
    """Motif pour lequel une décision (enseignant → école) ne s'applique plus, chaîne vide sinon."""
    if matricule and matricule not in matricules:
        return f"L'enseignant {matricule} ne figure plus dans les données actualisées"
    if id_ecole and id_ecole not in ids_ecoles:
        return f"L'école {id_ecole} ne figure plus dans les données actualisées"
    return ""
