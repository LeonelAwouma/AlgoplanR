"""Faits du Prince (phase 0) : vérification d'un fait et analyse d'un fichier de décisions."""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from ..commun.texte import est_vide, texte
from ..donnees import colonnes as C
from ..donnees.modeles import Ecole, Enseignant

MOTIF_DEFAUT = "Décision de l'autorité (Effet de prince)"


def diagnostiquer_eligibilite(ens: Optional[Enseignant], ecoles: Dict[str, Ecole], cfg: dict,
                              vivier_ids: Iterable[str]) -> dict:
    """Pourquoi un enseignant est (ou n'est pas) dans le vivier (raison de non-mobilité)."""
    if ens is None:
        return {"eligible": False, "code": "INCONNU", "raison": "Matricule absent du jeu de données"}
    seuils = cfg["seuils"]
    if ens.age is None:
        return {"eligible": False, "code": "AGE_INVALIDE", "raison": "Âge manquant ou invalide"}
    if not (ens.age < seuils["age_retraite_ans"]):
        return {"eligible": False, "code": "RETRAITE",
                "raison": f"Âge >= {seuils['age_retraite_ans']} ans (départ à la retraite)"}
    ec = ecoles.get(ens.ecole_attache)
    if ec is None:
        return {"eligible": False, "code": "ECOLE_INCONNUE", "raison": "École d'attache absente du référentiel"}
    if not ec.ind.est_excedentaire:
        return {"eligible": False, "code": "ECOLE_NON_EXCEDENTAIRE",
                "raison": "L'école d'attache n'a pas d'enseignant excédentaire"}
    if float(ens.anciennete_poste or 0) < seuils["anciennete_poste_recevabilite_ans"]:
        return {"eligible": False, "code": "ANCIENNETE",
                "raison": f"Ancienneté au poste < {seuils['anciennete_poste_recevabilite_ans']} ans"}
    if ens.matricule not in set(vivier_ids):
        return {"eligible": False, "code": "HORS_QUOTA",
                "raison": f"Quota d'excédent de l'école atteint ({int(ec.ind.xe)} agent(s) mobilisable(s))"}
    return {"eligible": True, "code": "VIVIER", "raison": "Dans le vivier"}


def verifier_fait_prince(id_ens: str, id_etab: str, *, enseignants: Dict[str, Enseignant], ecoles: Dict[str, Ecole],
                         vivier_ids: Iterable[str], cfg: dict, faits_actifs: Iterable[dict]) -> List[str]:
    """Retourne la liste des motifs de refus (vide = fait recevable) — verifierFaitPrince."""
    motifs: List[str] = []
    id_ens, id_etab = texte(id_ens), texte(id_etab)
    if not id_ens:
        motifs.append("Matricule de l'enseignant manquant")
    if not id_etab:
        motifs.append("Identifiant de l'école manquant")
    if motifs:
        return motifs
    if id_etab not in ecoles:
        motifs.append(f"École inconnue : {id_etab}")
    diag = diagnostiquer_eligibilite(enseignants.get(id_ens), ecoles, cfg, vivier_ids)
    if not diag["eligible"]:
        motifs.append(f"Enseignant non mobilisable : {diag['raison']}")
    if any(f["id_ens"] == id_ens for f in faits_actifs):
        motifs.append("Un fait de Prince actif existe déjà pour cet enseignant")
    return motifs


def analyser_fichier_prince(lignes: List[Dict[str, Any]]) -> Dict[str, List[dict]]:
    """Normalise les lignes d'un fichier (colonnes id_ens / id_etab / motif, ou noms officiels)."""
    acceptees, refusees = [], []
    for n, l in enumerate(lignes, 1):
        ens = texte(l.get("id_ens") or l.get(C.COL_ENS_ID) or l.get("Matricule"))
        etab = texte(l.get("id_etab") or l.get(C.COL_ETAB_ID) or l.get("Ecole"))
        motif = texte(l.get("motif") or l.get("Motif"))
        if not ens or not etab:
            refusees.append({"ligne": n, "id_ens": ens, "id_etab": etab, "motifs": ["Matricule ou école manquant"]})
        else:
            acceptees.append({"ligne": n, "id_ens": ens, "id_etab": etab, "motif": "" if est_vide(motif) else motif})
    return {"acceptees": acceptees, "refusees": refusees}
