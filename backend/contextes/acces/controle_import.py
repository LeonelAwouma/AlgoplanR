"""Contrôle régional des fichiers importés par un délégué : tout ou rien.

Pour chaque colonne « Région » d'un fichier, toutes les lignes doivent porter la région du compte connecté.
Une seule ligne d'une autre région (ou sans région) fait refuser le fichier entier, avec la liste des lignes
concernées. La région vient du compte authentifié, jamais de la requête.
"""
from __future__ import annotations

from typing import Iterable, List, Optional, Sequence

from contextes.commun.erreurs import RefusMetier
from domaine.acces.controle_regions import anomalies_region, motifs_lisibles
from domaine.acces.regions import est_colonne_region

from .perimetre import region_imposee

MAX_LIGNES_RAPPORT = 200


def colonnes_region(entetes: Iterable[str]) -> List[str]:
    return [e for e in entetes if est_colonne_region(e)]


def refuser_si_hors_region(region: str, lignes: Sequence[dict], numeros: Optional[Sequence[int]],
                           colonnes: Iterable[str], fichier: str = "") -> None:
    anomalies: List[dict] = []
    for colonne in colonnes:
        anomalies += anomalies_region(lignes, numeros, colonne, region)
    if not anomalies:
        return
    anomalies.sort(key=lambda a: a["ligne"])
    raise RefusMetier(
        f"Import refusé : {len(anomalies)} ligne(s) hors de la région {region}"
        + (f" dans « {fichier} »" if fichier else "") + ". Aucune ligne du fichier n'a été enregistrée.",
        motifs_lisibles(anomalies), code="region_non_autorisee",
        details={"region_autorisee": region, "fichier": fichier, "total": len(anomalies),
                 "lignes": anomalies[:MAX_LIGNES_RAPPORT]})


def verifier_fichier(request, entetes: Iterable[str], lignes: Sequence[dict], numeros: Optional[Sequence[int]],
                     fichier: str = "", colonnes: Optional[Iterable[str]] = None) -> None:
    """Refuse le fichier d'un délégué si une colonne Région contient une autre région. Sans effet pour le DRH."""
    region = region_imposee(request)
    if region is None:
        return
    refuser_si_hors_region(region, lignes, numeros, colonnes if colonnes is not None else colonnes_region(entetes),
                           fichier)
