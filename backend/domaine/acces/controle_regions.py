"""Contrôle régional d'un fichier importé : toutes les lignes doivent porter la région autorisée. Python pur."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from ..commun.texte import texte
from .regions import region_canonique

MOTIF_DIFFERENTE = "région différente"
MOTIF_MANQUANTE = "région manquante"
MOTIF_INCONNUE = "région inconnue"


def numero_ligne(numeros: Optional[Sequence[int]], index: int) -> int:
    """Numéro de la ligne dans le classeur : celui relevé à la lecture, sinon index + 2 (ligne 1 = en-têtes)."""
    if numeros and index < len(numeros):
        return int(numeros[index])
    return index + 2


def anomalies_region(lignes: Sequence[Dict[str, Any]], numeros: Optional[Sequence[int]], colonne: str,
                     region_autorisee: str) -> List[dict]:
    """Lignes dont la région n'est pas `region_autorisee` : différente, inconnue ou manquante.

    Une ligne sans région est une anomalie : elle ne peut pas être rattachée avec certitude à la région autorisée.
    """
    autorisee = region_canonique(region_autorisee)
    anomalies = []
    for i, ligne in enumerate(lignes):
        brute = texte(ligne.get(colonne))
        if not brute:
            motif = MOTIF_MANQUANTE
        else:
            reconnue = region_canonique(brute)
            if reconnue == autorisee:
                continue
            motif = MOTIF_INCONNUE if reconnue is None else MOTIF_DIFFERENTE
        anomalies.append({"ligne": numero_ligne(numeros, i), "colonne": colonne, "valeur": brute, "motif": motif})
    return anomalies


def contient_autres_regions(lignes: Sequence[Dict[str, Any]], colonne: str, region_autorisee: str) -> bool:
    """Vrai si au moins une ligne porte une région reconnue autre que `region_autorisee` : fichier multi-régions.

    Une région vide ou illisible ne suffit pas : elle reste une anomalie d'un fichier régional.
    """
    autorisee = region_canonique(region_autorisee)
    for ligne in lignes:
        reconnue = region_canonique(texte(ligne.get(colonne)))
        if reconnue is not None and reconnue != autorisee:
            return True
    return False


def motifs_lisibles(anomalies: Sequence[dict], limite: int = 20) -> List[str]:
    """Motifs à afficher : « Ligne 14 : région « Littoral » différente de Centre »…, les premiers seulement."""
    sortie = []
    for a in anomalies[:limite]:
        valeur = f"« {a['valeur']} »" if a["valeur"] else "vide"
        sortie.append(f"Ligne {a['ligne']} ({a['colonne']}) : {a['motif']} ({valeur})")
    if len(anomalies) > limite:
        sortie.append(f"… et {len(anomalies) - limite} autre(s) ligne(s)")
    return sortie
