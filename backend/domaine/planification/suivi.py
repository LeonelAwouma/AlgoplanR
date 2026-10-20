"""Report des décisions enregistrées sur une projection, et indicateurs de suivi.

Règle partagée avec les données factices de l'interface (frontend/mocks/suivi-planification.ts), appliquée à
l'identique :
  - quota retenu : somme des quotas ajustés ou validés du périmètre, `None` tant qu'aucun ne l'est. Les quotas sont
    fixés par région : un périmètre plus fin (département, commune) n'a pas de quota retenu ;
  - nominations prévues / réalisées : nominations validées / mises en œuvre sur un poste du périmètre ;
  - déploiements prévus / réalisés : mouvements du registre (hors nominations) vers une école du périmètre ;
  - besoin restant : besoin − ressources du vivier − quota retenu ;
  - effectifs : quand les recrutements des années précédentes sont supposés réalisés, l'écart entre quota retenu
    et quota calculé d'une année se reporte sur l'effectif des années suivantes.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from ..commun.texte import norm
from .rapport import stock_fin


def dans(lieu: Optional[Dict[str, str]], p: Dict[str, Optional[str]]) -> bool:
    """Vrai si un lieu (école) appartient au périmètre (région, département, commune, IAEB, sous-système)."""
    if not lieu:
        return False
    if p.get("ecole") and lieu.get("ecole") != p["ecole"]:
        return False
    for cle in ("region", "departement", "commune", "iaeb"):
        if p.get(cle) and norm(lieu.get(cle)) != norm(p[cle]):
            return False
    if p.get("sous_systeme") and (lieu.get("sous_systeme") or "non_renseigne") != p["sous_systeme"]:
        return False
    return True


def quota_retenu(annee: str, p: Dict[str, Optional[str]], quotas: List[dict]) -> Optional[int]:
    if p.get("departement") or p.get("commune") or p.get("iaeb") or p.get("ecole"):
        return None
    retenus = [q for q in quotas if q["annee"] == annee
               and (not p.get("region") or norm(q["territoire"]) == norm(p["region"]))
               and (not p.get("sous_systeme") or q["sous_systeme"] == p["sous_systeme"])]
    if not any(q["statut"] != "calcule" for q in retenus):
        return None
    return sum(int(q["retenu"]) for q in retenus)


def appliquer_suivi(annees: List[dict], p: Dict[str, Optional[str]], *, quotas: List[dict],
                    nominations: List[dict], mouvements: List[dict], recrutements_supposes: bool) -> List[dict]:
    """`nominations` : {annee, statut, lieu} ; `mouvements` : {type, annee, statut, lieu} (lieu de destination)."""
    ecart = 0
    sortie = []
    for a in annees:
        retenu = quota_retenu(a["annee"], p, quotas)
        compte_n = lambda statut: sum(1 for n in nominations  # noqa: E731
                                      if n["annee"] == a["annee"] and n["statut"] == statut and dans(n["lieu"], p))
        compte_m = lambda statut: sum(1 for m in mouvements  # noqa: E731
                                      if m["type"] != "nomination" and m["annee"] == a["annee"]
                                      and m["statut"] == statut and dans(m["lieu"], p))
        debut = max(0, a["effectif_debut"] + ecart)
        # Recrues de l'année : celles du scénario de calcul, ou le quota retenu quand l'administration l'a fixé.
        recrutement = a.get("recrutement", 0)
        if recrutements_supposes and retenu is not None:
            recrutement = retenu
        ligne = {**a, "effectif_debut": debut, "quota_retenu": retenu, "recrutement": recrutement,
                 "nominations_prevues": compte_n("validee"), "nominations_realisees": compte_n("mise_en_oeuvre"),
                 "deploiements_prevus": compte_m("prevu"), "deploiements_realises": compte_m("realise"),
                 "besoin_restant": max(0, a["besoin"] - a["ressources_vivier"] - (retenu or 0))}
        ligne["effectif_fin"] = stock_fin(ligne)
        if a.get("eleves"):                   # REM projeté : élèves de l'année ÷ effectif au début de l'année (ajusté)
            ligne["rem"] = round(a["eleves"] / debut, 1) if debut > 0 else None
        if recrutements_supposes and retenu is not None:
            ecart += retenu - a["quota_calcule"]
        sortie.append(ligne)
    return sortie


def _pct(a: float, b: float) -> Optional[int]:
    return round(a / b * 100) if b > 0 else None


def indicateurs_suivi(n1: dict) -> List[dict]:
    """Les cinq indicateurs de suivi, d'après la première année (N+1) d'un tableau suivi."""
    nommes = n1["nominations_prevues"] + n1["nominations_realisees"]
    return [
        {"code": "couverture_besoin", "libelle": "Couverture du besoin de N+1 par les redéploiements",
         "valeur": _pct(n1["deploiements_prevus"], n1["deploiements_prevus"] + n1["besoin"]),
         "unite": "pourcentage",
         "detail": f"{n1['deploiements_prevus']} redéploiement(s) prévu(s) pour {n1['besoin']} poste(s) encore à pourvoir."},
        {"code": "mobilisation_vivier", "libelle": "Mobilisation du vivier",
         "valeur": _pct(nommes, n1["ressources_vivier"]) if n1["ressources_vivier"] else 0, "unite": "pourcentage",
         "detail": f"{n1['ressources_vivier']} personne(s) disponible(s), {nommes} nommée(s)."},
        {"code": "realisation_nominations", "libelle": "Réalisation des nominations",
         "valeur": _pct(n1["nominations_realisees"], nommes), "unite": "pourcentage",
         "detail": (f"{n1['nominations_realisees']} nomination(s) mise(s) en œuvre sur {nommes} validée(s)."
                    if nommes else "Aucune nomination validée pour l'instant.")},
        {"code": "ecart_prevu_realise", "libelle": "Écart entre mouvements prévus et réalisés",
         "valeur": n1["deploiements_prevus"] + n1["nominations_prevues"], "unite": "nombre",
         "detail": "Mouvements prévus non encore mis en œuvre."},
        {"code": "besoin_residuel", "libelle": "Besoin restant en N+1", "valeur": n1["besoin_restant"],
         "unite": "nombre", "detail": "Après mobilisation du vivier et quotas retenus."},
    ]
