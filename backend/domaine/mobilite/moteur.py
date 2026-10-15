"""Moteur d'affectation (phases 0 à 4) — portage de run_affectation, sans pandas.

L'état (postes pourvus, agents affectés) est explicite et local à une exécution : le moteur est
déterministe et ne modifie ni ses entrées ni l'état global.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..commun.horloge import Horloge, horloge_systeme
from ..commun.texte import est_vide, norm
from ..donnees import colonnes as C
from ..donnees.modeles import Ecole, Enseignant, Poste
from .projection import generer_projections_n3
from .score import score_enseignant_poste
from .selection import IndexPostes
from .vivier import construire_postes, construire_vivier, enrichir_enseignants, nettoyer_enseignants

#: Phases 2 et 3 : sélection indexée (selection.py), au résultat identique à `choisir_meilleur_poste`.
#: Désactivable pour comparer les deux chemins (tests/test_selection.py).
SELECTION_RAPIDE = True


@dataclass
class ResultatAffectation:
    synthese: Dict[str, Any]
    ecoles_en_besoin: List[dict]
    ecoles_fournisseurs: List[dict]
    affectations: List[dict]
    non_affectes: List[dict]
    postes_non_pourvus: List[dict]
    postes_rouge_non_pourvus: List[dict]
    vivier: List[dict]
    etab_enrichi: List[dict]
    projections_n3: List[dict]
    journal_audit: List[dict]
    enseignants_exclus: List[dict] = field(default_factory=list)

    def vers_dict(self) -> Dict[str, Any]:
        return dict(self.__dict__)

    @classmethod
    def depuis_dict(cls, d: Dict[str, Any]) -> "ResultatAffectation":
        champs = cls.__dataclass_fields__.keys()
        return cls(**{k: d.get(k, [] if k != "synthese" else {}) for k in champs})


class _Etat:
    """État d'une exécution : postes, agents affectés, index des postes libres."""

    def __init__(self, postes: List[Poste], vivier: List[Enseignant]):
        self.postes = postes
        self.vivier = vivier
        self.affecte = [False] * len(vivier)
        self.libres: Dict[str, Poste] = {p.id_poste: p for p in postes if not p.pourvu}
        self.par_etab: Dict[str, List[Poste]] = {}
        for p in postes:
            self.par_etab.setdefault(p.id_etab.strip(), []).append(p)
        self.index: Optional[IndexPostes] = None

    def pourvoir(self, poste: Poste) -> None:
        poste.pourvu = True
        self.libres.pop(poste.id_poste, None)

    def ajouter_poste_pourvu(self, poste: Poste) -> None:
        poste.pourvu = True
        self.postes.append(poste)


# ---------------------------------------------------------------------------
# Filtres et sélection
# ---------------------------------------------------------------------------

def _filtre_sous_systeme(postes: List[Poste], e: Enseignant) -> List[Poste]:
    ss = norm(e.sous_systeme)
    if not ss:
        return postes
    return [p for p in postes if norm(p.sous_systeme) == ss]


def _filtre_zone_rouge(postes: List[Poste], autoriser: bool) -> List[Poste]:
    return postes if autoriser else [p for p in postes if not p.est_zone_rouge]


def choisir_meilleur_poste(e: Enseignant, candidats: List[Poste], cfg: dict, *, contrainte_commune=False,
                           contrainte_dept=False, contrainte_iaeb=False,
                           autoriser_zone_rouge=False) -> Optional[Poste]:
    cands = _filtre_zone_rouge(_filtre_sous_systeme(candidats, e), autoriser_zone_rouge)
    if contrainte_commune and norm(e.commune_attache):
        c = norm(e.commune_attache)
        cands = [p for p in cands if norm(p.commune) == c]
    if contrainte_dept and norm(e.departement_attache):
        d = norm(e.departement_attache)
        cands = [p for p in cands if norm(p.departement) == d]
    if contrainte_iaeb and norm(e.iaeb_attache):
        i = norm(e.iaeb_attache)
        cands = [p for p in cands if norm(p.iaeb) == i]
    meilleur, meilleur_score = None, None
    for p in cands:
        s = score_enseignant_poste(e, p, cfg)
        if meilleur_score is None or s > meilleur_score:   # à égalité, le premier poste est conservé
            meilleur, meilleur_score = p, s
    return meilleur


