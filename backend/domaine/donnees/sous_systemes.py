"""Sous-système (francophone / anglophone) des enseignants. Python pur.

Un enseignant sans sous-système n'est limité à aucun poste : il pourrait être proposé dans une école de l'autre
sous-système. Quand le fichier ne le donne pas, on le déduit de l'école où l'enseignant est en poste.
"""
from __future__ import annotations

from typing import Any, Dict, List

from ..commun.texte import est_vide, texte
from . import colonnes as C


def completer_sous_systemes(lignes_etab: List[Dict[str, Any]], lignes_ens: List[Dict[str, Any]]) -> int:
    """Renseigne `Sous_Systeme_Formation` des enseignants qui n'en ont pas, d'après leur école d'attache.

    Une valeur déjà présente n'est jamais remplacée. Un enseignant sans école connue, ou rattaché à une école sans
    sous-système, est laissé tel quel. Retourne le nombre d'enseignants complétés.
    """
    par_ecole = {texte(e.get(C.COL_ETAB_ID)): texte(e.get(C.COL_ETAB_SS)) for e in lignes_etab
                 if not est_vide(e.get(C.COL_ETAB_SS))}
    complets = 0
    for ligne in lignes_ens:
        if not est_vide(ligne.get(C.COL_ENS_SS)):
            continue
        sous_systeme = par_ecole.get(texte(ligne.get(C.COL_ENS_ETAB)))
        if sous_systeme:
            ligne[C.COL_ENS_SS] = sous_systeme
            complets += 1
    return complets
