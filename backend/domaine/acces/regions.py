"""Les dix régions du Cameroun et leur reconnaissance dans un texte saisi. Python pur."""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

from ..commun.texte import est_nan, sans_accents

# Dénominations françaises officielles (identiques à frontend/components/shared/kernel/regions.ts).
REGIONS_CAMEROUN = (
    "Adamaoua", "Centre", "Est", "Extrême-Nord", "Littoral",
    "Nord", "Nord-Ouest", "Ouest", "Sud", "Sud-Ouest",
)

#: Trigramme de chaque région, dans les identifiants des codes d'accès (C1-CEN-A001…).
CODES_REGIONS = {
    "Adamaoua": "ADA", "Centre": "CEN", "Est": "EST", "Extrême-Nord": "EXN", "Littoral": "LIT",
    "Nord": "NOR", "Nord-Ouest": "NOU", "Ouest": "OUE", "Sud": "SUD", "Sud-Ouest": "SOU",
}


def identifiant_delegue(region: str) -> str:
    """Identifiant du compte du délégué d'une région : « delegue.extreme-nord »."""
    return "delegue." + sans_accents(region).lower().replace(" ", "-")


def _cle(texte: Any) -> str:
    """Clé de comparaison : sans accents, sans casse, sans espaces, tirets ni ponctuation."""
    if texte is None or est_nan(texte):
        return ""
    return re.sub(r"[^a-z0-9]", "", sans_accents(str(texte).strip().lower()))


_ALIAS: Dict[str, str] = {_cle(r): r for r in REGIONS_CAMEROUN}
# Dénominations anglaises officielles et graphies courantes des fichiers administratifs.
_ALIAS.update({_cle(a): r for a, r in (
    ("Adamawa", "Adamaoua"), ("East", "Est"), ("Far North", "Extrême-Nord"), ("Extreme Nord", "Extrême-Nord"),
    ("North", "Nord"), ("North West", "Nord-Ouest"), ("Northwest", "Nord-Ouest"), ("West", "Ouest"),
    ("South", "Sud"), ("South West", "Sud-Ouest"), ("Southwest", "Sud-Ouest"),
)})


def region_canonique(texte: Any) -> Optional[str]:
    """Nom officiel de la région désignée par `texte`, ou None s'il ne désigne aucune région connue."""
    return _ALIAS.get(_cle(texte))


def est_colonne_region(entete: Any) -> bool:
    """Vrai pour un en-tête de colonne « Région », quelle que soit sa graphie (Region, RÉGION, region_ecole…).

    La région souhaitée d'une recrue en fait partie : un délégué n'importe que les candidats de sa région.
    """
    cle = _cle(entete)
    return cle in ("region", "regions", "nomregion", "regionecole", "regionetablissement", "regionsouhaitee",
                   "regionattache", "regiondattache")