def _aff_item(e: Enseignant, p: Poste, cfg: dict, phase: str, motif: str = "", arbitrage: str = "") -> dict:
    item = {
        "phase": phase, "id_poste": p.id_poste, "id_etab": p.id_etab, "nom_etab": p.nom_etab,
        "commune_poste": p.commune, "departement_poste": p.departement, "region_poste": p.region,
        "zone_poste": p.accessibilite, "sous_systeme": p.sous_systeme,
        "id_ens": e.matricule, "nom_ens": e.nom, "prenom_ens": e.prenom,
        "commune_origine": e.commune_attache, "departement_origine": e.departement_attache,
        "region_origine": e.region_attache,
        "sous_systeme_ens": e.sous_systeme, "bareme": e.bareme,
        "score_affectation": score_enseignant_poste(e, p, cfg), "age": e.age,
        "anciennete_poste_ans": e.anciennete_poste, "anciennete_carriere_ans": e.anciennete_carriere,
        "motif_derogation": motif, "arbitrage": arbitrage,
    }
    if p.latitude is not None:
        item["latitude"] = p.latitude
    if p.longitude is not None:
        item["longitude"] = p.longitude
    return item


# ---------------------------------------------------------------------------
# Phases
# ---------------------------------------------------------------------------

def _phase1_voeux(et: _Etat, cfg: dict) -> List[dict]:
    candidatures: Dict[str, list] = {}
    for i, e in enumerate(et.vivier):
        if et.affecte[i]:
            continue
        for num, voeu in enumerate(e.voeux, 1):
            id_voeu = (voeu or "").strip()
            if est_vide(id_voeu):
                continue
            libres = [p for p in et.par_etab.get(id_voeu, []) if not p.pourvu]
            libres = _filtre_zone_rouge(_filtre_sous_systeme(libres, e), True)
            if not libres:
                continue
            p = libres[0]
            candidatures.setdefault(p.id_poste, []).append((score_enseignant_poste(e, p, cfg), i, num, p))

    res: List[dict] = []
    for id_poste, liste in candidatures.items():
        if liste[0][3].pourvu:
            continue
        liste.sort(key=lambda x: x[0], reverse=True)
        for _, i, num, p in liste:
            if not et.affecte[i]:
                et.affecte[i] = True
                et.pourvoir(p)
                res.append(_aff_item(et.vivier[i], p, cfg, f"phase1_voeu_{num}", arbitrage="voeu_satisfait"))
                break
    return res


def _par_proximite(et: _Etat, cfg: dict, phase: str, **contraintes) -> List[dict]:
    res: List[dict] = []
    ordre = sorted(range(len(et.vivier)), key=lambda i: -et.vivier[i].bareme)
    # L'index ne contient que des postes hors zone rouge, comme le veulent les phases 2 et 3.
    rapide = (SELECTION_RAPIDE and not contraintes.get("autoriser_zone_rouge")
              and not contraintes.get("contrainte_commune"))
    if rapide and et.index is None:
        # Construit après les phases 0 et 1 : les postes déjà pourvus n'y entrent pas.
        et.index = IndexPostes(et.postes)
    for i in ordre:
        if et.affecte[i]:
            continue
        e = et.vivier[i]
        if rapide:
            p = et.index.meilleur(e, cfg, contrainte_dept=bool(contraintes.get("contrainte_dept")),
                                  contrainte_iaeb=bool(contraintes.get("contrainte_iaeb")))
        else:
            p = choisir_meilleur_poste(e, list(et.libres.values()), cfg, **contraintes)
        if p is None:
            continue
        et.affecte[i] = True
        et.pourvoir(p)
        res.append(_aff_item(e, p, cfg, phase, arbitrage="recherche_proximite"))
    return res


