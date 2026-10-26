"""Contrôles avant de valider un jeu comme référence des projections (étape 1 de la chaîne de traitement).

Un contrôle bloquant non satisfait empêche la validation ; les autres signalent une projection moins fiable.

Deux sortes de contrôles bloquants :
- **structurels** (identifiants en double, enseignants rattachés à une école inconnue, rapport de qualité en erreur,
  effectifs négatifs, faits du Prince impossibles) : aucune dérogation ;
- **dérogeables** (`derogeable` : écart entre l'effectif déclaré et les matricules identifiés, pour les écoles touchées
  par un fait du Prince) : la DRH peut valider « avec réserve », en motivant. L'effectif déclaré reste la référence des
  calculs ; la liste nominative peut être incomplète.
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
                         ecarts_prince: Iterable[dict] = (),
                         faits_rejetes: Iterable[dict] = (), nominatif: bool = True) -> List[dict]:
    """`ecarts_prince` : écarts d'effectif des écoles touchées par un fait du Prince (bloquants, dérogeables).
    `faits_rejetes` : faits du Prince actifs que le prétraitement ne peut pas appliquer ({id_ens, motifs}) (bloquants)."""
    ecarts_prince = list(ecarts_prince)
    faits_rejetes = list(faits_rejetes)
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
    negatifs = [e.id for e in ecoles if (e.enseignants_actuels or 0) < 0]
    erreurs = (rapport_qualite or {}).get("erreurs") or []
    reconciliation = (rapport_qualite or {}).get("reconciliation_effectifs") or {}
    en_ecart = int(reconciliation.get("ecoles_en_ecart") or 0)
    controles = [
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
         "ok": not ecarts_prince, "bloquant": True, "derogeable": True,
         "detail": ("Aucun écart entre l'effectif déclaré et les matricules rattachés dans les écoles touchées."
                    if not ecarts_prince else
                    f"{len(ecarts_prince)} école(s) touchée(s) avec un écart : "
                    + ", ".join(f"{e['id_ecole']} ({e['ecart']:+g})" for e in ecarts_prince[:5]))},
        {"code": "effectifs", "libelle": "Effectif déclaré cohérent avec les matricules rattachés", "ok": en_ecart == 0,
         "bloquant": False,
         "detail": (f"{en_ecart} école(s) avec un effectif déclaré différent du nombre de matricules rattachés "
                    "(l'effectif déclaré fait foi)." if en_ecart else "Aucun écart d'effectif.")},
        {"code": "effectifs_negatifs", "libelle": "Aucun effectif déclaré négatif",
         "ok": not negatifs, "bloquant": True,
         "detail": (f"{len(negatifs)} école(s) avec un effectif négatif : {', '.join(negatifs[:5])}." if negatifs
                    else "Aucun effectif négatif.")},
        {"code": "faits_prince", "libelle": "Faits du Prince applicables aux données", "ok": not faits_rejetes,
         "bloquant": True,
         "detail": ("Tous les faits du Prince actifs sont applicables." if not faits_rejetes else
                    f"{len(faits_rejetes)} fait(s) impossible(s) : "
                    + " ; ".join(f"{f['id_ens']} ({', '.join(f['motifs'])})" for f in faits_rejetes[:3]))},
        {"code": "date_naissance", "libelle": "Âge ou date de naissance renseigné", "ok": ages >= SEUIL_AGES,
         "bloquant": False, "detail": f"{_pct(ages)} des enseignants : base des départs à la retraite prévus."},
        {"code": "sous_systeme", "libelle": "Sous-système renseigné", "ok": sous_systeme >= SEUIL_AGES,
         "bloquant": False, "detail": f"{_pct(sous_systeme)} des enseignants : base de la ventilation par sous-système."},
        {"code": "eleves", "libelle": "Effectifs d'élèves disponibles", "ok": sans_eleves == 0, "bloquant": False,
         "detail": f"{sans_eleves} école(s) calculée(s) sans effectif d'élèves."},
        {"code": "salles", "libelle": "Nombre de salles disponible", "ok": sans_salles == 0, "bloquant": False,
         "detail": f"{sans_salles} école(s) à capacité inconnue (salles non renseignées, comptées pour 0)."},
    ]
    if not nominatif:
        # Établissements seuls : les contrôles qui portent sur des agents n'ont pas d'objet, et leur « 100 % » n'est pas
        # une réussite. L'absence du fichier est signalée par un contrôle non bloquant.
        sans_objet = "Sans objet : aucun fichier nominatif des enseignants."
        for c in controles:
            if c["code"] == "rattachement":
                c.update(ok=True, detail=sans_objet)
            elif c["code"] in ("date_naissance", "sous_systeme"):
                c.update(ok=False, detail="Fichier nominatif indisponible : " + (
                    "retraites non calculables." if c["code"] == "date_naissance"
                    else "ventilation par sous-système des agents impossible."))
        controles.insert(0, {"code": "nominatif", "libelle": "Fichier nominatif des enseignants fourni", "ok": False,
                             "bloquant": False,
                             "detail": "Jeu d'établissements seuls : les retraites, les affectations individuelles et "
                                       "certains scénarios restent incomplets jusqu'à l'importation des enseignants."})
    for c in controles:
        c.setdefault("derogeable", False)      # sauf mention contraire, un contrôle bloquant est structurel
    return controles
