"""Isolement d'une région dans une base nationale : établissements et enseignants rattachés par code d'école.

Python pur. Le rattachement ne repose jamais sur un nom : un enseignant relève d'une région parce que le code de
son école d'attache désigne, sans équivoque, une école de cette région. Tout rattachement qui ne peut pas être
établi de façon fiable est signalé (non rattaché ou ambigu) et l'enseignant n'est attribué à aucune région.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Sequence, Set, Tuple

from ..commun.texte import texte
from .controle_regions import numero_ligne
from .regions import region_canonique

MAX_ANOMALIES = 200

# Motifs d'exclusion ou de signalement (stables : l'interface et les tests s'y réfèrent).
ETAB_AUTRE_REGION = "autre_region"
ETAB_SANS_CODE = "ecole_sans_code"
ETAB_REGION_ILLISIBLE = "region_illisible"
ETAB_CODE_AMBIGU = "code_ambigu"
ENS_AUTRE_REGION = "autre_region"
ENS_SANS_ECOLE = "sans_ecole"
ENS_ECOLE_INCONNUE = "ecole_inconnue"
ENS_ECOLE_INDETERMINEE = "ecole_indeterminee"
ENS_REGION_CONTRADICTOIRE = "region_contradictoire"

LIBELLES = {
    ETAB_SANS_CODE: "école sans code d'établissement",
    ETAB_REGION_ILLISIBLE: "région de l'école vide ou non reconnue",
    ETAB_CODE_AMBIGU: "code d'établissement porté par des écoles de régions différentes",
    ENS_SANS_ECOLE: "enseignant sans code d'école d'attache",
    ENS_ECOLE_INCONNUE: "code d'école d'attache absent de la base des établissements",
    ENS_ECOLE_INDETERMINEE: "école d'attache dont la région est ambiguë ou illisible",
    ENS_REGION_CONTRADICTOIRE: "région de l'enseignant contradictoire avec celle de son école",
}


def _ajouter(anomalies: List[dict], fichier: str, ligne: int, code: str, motif: str, valeur: str) -> None:
    if len(anomalies) < MAX_ANOMALIES:
        anomalies.append({"fichier": fichier, "ligne": ligne, "code": code, "motif": motif, "valeur": valeur})


def isoler_region(region: str, etab: Sequence[Dict[str, Any]], ens: Sequence[Dict[str, Any]],
                  numeros_etab: Sequence[int] | None, numeros_ens: Sequence[int] | None,
                  ens_regions: Sequence[Sequence[str]] | None = None, *, col_region: str, col_id: str,
                  col_ecole: str) -> Tuple[List[int], List[int], dict]:
    """Indices des établissements et des enseignants à conserver pour `region`, et bilan de l'isolement.

    `etab`/`ens` : lignes normalisées. `ens_regions[i]` : valeurs des colonnes « Région » éventuelles de
    l'enseignant i, qui ne doivent pas contredire la région de son école.
    """
    region = region_canonique(region) or region
    codes: Dict[str, Set[str | None]] = defaultdict(set)
    for l in etab:
        code = texte(l.get(col_id))
        if code:
            codes[code].add(region_canonique(l.get(col_region)))
    region_de: Dict[str, str] = {}
    indetermines: Set[str] = set()
    for code, regions in codes.items():
        if len(regions) == 1 and None not in regions:
            region_de[code] = next(iter(regions))
        else:
            indetermines.add(code)

    anomalies: List[dict] = []
    gardees: List[int] = []
    exclues_autres = sans_code = illisibles = ambigues = 0
    for i, l in enumerate(etab):
        code = texte(l.get(col_id))
        ligne = numero_ligne(numeros_etab, i)
        if not code:
            sans_code += 1
            _ajouter(anomalies, "etablissements", ligne, ETAB_SANS_CODE, LIBELLES[ETAB_SANS_CODE], "")
        elif code in indetermines:
            if None in codes[code] and len(codes[code]) == 1:
                illisibles += 1
                _ajouter(anomalies, "etablissements", ligne, ETAB_REGION_ILLISIBLE, LIBELLES[ETAB_REGION_ILLISIBLE],
                         texte(l.get(col_region)))
            else:
                ambigues += 1
                _ajouter(anomalies, "etablissements", ligne, ETAB_CODE_AMBIGU, LIBELLES[ETAB_CODE_AMBIGU], code)
        elif region_de[code] == region:
            gardees.append(i)
        else:
            exclues_autres += 1

    retenus = {texte(etab[i].get(col_id)) for i in gardees}
    gardes_ens: List[int] = []
    ens_autres = non_rattaches = ambigus = 0
    for i, l in enumerate(ens):
        code = texte(l.get(col_ecole))
        ligne = numero_ligne(numeros_ens, i)
        if not code:
            non_rattaches += 1
            _ajouter(anomalies, "enseignants", ligne, ENS_SANS_ECOLE, LIBELLES[ENS_SANS_ECOLE], "")
            continue
        if code not in codes:
            non_rattaches += 1
            _ajouter(anomalies, "enseignants", ligne, ENS_ECOLE_INCONNUE, LIBELLES[ENS_ECOLE_INCONNUE], code)
            continue
        if code in indetermines:
            ambigus += 1
            _ajouter(anomalies, "enseignants", ligne, ENS_ECOLE_INDETERMINEE, LIBELLES[ENS_ECOLE_INDETERMINEE], code)
            continue
        propres = {region_canonique(v) for v in (ens_regions[i] if ens_regions else ()) if texte(v)}
        if propres and propres != {region_de[code]}:
            ambigus += 1
            _ajouter(anomalies, "enseignants", ligne, ENS_REGION_CONTRADICTOIRE, LIBELLES[ENS_REGION_CONTRADICTOIRE],
                     code)
            continue
        if code in retenus:
            gardes_ens.append(i)
        else:
            ens_autres += 1

    bilan = {
        "region": region,
        "etablissements_fichier": len(etab), "etablissements_retenus": len(gardees),
        "etablissements_autres_regions": exclues_autres,
        "etablissements_ecartes": sans_code + illisibles + ambigues,
        "enseignants_fichier": len(ens), "enseignants_retenus": len(gardes_ens),
        "enseignants_autres_regions": ens_autres,
        "enseignants_non_rattaches": non_rattaches, "enseignants_ambigus": ambigus,
        "anomalies": anomalies,
        "anomalies_tronquees": (sans_code + illisibles + ambigues + non_rattaches + ambigus) > len(anomalies),
    }
    return gardees, gardes_ens, bilan