def _phase0_prince(et: _Etat, ecoles_par_id: Dict[str, Ecole], faits: List[dict], cfg: dict,
                   horloge: Horloge, journal: List[dict], deja: int) -> List[dict]:
    res: List[dict] = []
    for item in faits:
        ens_id = str(item.get("id_ens", "")).strip()
        etab_id = str(item.get("id_etab", "")).strip()
        motif = item.get("motif") or "Décision de l'autorité (Effet de prince)"
        if not ens_id or not etab_id:
            continue
        idx = next((k for k, e in enumerate(et.vivier) if e.matricule.strip() == ens_id), None)
        base = {"timestamp": horloge(), "phase": "effet_de_prince", "id_ens": ens_id, "id_etab": etab_id}
        if idx is None:
            journal.append({**base, "statut": "REJETE", "motif": f"Enseignant introuvable dans le vivier ({motif})"})
            continue
        if et.affecte[idx]:
            journal.append({**base, "statut": "REJETE", "motif": "Enseignant déjà affecté"})
            continue
        e = et.vivier[idx]
        libres = [p for p in et.par_etab.get(etab_id, []) if not p.pourvu]
        if libres:
            poste = libres[0]
            et.pourvoir(poste)
        else:
            ec = ecoles_par_id.get(etab_id)
            poste = Poste(
                id_poste=f"{etab_id}_P_PRINCE_{deja + len(res) + 1}", id_etab=etab_id,
                nom_etab=ec.id if ec else "", commune=ec.commune if ec else "",
                departement=ec.departement if ec else "", region=ec.region if ec else "",
                iaeb=ec.iaeb if ec else "", accessibilite=ec.accessibilite if ec else "",
                securite=ec.securite if ec else "", multigrade=ec.multigrade if ec else "",
                sous_systeme=ec.sous_systeme if ec else "", type_etab=ec.type_etab if ec else "ECOLE",
                Up=0.0, Wp=0.0, est_zone_rouge=False,
                latitude=ec.latitude if ec else None, longitude=ec.longitude if ec else None,
            )
            et.ajouter_poste_pourvu(poste)
        et.affecte[idx] = True
        res.append(_aff_item(e, poste, cfg, "effet_de_prince", motif=motif, arbitrage="fait_du_prince"))
        journal.append({**base, "id_poste": poste.id_poste, "statut": "FAIT_DU_PRINCE", "motif": motif})
    return res


def _phase_arbitrages(et: _Etat, arbitrages: List[dict], cfg: dict, horloge: Horloge,
                      journal: List[dict]) -> List[dict]:
    """Décisions de commission (extension du contrat d'API ; absente du moteur d'origine)."""
    res: List[dict] = []
    for a in arbitrages:
        ens_id = str(a.get("id_ens", "")).strip()
        etab_id = str(a.get("id_etab", "")).strip()
        motif = a.get("motif") or "Décision de commission"
        base = {"timestamp": horloge(), "phase": "arbitrage_commission", "id_ens": ens_id, "id_etab": etab_id}
        idx = next((k for k, e in enumerate(et.vivier) if e.matricule.strip() == ens_id), None)
        if idx is None:
            journal.append({**base, "statut": "REJETE", "motif": "Enseignant introuvable dans le vivier"})
            continue
        if et.affecte[idx]:
            journal.append({**base, "statut": "REJETE", "motif": "Enseignant déjà affecté"})
            continue
        libres = [p for p in et.par_etab.get(etab_id, []) if not p.pourvu]
        libres = _filtre_sous_systeme(libres, et.vivier[idx])
        if not libres:
            journal.append({**base, "statut": "REJETE", "motif": "Aucun poste libre compatible dans l'école"})
            continue
        et.affecte[idx] = True
        et.pourvoir(libres[0])
        res.append(_aff_item(et.vivier[idx], libres[0], cfg, "arbitrage_commission",
                             motif=motif, arbitrage="decision_commission"))
        journal.append({**base, "id_poste": libres[0].id_poste, "statut": "VALIDE", "motif": motif})
    return res


def _journaliser(journal: List[dict], horloge: Horloge, affs: List[dict], motif: str) -> None:
    for a in affs:
        journal.append({"timestamp": horloge(), "phase": a["phase"], "id_ens": a["id_ens"],
                        "id_etab": a["id_etab"], "id_poste": a["id_poste"], "statut": "VALIDE", "motif": motif})


COLONNES_ECOLE_BESOIN = [C.COL_ETAB_ID, C.COL_ETAB_SS, C.COL_ETAB_REGION, C.COL_ETAB_DEPT, C.COL_ETAB_COMMUNE,
                         C.COL_ETAB_IAEB, C.COL_ETAB_ALPHA, C.COL_ETAB_SIGMA, "nb_postes_ouverts", "Up", "De",
                         "BMAX", "Pe", "xe", "se", "latitude", "longitude"]


