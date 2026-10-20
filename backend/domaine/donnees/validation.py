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
                         rapport_qualite: Optional[dict] = None,
                         ecarts_prince: Iterable[dict] = ()) -> List[dict]:
    """`ecarts_prince` : écarts d'effectif des écoles touchées par un fait du Prince (bloquants)."""
    ecarts_prince = list(ecarts_prince)
    ecoles, enseignants = list(ecoles), list(enseignants)
    n = len(enseignants)
    part = lambda k: 0.0 if n == 0 else k / n  # noqa: E731
    ids = {e.id for e in ecoles}
    rattaches = sum(1 for t in enseignants if t.ecole_attache in ids)
    doublons_ecoles = [i for i, c in Counter(e.id for e in ecoles).items() if c > 1]
    doublons_ens = [m for m, c in Counter(t.matricule for t in enseignants).items() if c > 1]
    ages = part(sum(1 for t in enseignants if t.age_connu))
    sous_systeme = part(sum(1 for t in enseignants if norm(t.sous_systeme)))
    sans_eleves = sum(1 for e in ecoles if not e.effectif_connu)
    sans_salles = sum(1 for e in ecoles if not e.salles_connues)
    erreurs = (rapport_qualite or {}).get("erreurs") or []
    reconciliation = (rapport_qualite or {}).get("reconciliation_effectifs") or {}
    en_ecart = int(reconciliation.get("ecoles_en_ecart") or 0)
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
        {"code": "effectifs_prince", "libelle": "Effectifs réconciliés pour les écoles touchées par un fait du Prince",
         "ok": not ecarts_prince, "bloquant": True,
         "detail": ("Aucun écart entre l'effectif déclaré et les matricules rattachés dans les écoles touchées."
                    if not ecarts_prince else
                    f"{len(ecarts_prince)} école(s) touchée(s) avec un écart : "
                    + ", ".join(f"{e['id_ecole']} ({e['ecart']:+g})" for e in ecarts_prince[:5]))},
        {"code": "effectifs", "libelle": "Effectif déclaré cohérent avec les matricules rattachés", "ok": en_ecart == 0,
         "bloquant": False,
         "detail": (f"{en_ecart} école(s) avec un effectif déclaré différent du nombre de matricules rattachés "
                    "(l'effectif déclaré fait foi)." if en_ecart else "Aucun écart d'effectif.")},
        {"code": "date_naissance", "libelle": "Âge ou date de naissance renseigné", "ok": ages >= SEUIL_AGES,
         "bloquant": False, "detail": f"{_pct(ages)} des enseignants : base des départs à la retraite prévus."},
        {"code": "sous_systeme", "libelle": "Sous-système renseigné", "ok": sous_systeme >= SEUIL_AGES,
         "bloquant": False, "detail": f"{_pct(sous_systeme)} des enseignants : base de la ventilation par sous-système."},
        {"code": "eleves", "libelle": "Effectifs d'élèves disponibles", "ok": sans_eleves == 0, "bloquant": False,
         "detail": f"{sans_eleves} école(s) calculée(s) sans effectif d'élèves."},
        {"code": "salles", "libelle": "Nombre de salles disponible", "ok": sans_salles == 0, "bloquant": False,
         "detail": f"{sans_salles} école(s) à capacité inconnue (salles non renseignées, comptées pour 0)."},
    ]
