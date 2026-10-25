"""Nettoyage, enrichissement des enseignants, constitution du vivier et des postes."""
from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Tuple

from ..donnees.modeles import Ecole, Enseignant, Poste
from .bareme import calculer_bareme


def nettoyer_enseignants(ens: Iterable[Enseignant], cfg: dict) -> Tuple[List[Enseignant], List[dict]]:
    """Exclut les agents sans âge valide ou ayant atteint l'âge de la retraite (nettoyer_enseignants)."""
    retraite = cfg["seuils"].get("age_retraite_ans", 60)
    gardes, exclus = [], []
    for e in ens:
        if e.age is None:
            exclus.append({"matricule": e.matricule, "raison": "Âge manquant ou invalide"})
        elif not (e.age < retraite):
            exclus.append({"matricule": e.matricule, "raison": f"Âge >= {retraite} ans (retraite)"})
        else:
            gardes.append(e)
    return gardes, exclus


def enrichir_enseignants(ens: Iterable[Enseignant], ecoles: Iterable[Ecole]) -> List[Enseignant]:
    index: Dict[str, Ecole] = {}
    for e in ecoles:
        index[e.id] = e
    res = list(ens)
    for p in res:
        ec = index.get(p.ecole_attache)
        if ec is None:
            p.commune_attache = p.departement_attache = p.region_attache = p.iaeb_attache = p.zone_attache = ""
            p.alpha_attache = p.sigma_attache = 0
            p.etab_attache_excedentaire = False
        else:
            p.commune_attache, p.departement_attache = ec.commune, ec.departement
            p.region_attache, p.iaeb_attache = ec.region, ec.iaeb
            p.zone_attache = ec.accessibilite
            p.alpha_attache, p.sigma_attache = ec.ind.alpha, ec.ind.sigma
            p.etab_attache_excedentaire = ec.ind.est_excedentaire
    return res


def construire_postes(ecoles: Iterable[Ecole]) -> List[Poste]:
    postes: List[Poste] = []
    for e in ecoles:
        for k in range(int(e.ind.nb_postes_ouverts or 0)):
            postes.append(Poste(
                id_poste=f"{e.id}_P{k + 1}", id_etab=e.id, nom_etab=e.nom or e.id, commune=e.commune,
                departement=e.departement, region=e.region, iaeb=e.iaeb, accessibilite=e.accessibilite,
                securite=e.securite, multigrade=e.multigrade, sous_systeme=e.sous_systeme.strip(),
                type_etab=e.type_etab, Up=float(e.ind.Up or 0), Wp=float(e.ind.Wp or 0),
                est_zone_rouge=bool(e.ind.est_zone_rouge), latitude=e.latitude, longitude=e.longitude,
            ))
    return postes


def construire_vivier(ens: Iterable[Enseignant], ecoles: Iterable[Ecole], cfg: dict, *,
                      exclus: Optional[Iterable[str]] = None) -> List[Enseignant]:
    """Vivier = pour chaque école excédentaire, ses meilleurs agents (ancienneté au poste >= seuil), dans la limite de
    son excédent sûr : la part de l'excédent qui dépend d'un minimum pédagogique non observé (classes multigrades
    inconnues, ancien « Oui ») attend une validation administrative et ne déclenche aucune sortie automatique.

    `exclus` : matricules écartés de la mobilité ordinaire, comme les agents déjà déplacés par un fait du Prince.
    """
    ens = list(ens)
    ecartes = set(exclus or ())
    for e in ens:
        e.bareme = calculer_bareme(e, cfg)
    seuil = int(cfg["seuils"]["anciennete_poste_recevabilite_ans"])

    quotas: Dict[str, float] = {}
    for ec in ecoles:
        if ec.ind.xe_sur > 0:
            quotas[ec.id.strip()] = ec.ind.xe_sur

    par_ecole: Dict[str, List[Enseignant]] = {}
    for e in ens:
        if e.matricule in ecartes:
            continue
        if float(e.anciennete_poste or 0) >= seuil:
            par_ecole.setdefault(e.ecole_attache, []).append(e)

    retenus: List[Enseignant] = []
    for id_ecole, xe in quotas.items():
        cands = sorted(par_ecole.get(id_ecole, []), key=lambda x: -x.bareme)
        retenus.extend(cands[:int(xe)])

    retenus.sort(key=lambda x: (-x.bareme, -float(x.anciennete_carriere or 0), -float(x.age or 0)))
    return retenus
