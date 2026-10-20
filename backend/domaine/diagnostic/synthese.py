"""Diagnostic (Moteur A), priorités, points d'attention et texte narratif (règles, sans LLM)."""
from __future__ import annotations

from typing import Dict, List, Optional

from ..donnees import colonnes as C
from .territoires import Perimetre, filtrer_lignes


def totaux_diagnostic(ecoles: List[dict]) -> dict:
    """Totaux du diagnostic des lignes données (bases après, ou avant, les faits du Prince selon l'appelant).

    `besoin_postes_avant_prince` : besoin des mêmes écoles avant les faits du Prince, quand les lignes le portent.
    """
    besoin = sum(int(e.get("nb_postes_ouverts", 0) or 0) for e in ecoles)
    avant = sum(int(e.get("Besoin_Avant_Prince", e.get("nb_postes_ouverts", 0)) or 0) for e in ecoles)
    return {
        "nb_ecoles": len(ecoles),
        "besoin_postes": besoin,
        "besoin_postes_avant_prince": avant,
        "besoin_postes_apres_prince": besoin,
        "excedent_enseignants": int(sum(float(e.get("xe", 0) or 0) for e in ecoles)),
        "nb_ecoles_necessiteuses": sum(1 for e in ecoles if e.get("est_necessiteuse")),
        "nb_ecoles_excedentaires": sum(1 for e in ecoles if e.get("est_excedentaire")),
        "nb_ecoles_zone_rouge": sum(1 for e in ecoles if e.get("est_zone_rouge")),
        "salles_manquantes": int(sum(float(e.get("se", 0) or 0) for e in ecoles)),
        "enseignants_en_poste": int(sum(float(e.get(C.COL_ETAB_EE, 0) or 0) for e in ecoles)),
        "dotation_theorique": int(sum(float(e.get("De", 0) or 0) for e in ecoles)),
    }


def filtrer_ecoles(ecoles: List[dict], *, perimetre: Perimetre, zone: str = "", securite: str = "",
                   sous_systeme: str = "", type_etab: str = "", seulement: str = "", q: str = "") -> List[dict]:
    from ..commun.texte import cle_recherche, norm
    res = filtrer_lignes(ecoles, perimetre, C.COL_ETAB_REGION, C.COL_ETAB_DEPT, C.COL_ETAB_COMMUNE)
    if zone:
        res = [e for e in res if norm(e.get(C.COL_ETAB_ALPHA)) == norm(zone)]
    if securite:
        res = [e for e in res if norm(e.get(C.COL_ETAB_SIGMA)) == norm(securite)]
    if sous_systeme:
        res = [e for e in res if norm(e.get(C.COL_ETAB_SS)) == norm(sous_systeme)]
    if type_etab:
        res = [e for e in res if norm(e.get("type_etab")) == norm(type_etab)]
    if seulement == "necessiteuses":
        res = [e for e in res if e.get("est_necessiteuse")]
    elif seulement == "excedentaires":
        res = [e for e in res if e.get("est_excedentaire")]
    elif seulement == "zone_rouge":
        res = [e for e in res if e.get("est_zone_rouge")]
    if q:
        k = cle_recherche(q)
        res = [e for e in res if k in cle_recherche(e.get(C.COL_ETAB_ID)) or k in cle_recherche(e.get("nom_etab"))
               or k in cle_recherche(e.get(C.COL_ETAB_COMMUNE))]
    return res


def raisons_priorite(e: dict) -> List[str]:
    r = []
    if e.get("est_zone_rouge"):
        r.append("Zone à sécurité critique (rouge)")
    if (e.get("alpha") or 0) >= 15:
        r.append("Accessibilité difficile (zone rurale ou enclavée)")
    if (e.get("beta") or 0) >= 10:
        r.append("Remplissage des classes élevé (élèves par enseignant)")
    if (e.get("nb_postes_ouverts") or 0) > 0:
        r.append(f"{int(e['nb_postes_ouverts'])} poste(s) ouvert(s)")
    if (e.get("se") or 0) > 0:
        r.append(f"{int(e['se'])} salle(s) manquante(s)")
    if (e.get(C.COL_ETAB_EE) or 0) <= 0:
        r.append("Aucun enseignant en poste")
    return r


STRUCTURES = ("IAEB", "DREB", "DELEGATION")


