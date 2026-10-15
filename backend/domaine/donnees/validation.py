"""Contrôles avant de valider un jeu comme référence des projections (étape 1 de la chaîne de traitement).

Un contrôle bloquant non satisfait empêche la validation ; les autres signalent une projection moins fiable.
"""
from __future__ import annotations

from collections import Counter
from typing import Iterable, List, Optional

from ..commun.texte import norm
from .modeles import Ecole, Enseignant

#: Part minimale d'enseignants dont l'âge est connu, sous laquelle les départs à la retraite sont peu fiables.
SEUIL_AGES = 0.9


def _pct(x: float) -> str:
    return f"{round(x * 100)} %"


def controles_validation(ecoles: Iterable[Ecole], enseignants: Iterable[Enseignant],
                         rapport_qualite: Optional[dict] = None) -> List[dict]:
    ecoles, enseignants = list(ecoles), list(enseignants)
    n = len(enseignants)
    part = lambda k: 0.0 if n == 0 else k / n  # noqa: E731
    ids = {e.id for e in ecoles}
    rattaches = sum(1 for t in enseignants if t.ecole_attache in ids)
    doublons_ecoles = [i for i, c in Counter(e.id for e in ecoles).items() if c > 1]
    doublons_ens = [m for m, c in Counter(t.matricule for t in enseignants).items() if c > 1]
    ages = part(sum(1 for t in enseignants if t.age is not None))
    sous_systeme = part(sum(1 for t in enseignants if norm(t.sous_systeme)))
    sans_eleves = sum(1 for e in ecoles if e.effectif_eleves <= 0)
    erreurs = (rapport_qualite or {}).get("erreurs") or []
    return [
        {"code": "qualite", "libelle": "Aucune erreur bloquante au rapport de qualité",
         "ok": not erreurs, "bloquant": True,
         "detail": ("Rapport de qualité sans erreur bloquante." if not erreurs
                    else f"{len(erreurs)} erreur(s) : " + " ; ".join(e.get("message", "") for e in erreurs[:3]))},
        {"code": "doublons", "libelle": "Identifiants uniques (écoles et matricules)",
         "ok": not doublons_ecoles and not doublons_ens, "bloquant": True,
         "detail": (f"{len(doublons_ecoles)} identifiant(s) d'école et {len(doublons_ens)} matricule(s) en double."
                    if doublons_ecoles or doublons_ens else "Aucun identifiant en double.")},
        {"code": "rattachement", "libelle": "Enseignants rattachés à une école connue",
         "ok": rattaches == n, "bloquant": True,
         "detail": f"{rattaches} enseignant(s) sur {n} rattaché(s) à une école du fichier."},
        {"code": "date_naissance", "libelle": "Âge ou date de naissance renseigné", "ok": ages >= SEUIL_AGES,
         "bloquant": False, "detail": f"{_pct(ages)} des enseignants : base des départs à la retraite prévus."},
        {"code": "sous_systeme", "libelle": "Sous-système renseigné", "ok": sous_systeme >= SEUIL_AGES,
         "bloquant": False, "detail": f"{_pct(sous_systeme)} des enseignants : base de la ventilation par sous-système."},
        {"code": "eleves", "libelle": "Effectifs d'élèves disponibles", "ok": sans_eleves == 0, "bloquant": False,
         "detail": f"{sans_eleves} école(s) calculée(s) sans effectif d'élèves."},
    ]
