"""Cycle de vie d'une nomination et règles contre les doubles comptages.

Une seule nomination active (proposée ou validée) par personne ; un poste réservé par une seule nomination
validée ; une nomination mise en œuvre est définitive.
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Optional

STATUTS = ("proposee", "validee", "mise_en_oeuvre", "rejetee", "annulee")
ACTIFS = ("proposee", "validee")
ENGAGES = ("proposee", "validee", "mise_en_oeuvre")
LIBELLES = {"proposee": "proposée", "validee": "validée", "mise_en_oeuvre": "mise en œuvre",
            "rejetee": "rejetée", "annulee": "annulée"}

TRANSITIONS: Dict[str, tuple] = {
    "proposee": ("validee", "rejetee", "annulee"),
    "validee": ("mise_en_oeuvre", "annulee"),
    "mise_en_oeuvre": (),
    "rejetee": (),
    "annulee": (),
}

# Statuts de codeSource (NominationService) et leur équivalent.
DEPUIS_CODESOURCE = {"PROPOSEE": "proposee", "VALIDEE": "validee", "MISE_EN_OEUVRE": "mise_en_oeuvre"}


def refus_transition(de: str, vers: str) -> Optional[str]:
    """Motif du refus d'un changement de statut, `None` s'il est permis."""
    if vers in TRANSITIONS.get(de, ()):
        return None
    if de == "mise_en_oeuvre":
        return "Une nomination mise en œuvre est définitive."
    return f"Une nomination « {LIBELLES.get(de, de)} » ne peut pas devenir « {LIBELLES.get(vers, vers)} »."


def disponibilite(statuts: Iterable[str]) -> str:
    """Disponibilité d'une personne d'après les statuts de ses nominations."""
    s = set(statuts)
    if s & {"validee", "mise_en_oeuvre"}:
        return "nommee"
    if "proposee" in s:
        return "proposee"
    return "libre"


def statut_poste(statuts: Iterable[str]) -> str:
    """Statut d'un poste d'après les statuts des nominations qui le visent."""
    s = set(statuts)
    if "mise_en_oeuvre" in s:
        return "pourvu"
    if "validee" in s:
        return "reserve"
    return "libre"


def compter(statuts: Iterable[str]) -> Dict[str, int]:
    out = {s: 0 for s in STATUTS}
    for s in statuts:
        if s in out:
            out[s] += 1
    return out


def controler_mouvements(mouvements: List[dict]) -> dict:
    """Doubles comptages du registre. Chaque mouvement porte `id`, `matricule`, `poste` et `decision`."""
    anomalies = []
    par_personne: Dict[str, List[str]] = {}
    par_poste: Dict[str, List[str]] = {}
    sans_decision = []
    for m in mouvements:
        if m.get("matricule"):
            par_personne.setdefault(m["matricule"], []).append(m["id"])
        if m.get("poste"):
            par_poste.setdefault(m["poste"], []).append(m["id"])
        if not (m.get("decision") or {}).get("id"):
            sans_decision.append(m["id"])
    for matricule, ids in par_personne.items():
        if len(ids) > 1:
            anomalies.append({"code": "personne_comptee_deux_fois",
                              "libelle": f"Le matricule {matricule} figure dans plusieurs mouvements.",
                              "mouvements": ids})
    for poste, ids in par_poste.items():
        if len(ids) > 1:
            anomalies.append({"code": "poste_compte_deux_fois",
                              "libelle": f"Le poste {poste} est la destination de plusieurs mouvements.",
                              "mouvements": ids})
    if sans_decision:
        anomalies.append({"code": "mouvement_sans_decision",
                          "libelle": "Mouvement(s) sans décision à l'origine.", "mouvements": sans_decision})
    return {"ok": not anomalies, "anomalies": anomalies}