def lancer_affectation(ecoles: List[Ecole], enseignants: List[Enseignant], cfg: dict, *,
                       faits_prince: Optional[List[dict]] = None, arbitrages: Optional[List[dict]] = None,
                       horloge: Horloge = horloge_systeme) -> ResultatAffectation:
    """Exécute le moteur. Les entrées sont copiées : elles ne sont pas modifiées."""
    import copy
    # Copie simple de chaque objet : le moteur ne fait que réaffecter leurs attributs (y compris `ind`,
    # remplacé par enrichir_ecoles), sans modifier d'objet imbriqué. Une copie profonde de 30 000 écoles
    # et 39 000 enseignants coûtait les deux tiers du temps de calcul.
    ecoles = [copy.copy(e) for e in ecoles]
    enseignants = [copy.copy(e) for e in enseignants]
    from ..diagnostic.indicateurs import enrichir_ecoles
    enrichir_ecoles(ecoles, cfg)
    ens, exclus = nettoyer_enseignants(enseignants, cfg)
    ens = enrichir_enseignants(ens, ecoles)
    postes = construire_postes(ecoles)
    vivier = construire_vivier(ens, ecoles, cfg)
    et = _Etat(postes, vivier)
    ecoles_par_id = {e.id: e for e in ecoles}

    toutes: List[dict] = []
    journal: List[dict] = []
    regles = cfg["regles_dreb"]

    if faits_prince and vivier:
        toutes += _phase0_prince(et, ecoles_par_id, faits_prince, cfg, horloge, journal, 0)

    besoin = len(et.postes)
    dispo = len(vivier)

    if regles.get("phase1_voeux_actif", True):
        a = _phase1_voeux(et, cfg)
        toutes += a
        _journaliser(journal, horloge, a, "Vœu satisfait")
    if regles.get("phase2_proximite_iaeb", True):
        a = _par_proximite(et, cfg, "phase2_proximite_iaeb", contrainte_iaeb=True)
        toutes += a
        _journaliser(journal, horloge, a, "Proximité IAEB")
    if regles.get("phase2_proximite_departement", True):
        a = _par_proximite(et, cfg, "phase2_proximite_departement", contrainte_dept=True)
        toutes += a
        _journaliser(journal, horloge, a, "Proximité département")
    if regles.get("phase3_extension_regionale", True):
        a = _par_proximite(et, cfg, "phase3_extension_regionale", autoriser_zone_rouge=False)
        toutes += a
        _journaliser(journal, horloge, a, "Extension régionale")
    if arbitrages:
        toutes += _phase_arbitrages(et, arbitrages, cfg, horloge, journal)

    # PHASE 4 : synthèse et projections
    non_aff = [e for i, e in enumerate(vivier) if not et.affecte[i]]
    non_pourvus = [p for p in et.postes if not p.pourvu]
    rouge = [p for p in non_pourvus if p.est_zone_rouge]

    rt_par_ss: Dict[str, int] = {}
    for p in non_pourvus:
        rt_par_ss[p.sous_systeme] = rt_par_ss.get(p.sous_systeme, 0) + 1

    ecoles_dicts = [e.vers_dict() for e in ecoles]
    ecoles_besoin = [{k: d[k] for k in COLONNES_ECOLE_BESOIN if k in d}
                     for d in ecoles_dicts if d["est_necessiteuse"]]

    compte = Counter(e.ecole_attache for e in vivier)
    fournisseurs = [{C.COL_ETAB_ID: k, "nb_enseignants_vivier": compte[k]} for k in sorted(compte)]

    stats_phase = dict(Counter(a["phase"] for a in toutes).most_common())
    nb_prince = sum(1 for a in toutes if a["phase"] == "effet_de_prince")
    projections = generer_projections_n3(ecoles, vivier, toutes)

    affecte_dicts = []
    for i, e in enumerate(vivier):
        d = e.vers_dict()
        d["affecte"] = et.affecte[i]
        affecte_dicts.append(d)

    synthese = {
        "besoin_total": besoin, "disponibles": dispo, "affectes": len(toutes),
        "effet_de_prince": nb_prince, "non_affectes": len(non_aff), "postes_non_pourvus": len(non_pourvus),
        "a_recruter": len(non_pourvus), "rt_par_sous_systeme": rt_par_ss,
        "postes_rouge_non_pourvus": len(rouge), "stats_phase": stats_phase,
    }
    return ResultatAffectation(
        synthese=synthese, ecoles_en_besoin=ecoles_besoin, ecoles_fournisseurs=fournisseurs,
        affectations=toutes,
        non_affectes=[d for d in affecte_dicts if not d["affecte"]],
        postes_non_pourvus=[p.vers_dict() for p in non_pourvus],
        postes_rouge_non_pourvus=[p.vers_dict() for p in rouge],
        vivier=affecte_dicts, etab_enrichi=ecoles_dicts, projections_n3=projections,
        journal_audit=journal, enseignants_exclus=exclus,
    )
