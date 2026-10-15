"""Adaptateur d'infrastructure : lecture des classeurs Excel / CSV avec pandas (hors du domaine)."""
from __future__ import annotations

import datetime as dt
import importlib.util
import io
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

# Lecteur Excel : calamine (Rust) lit un classeur de 30 000 lignes environ huit fois plus vite qu'openpyxl,
# pour les mêmes valeurs. openpyxl reste le lecteur de repli si python-calamine n'est pas installé.
MOTEUR_EXCEL = "calamine" if importlib.util.find_spec("python_calamine") else None


class FichierIllisible(ValueError):
    pass


def _valeur(v: Any) -> Any:
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, (pd.Timestamp, dt.date, dt.time)):
        return v.isoformat()
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def lire_classeur(contenu: bytes, nom: str, feuille: Optional[str] = None) -> Tuple[List[str], str, List[str], List[Dict[str, Any]]]:
    """Retourne (feuilles, feuille_lue, entetes, lignes)."""
    feuilles, lue, entetes, lignes, _ = lire_classeur_numerote(contenu, nom, feuille)
    return feuilles, lue, entetes, lignes


def lire_classeur_numerote(contenu: bytes, nom: str, feuille: Optional[str] = None
                           ) -> Tuple[List[str], str, List[str], List[Dict[str, Any]], List[int]]:
    """Comme `lire_classeur`, avec le numéro de chaque ligne dans le classeur (en-têtes en ligne 1).

    Les lignes entièrement vides sont retirées : les numéros restent ceux que voit l'utilisateur dans Excel,
    pour que les rapports d'erreurs désignent la bonne ligne.
    """
    nom_l = nom.lower()
    try:
        if nom_l.endswith((".csv", ".txt")):
            df = pd.read_csv(io.BytesIO(contenu), sep=None, engine="python", dtype=object, encoding_errors="replace")
            feuilles, lue = [], ""
        elif nom_l.endswith((".xlsx", ".xlsm", ".xls")):
            xl = pd.ExcelFile(io.BytesIO(contenu), engine=MOTEUR_EXCEL)
            feuilles = [str(s) for s in xl.sheet_names]
            lue = feuille if feuille in feuilles else feuilles[0]
            df = xl.parse(lue, dtype=object)
        else:
            raise FichierIllisible("Format non pris en charge (xlsx, xls ou csv attendu)")
    except FichierIllisible:
        raise
    except Exception as exc:  # fichier corrompu, mot de passe, etc.
        raise FichierIllisible(f"Fichier illisible : {exc}") from exc
    df = df.dropna(how="all")
    entetes = [str(c).strip() for c in df.columns]
    df.columns = entetes
    lignes = [{c: _valeur(v) for c, v in rec.items()} for rec in df.to_dict(orient="records")]
    numeros = [int(i) + 2 for i in df.index]
    return feuilles, lue, entetes, lignes, numeros


def ecrire_excel(feuilles: Dict[str, List[dict]]) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        for nom, lignes in feuilles.items():
            pd.DataFrame(lignes).to_excel(w, sheet_name=nom[:31], index=False)
    return buf.getvalue()
