"""Année scolaire d'un jeu de données (« 2026-2027 »), saisie à sa création."""
from __future__ import annotations

import datetime as dt
import re
from typing import Optional

_FORME = re.compile(r"^(\d{4})\s*[-/–]\s*(\d{4})$")


def annee_scolaire_courante(aujourdhui: Optional[dt.date] = None) -> str:
    """L'année scolaire en cours : elle commence en septembre (de janvier à juillet, c'est celle qui a commencé l'an passé)."""
    d = aujourdhui or dt.date.today()
    debut = d.year if d.month >= 8 else d.year - 1
    return f"{debut}-{debut + 1}"


def normaliser_annee_scolaire(valeur: Optional[str]) -> str:
    """« 2026-2027 », « 2026/2027 » ou vide (année en cours). Lève ValueError si la forme est invalide."""
    texte = str(valeur or "").strip()
    if not texte:
        return annee_scolaire_courante()
    m = _FORME.match(texte)
    if not m or int(m.group(2)) != int(m.group(1)) + 1:
        raise ValueError("L'année scolaire doit s'écrire « AAAA-AAAA » avec deux années consécutives (2026-2027)")
    return f"{m.group(1)}-{m.group(2)}"


#: Sens de l'année saisie pour un jeu (voir le modèle JeuDeDonnees).
SENS_DONNEES, SENS_RENTREE, SENS_NON_CONFIRME = "donnees", "rentree_preparee", "non_confirme"
SENS_ANNEE = (SENS_DONNEES, SENS_RENTREE, SENS_NON_CONFIRME)


def annee_des_donnees(annee_scolaire: str, sens: str = SENS_DONNEES) -> str:
    """Année scolaire des données observées (la base des projections), d'après l'année saisie et son sens.

    « rentree_preparee » : l'année saisie est la rentrée préparée, les données sont celles de l'année précédente.
    « donnees » et « non_confirme » : l'année saisie est celle des données. Une année illisible est rendue telle
    quelle (aucune année n'est inventée)."""
    m = _FORME.match(str(annee_scolaire or "").strip())
    if not m:
        return str(annee_scolaire or "")
    debut = int(m.group(1)) - (1 if sens == SENS_RENTREE else 0)
    return f"{debut}-{debut + 1}"