def _rem(e: dict) -> float:
    """Élèves par enseignant ; une école sans maître mais avec des élèves passe en premier."""
    ee, ne = float(e.get(C.COL_ETAB_EE, 0) or 0), float(e.get(C.COL_ETAB_NE, 0) or 0)
    return ne / ee if ee > 0 else (float("inf") if ne > 0 else 0.0)


def ordre_priorite(ecoles: List[dict]) -> List[dict]:
    """Écoles à besoin, dans l'ordre de priorité d'accueil (méthodologie §3.3.4) : poids du poste Up décroissant ;
    à poids égal les écoles avant les structures (IAEB, DREB…), puis le REM le plus élevé ; enfin, pour un ordre total,
    le nombre de postes ouverts, la zone rouge puis l'identifiant. C'est l'ordre unique : l'interface l'affiche tel quel."""
    necessiteuses = [e for e in ecoles if e.get("est_necessiteuse")]
    necessiteuses.sort(key=lambda e: (-float(e.get("Up", 0) or 0), str(e.get("type_etab") or "").upper() in STRUCTURES,
                                      -_rem(e), -int(e.get("nb_postes_ouverts", 0) or 0),
                                      not e.get("est_zone_rouge"), str(e.get(C.COL_ETAB_ID))))
    return necessiteuses


def attribuer_rangs(ecoles: List[dict]) -> List[dict]:
    """Ajoute `rang_priorite` (1 = premier ; `None` pour une école sans besoin) à chaque ligne, en place."""
    rangs = {e[C.COL_ETAB_ID]: i for i, e in enumerate(ordre_priorite(ecoles), 1)}
    for e in ecoles:
        e["rang_priorite"] = rangs.get(e[C.COL_ETAB_ID])
    return ecoles


def trier_par_priorite(ecoles: List[dict]) -> List[dict]:
    """Priorité d'affectation (voir `ordre_priorite`), avec rang et raisons."""
    return [{**e, "rang": i + 1, "raisons": raisons_priorite(e)} for i, e in enumerate(ordre_priorite(ecoles))]


def points_attention(synthese: dict, ecoles: List[dict]) -> List[dict]:
    pts = []
    besoin = synthese.get("besoin_total", 0)
    if synthese.get("postes_rouge_non_pourvus", 0) > 0:
        pts.append({"code": "ZONE_ROUGE", "gravite": "critique",
                    "message": f"{synthese['postes_rouge_non_pourvus']} poste(s) en zone rouge restent non pourvus."})
    if besoin:
        taux = synthese.get("affectes", 0) / besoin
        if taux < 0.5:
            pts.append({"code": "COUVERTURE_FAIBLE", "gravite": "alerte",
                        "message": f"Seuls {taux:.0%} du besoin sont couverts par la mobilité interne."})
    if synthese.get("non_affectes", 0) > 0:
        pts.append({"code": "VIVIER_RESIDUEL", "gravite": "info",
                    "message": f"{synthese['non_affectes']} enseignant(s) du vivier restent sans poste compatible."})
    if synthese.get("a_recruter", 0) > 0:
        pts.append({"code": "RECRUTEMENT", "gravite": "alerte",
                    "message": f"{synthese['a_recruter']} poste(s) devront être pourvus par recrutement."})
    manquantes = int(sum(float(e.get("se", 0) or 0) for e in ecoles))
    if manquantes > 0:
        pts.append({"code": "SALLES", "gravite": "info",
                    "message": f"{manquantes} salle(s) de classe manquante(s) limitent la dotation effective."})
    if synthese.get("effet_de_prince", 0) > 0:
        pts.append({"code": "PRINCE", "gravite": "info",
                    "message": f"{synthese['effet_de_prince']} mouvement(s) du Prince appliqués aux bases avant l'algorithme."})
    return pts


def texte_narratif(synthese: dict, perimetre_titre: str) -> str:
    b, a = synthese.get("besoin_total", 0), synthese.get("affectes", 0)
    couv = f"{a / b:.0%}" if b else "n/a"
    return (f"Périmètre {perimetre_titre} : {b} poste(s) à pourvoir pour {synthese.get('disponibles', 0)} "
            f"enseignant(s) mobilisable(s), après les {synthese.get('effet_de_prince', 0)} mouvement(s) du Prince "
            f"appliqués aux bases. {a} affectation(s) réalisée(s) (couverture {couv}). "
            f"{synthese.get('postes_non_pourvus', 0)} poste(s) restent à pourvoir par recrutement.")
