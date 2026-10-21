"""Helpers de texte et de nombres. Python pur (reproduit _str_norm, _is_oui, _is_vide du moteur d'origine)."""
from __future__ import annotations

import math
import unicodedata
from typing import Any

VALEURS_VIDES = ("", "nan", "none", "n/a", "na", "null")
VALEURS_OUI = ("oui", "yes", "1", "true", "vrai", "y")


def est_nan(x: Any) -> bool:
    return isinstance(x, float) and math.isnan(x)


def norm(x: Any) -> str:
    """str(x).strip().lower(), '' pour None/NaN."""
    if x is None or est_nan(x):
        return ""
    return str(x).strip().lower()


def est_oui(x: Any) -> bool:
    return norm(x) in VALEURS_OUI


def est_vide(x: Any) -> bool:
    return norm(x) in VALEURS_VIDES


def texte(x: Any, defaut: str = "") -> str:
    """Chaîne nettoyée ; les valeurs vides/NaN deviennent `defaut`."""
    if x is None or est_nan(x):
        return defaut
    return str(x).strip()


def nombre(x: Any, defaut: float = 0.0) -> float:
    """Équivalent de pd.to_numeric(errors='coerce').fillna(defaut) pour une valeur scalaire."""
    if x is None or isinstance(x, bool):
        return defaut if x is None else float(x)
    if isinstance(x, (int, float)):
        return float(x) if math.isfinite(x) else defaut
    s = str(x).strip().replace(",", ".")
    if not s:
        return defaut
    try:
        v = float(s)
    except ValueError:
        return defaut
    return v if math.isfinite(v) else defaut      # « inf », « 1e999 » et NaN ne sont pas des quantités


def nombre_ou_none(x: Any):
    """Comme `nombre` mais renvoie None quand la valeur n'est pas numérique."""
    if x is None or est_nan(x):
        return None
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        return float(x) if math.isfinite(x) else None
    s = str(x).strip().replace(",", ".")
    try:
        v = float(s)
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def sans_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def cle_recherche(s: Any) -> str:
    return sans_accents(norm(s))


def cle_tri_fr(s: Any) -> tuple:
    """Clé de tri alphabétique français (accents ignorés, casse ignorée)."""
    base = sans_accents(norm(s))
    return (base, norm(s))
