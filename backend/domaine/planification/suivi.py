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

from ..commun.encadrement import CHIFFRES_ENCADREMENT, ratio_encadrement
from ..commun.texte import norm
from .projection import arrondi
from .rapport import disponibles_fin, stock_fin


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
    """`nominations` : {annee, statut, lieu} ; `mouvements` : {type, annee, statut, lieu} (lieu de destination).

    Quand un quota retenu s'écarte du quota calculé, le modèle M1 (attrition appliquée à Effectif(t)) impose de
    recalculer l'attrition de l'année sur l'effectif de début réellement ajusté, et non sur l'effectif de la
    trajectoire théorique d'origine (lot 4, E3). La variation d'attrition qui en résulte est répercutée sur le
    besoin de l'année (même convention additive que `calculer_annees`, où l'attrition cumulée entre dans le
    besoin cumulé), puis l'écart se propage à l'année suivante via l'effectif de fin d'année, qu'il vienne d'une
    recrue différente du quota calculé ou d'une attrition elle-même modifiée par l'ajustement précédent.
    """
    ecart = 0
    sortie = []
    for k, a in enumerate(annees):
        retenu = quota_retenu(a["annee"], p, quotas)
        compte_n = lambda statut: sum(1 for n in nominations  # noqa: E731
                                      if n["annee"] == a["annee"] and n["statut"] == statut and dans(n["lieu"], p))
        compte_m = lambda statut: sum(1 for m in mouvements  # noqa: E731
                                      if m["type"] != "nomination" and m["annee"] == a["annee"]
                                      and m["statut"] == statut and dans(m["lieu"], p))
        debut = max(0, a["effectif_debut"] + ecart)
        # Attrition M1 recalculée sur l'effectif de début réellement ajusté (E3) ; inchangée si aucun écart ne
        # s'est encore propagé (debut == a["effectif_debut"]).
        attrition_ajustee = arrondi(a.get("taux_attrition", 0) * debut / 100.0)
        delta_attrition = attrition_ajustee - a["departs_attrition"]
        besoin_ajuste = max(0, a["besoin"] + delta_attrition)
        # Recrues de l'année : celles du scénario de calcul, ou le quota retenu quand l'administration l'a fixé.
        recrutement = a.get("recrutement", 0)
        if recrutements_supposes and retenu is not None:
            recrutement = retenu
        ligne = {**a, "effectif_debut": debut, "departs_attrition": attrition_ajustee, "besoin": besoin_ajuste,
                 "quota_retenu": retenu, "recrutement": recrutement,
                 "nominations_prevues": compte_n("validee"), "nominations_realisees": compte_n("mise_en_oeuvre"),
                 "deploiements_prevus": compte_m("prevu"), "deploiements_realises": compte_m("realise"),
                 "besoin_restant": max(0, besoin_ajuste - a["ressources_vivier"] - (retenu or 0))}
        ligne["effectif_fin"] = stock_fin(ligne)
        if "decharges_cumulees" in a:
            ligne["disponibles_debut"] = max(0, debut - a.get("decharges_avant", 0))
            ligne["disponibles_fin"] = disponibles_fin(ligne)
        if a.get("population_complete", True) and a.get("eleves"):
            # Taux d'encadrement projeté : élèves de l'année ÷ effectif au début de l'année (ajusté). Quand des écoles
            # ont un effectif d'élèves inconnu, la ligne garde celui de `calculer_annees` (année 1 sur la population
            # commune, puis « non disponible ») : l'ajustement de l'effectif ne peut pas être attribué à ces seules
            # écoles.
            # Dénominateur : enseignants disponibles (stock moins les décharges cumulées des années précédentes).
            dispo = max(0, debut - a.get("decharges_avant", 0))
            ligne["rem_brut"] = ratio_encadrement(a.get("eleves_brut", a["eleves"]), dispo)
            ligne["rem_denominateur"] = dispo
            ligne["rem"] = None if ligne["rem_brut"] is None else round(ligne["rem_brut"], CHIFFRES_ENCADREMENT)
        if recrutements_supposes and k + 1 < len(annees):
            # Écart réellement transmis à l'année suivante : fin d'année ajustée moins le début théorique (non
            # ajusté) de l'année suivante, tel que produit par `calculer_annees`. Capture à la fois l'écart de
            # recrutement (retenu vs quota calculé, quand une décision existe pour cette année) et celui,
            # désormais possible même sans nouvelle décision cette année-là, de l'attrition recalculée (E3) :
            # un écart hérité d'une année précédente continue de déplacer l'attrition des années suivantes même
            # quand aucun quota n'est retenu pour elles.
            ecart = ligne["effectif_fin"] - annees[k + 1]["effectif_debut"]
        sortie.append(ligne)
    return sortie


def _pct(a: float, b: float) -> Optional[int]:
    return round(a / b * 100) if b > 0 else None


def indicateurs_suivi(n1: dict, nominatif: bool = True) -> List[dict]:
    """Les cinq indicateurs de suivi, d'après la première année (N+1) d'un tableau suivi."""
    nommes = n1["nominations_prevues"] + n1["nominations_realisees"]
    if not nominatif:
        # Sans fichier nominatif, ni redéploiement ni nomination individuelle ne peut être enregistré : « 0 prévu »
        # ne serait pas un constat mais une impossibilité. Ces indicateurs sont donc non calculables (jamais 0).
        raison = "Non calculable : aucun mouvement ni nomination individuelle sans fichier nominatif des enseignants."
        return [
            {"code": "couverture_besoin", "libelle": "Couverture du besoin de N+1 par les redéploiements",
             "valeur": None, "unite": "pourcentage", "detail": raison},
            {"code": "mobilisation_vivier", "libelle": "Mobilisation du vivier", "valeur": None,
             "unite": "pourcentage",
             "detail": f"{raison} Estimation du vivier : {n1['ressources_vivier']} poste(s) excédentaire(s) "
                       "d'après le stock déclaré des écoles."},
            {"code": "realisation_nominations", "libelle": "Réalisation des nominations", "valeur": None,
             "unite": "pourcentage", "detail": raison},
            {"code": "ecart_prevu_realise", "libelle": "Écart entre mouvements prévus et réalisés", "valeur": None,
             "unite": "nombre", "detail": raison},
            {"code": "besoin_residuel", "libelle": "Besoin restant en N+1", "valeur": n1["besoin_restant"],
             "unite": "nombre",
             "detail": "Estimation conditionnelle : après le vivier estimé d'après le stock déclaré et les quotas "
                       "retenus."},
        ]
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
