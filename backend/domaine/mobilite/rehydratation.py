"""Reconstruction d'objets du domaine depuis les dictionnaires d'un résultat enregistré."""
from __future__ import annotations

from typing import Any, Dict

from ..donnees import colonnes as C
from ..donnees.modeles import Enseignant, Poste


def enseignant_depuis_dict(d: Dict[str, Any]) -> Enseignant:
    return Enseignant(
        matricule=str(d[C.COL_ENS_ID]), sous_systeme=d.get(C.COL_ENS_SS, ""), ecole_attache=d.get(C.COL_ENS_ETAB, ""),
        age=d.get(C.COL_ENS_AGE), anciennete_carriere=d.get(C.COL_ENS_ANC_CAR, 0) or 0,
        anciennete_poste=d.get(C.COL_ENS_ANC_POSTE, 0) or 0, annees_zone_1=d.get(C.COL_ENS_N1, 0) or 0,
        annees_zone_2=d.get(C.COL_ENS_N2, 0) or 0, situation=d.get(C.COL_ENS_SITU, "") or "",
        enfants=d.get(C.COL_ENS_ENFANTS, 0) or 0, formations=d.get(C.COL_ENS_FORM, 0) or 0,
        voeux=(d.get(C.COL_ENS_V1, ""), d.get(C.COL_ENS_V2, ""), d.get(C.COL_ENS_V3, "")),
        motif_bonification=d.get(C.COL_ENS_MOTIF, "") or "", age_connu=bool(d.get("age_connu", True)), nom=d.get("nom", ""), prenom=d.get("prenom", ""),
        commune_attache=d.get("commune_attache", ""), departement_attache=d.get("departement_attache", ""),
        region_attache=d.get("region_attache", ""), iaeb_attache=d.get("iaeb_attache", ""),
        zone_attache=d.get("zone_attache", ""), etab_attache_excedentaire=bool(d.get("etab_attache_excedentaire")),
        bareme=float(d.get("bareme", 0) or 0),
    )


def poste_depuis_dict(d: Dict[str, Any]) -> Poste:
    return Poste(
        id_poste=d["id_poste"], id_etab=str(d[C.COL_ETAB_ID]), nom_etab=d.get("nom_etab", ""),
        commune=d.get(C.COL_ETAB_COMMUNE, ""), departement=d.get(C.COL_ETAB_DEPT, ""),
        region=d.get(C.COL_ETAB_REGION, ""), iaeb=d.get(C.COL_ETAB_IAEB, ""),
        accessibilite=d.get(C.COL_ETAB_ALPHA, ""), securite=d.get(C.COL_ETAB_SIGMA, ""),
        multigrade=d.get(C.COL_ETAB_MULTIGRADE, ""), sous_systeme=d.get(C.COL_ETAB_SS, ""),
        type_etab=d.get("type_etab", "ECOLE"), Up=float(d.get("Up", 0) or 0), Wp=float(d.get("Wp", 0) or 0),
        est_zone_rouge=bool(d.get("est_zone_rouge")), pourvu=bool(d.get("pourvu")),
        latitude=d.get("latitude"), longitude=d.get("longitude"),
    )


def poste_depuis_ecole_dict(e: Dict[str, Any], id_poste: str) -> Poste:
    """Poste « virtuel » (ex. créé par un fait de Prince) reconstruit depuis la ligne école."""
    return poste_depuis_dict({
        "id_poste": id_poste, C.COL_ETAB_ID: e[C.COL_ETAB_ID], "nom_etab": e.get("nom_etab", ""),
        C.COL_ETAB_COMMUNE: e.get(C.COL_ETAB_COMMUNE, ""), C.COL_ETAB_DEPT: e.get(C.COL_ETAB_DEPT, ""),
        C.COL_ETAB_REGION: e.get(C.COL_ETAB_REGION, ""), C.COL_ETAB_IAEB: e.get(C.COL_ETAB_IAEB, ""),
        C.COL_ETAB_ALPHA: e.get(C.COL_ETAB_ALPHA, ""), C.COL_ETAB_SIGMA: e.get(C.COL_ETAB_SIGMA, ""),
        C.COL_ETAB_MULTIGRADE: e.get(C.COL_ETAB_MULTIGRADE, ""), C.COL_ETAB_SS: e.get(C.COL_ETAB_SS, ""),
        "type_etab": e.get("type_etab", "ECOLE"), "Up": 0.0, "Wp": 0.0, "est_zone_rouge": False, "pourvu": True,
    })
