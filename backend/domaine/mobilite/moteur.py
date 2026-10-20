"""Moteur d'affectation (phases 0 à 4) — portage de run_affectation, sans pandas.

L'état (postes pourvus, agents affectés) est explicite et local à une exécution : le moteur est
déterministe et ne modifie ni ses entrées ni l'état global.
"""
from __future__ import annotations

import copy
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..acces.regions import cle_region
from ..commun.horloge import Horloge, horloge_systeme
from ..commun.texte import est_vide, norm
from ..diagnostic.indicateurs import calculer_indicateurs, enrichir_ecoles
from ..donnees import colonnes as C
from ..donnees.modeles import Ecole, Enseignant, Poste
from ..prince.projection import ApplicationPrince, appliquer_effets_prince
from .bareme import calculer_bareme
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


def _filtre_region(postes: List[Poste], e: Enseignant) -> List[Poste]:
    """Postes de la région d'attache de l'enseignant ; aucun si cette région est inconnue."""
    r = cle_region(e.region_attache)
    return [p for p in postes if cle_region(p.region) == r] if r else []


def regions_etanches(cfg: dict) -> bool:
    """Vrai si l'enseignant ne peut être affecté que dans sa région (sauf décision du prince ou de la commission)."""
    return bool(cfg["regles_dreb"].get("regions_etanches", True))


def choisir_meilleur_poste(e: Enseignant, candidats: List[Poste], cfg: dict, *, contrainte_commune=False,
                           contrainte_dept=False, contrainte_iaeb=False,
                           autoriser_zone_rouge=False, meme_region=False) -> Optional[Poste]:
    cands = _filtre_zone_rouge(_filtre_sous_systeme(candidats, e), autoriser_zone_rouge)
    if meme_region:
        cands = _filtre_region(cands, e)
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
        "id_ens": e.matricule, "nom_ens": e.nom, "prenom_ens": e.prenom, "id_etab_origine": e.ecole_attache,
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
    etanche = regions_etanches(cfg)
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
            if etanche:
                libres = _filtre_region(libres, e)
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
    etanche = regions_etanches(cfg)
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
                                  contrainte_iaeb=bool(contraintes.get("contrainte_iaeb")), meme_region=etanche)
        else:
            p = choisir_meilleur_poste(e, list(et.libres.values()), cfg, meme_region=etanche, **contraintes)
        if p is None:
            continue
        et.affecte[i] = True
        et.pourvoir(p)
        res.append(_aff_item(e, p, cfg, phase, arbitrage="recherche_proximite"))
    return res


def _mouvements_prince(application: ApplicationPrince, cfg: dict, horloge: Horloge,
                       journal: List[dict]) -> List[dict]:
    """Mouvements des faits du Prince déjà appliqués aux bases (affectations de phase `effet_de_prince`).

    L'enseignant est présenté tel qu'il était avant la décision (école d'origine, barème) ; le « poste » est celui que
    la décision lui donne dans l'école de destination recalculée. Ces mouvements ne consomment aucun poste ouvert :
    l'effectif de l'école de destination les contient déjà, donc son besoin en tient compte.
    """
    res: List[dict] = []
    for d in application.decisions:
        base = {"timestamp": horloge(), "phase": "effet_de_prince", "id_ens": d.id_ens, "id_etab": d.id_destination}
        if not d.appliquee:
            journal.append({**base, "statut": "REJETE", "motif": " ; ".join(d.rejets)})
            continue
        origine = copy.copy(application.ecoles_avant[d.id_origine])
        origine.ind = calculer_indicateurs(origine, cfg)
        t = copy.copy(application.enseignants_avant[d.id_ens])
        enrichir_enseignants([t], [origine])
        t.bareme = calculer_bareme(t, cfg)
        ec = application.ecoles_apres[d.id_destination]
        poste = Poste(
            id_poste=f"{ec.id}_P_PRINCE_{d.ordre}", id_etab=ec.id, nom_etab=ec.nom or ec.id, commune=ec.commune,
            departement=ec.departement, region=ec.region, iaeb=ec.iaeb, accessibilite=ec.accessibilite,
            securite=ec.securite, multigrade=ec.multigrade, sous_systeme=ec.sous_systeme.strip(),
            type_etab=ec.type_etab, Up=float(ec.ind.Up or 0), Wp=float(ec.ind.Wp or 0),
            est_zone_rouge=bool(ec.ind.est_zone_rouge), pourvu=True, latitude=ec.latitude, longitude=ec.longitude)
        item = _aff_item(t, poste, cfg, "effet_de_prince", motif=d.motif, arbitrage="fait_du_prince")
        motif = d.motif
        if d.alertes:
            item["alertes_prince"] = list(d.alertes)
            motif = f"{motif} (alertes : {' ; '.join(d.alertes)})"
        res.append(item)
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


MOTIF_HORS_REGION = "hors_region"


def _non_affectes_hors_region(vivier: List[Enseignant], et: _Etat, non_pourvus: List[Poste]) -> set:
    """Indices des enseignants non affectés pour lesquels il reste un poste libre hors de leur région."""
    regions_par_ss: Dict[str, set] = {}
    for p in non_pourvus:
        if p.est_zone_rouge:
            continue
        regions_par_ss.setdefault(norm(p.sous_systeme), set()).add(cle_region(p.region))
    toutes = set().union(*regions_par_ss.values()) if regions_par_ss else set()
    res = set()
    for i, e in enumerate(vivier):
        if et.affecte[i]:
            continue
        ss = norm(e.sous_systeme)
        regions = regions_par_ss.get(ss, set()) if ss else toutes
        if regions - {cle_region(e.region_attache)}:
            res.add(i)
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
    """Exécute le moteur. Les entrées sont copiées : elles ne sont pas modifiées.

    Les faits du Prince passent en premier : ils sont appliqués aux bases (enseignants rattachés à leur destination,
    effectifs des deux écoles mis à jour), puis les besoins, les excédents, les postes ouverts et le vivier sont
    calculés sur ces bases recalculées. Les agents déplacés sont exclus de la mobilité ordinaire ; leurs mouvements
    figurent dans les affectations (phase `effet_de_prince`) sans consommer de poste.
    """
    application: Optional[ApplicationPrince] = None
    if faits_prince:
        application = appliquer_effets_prince(ecoles, enseignants, faits_prince, cfg)
        ecoles, enseignants = application.ecoles, application.enseignants
    # Copie simple de chaque objet : le moteur ne fait que réaffecter leurs attributs (y compris `ind`,
    # remplacé par enrichir_ecoles), sans modifier d'objet imbriqué. Une copie profonde de 30 000 écoles
    # et 39 000 enseignants coûtait les deux tiers du temps de calcul.
    ecoles = [copy.copy(e) for e in ecoles]
    enseignants = [copy.copy(e) for e in enseignants]
    enrichir_ecoles(ecoles, cfg)
    ens, exclus = nettoyer_enseignants(enseignants, cfg)
    ens = enrichir_enseignants(ens, ecoles)
    postes = construire_postes(ecoles)
    vivier = construire_vivier(ens, ecoles, cfg, exclus=application.deplaces if application else None)
    et = _Etat(postes, vivier)

    toutes: List[dict] = []
    journal: List[dict] = []
    regles = cfg["regles_dreb"]

    mouvements_prince: List[dict] = []
    if application is not None:
        mouvements_prince = _mouvements_prince(application, cfg, horloge, journal)

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

    ordinaires = toutes                    # affectations qui pourvoient un poste ouvert
    toutes = mouvements_prince + ordinaires

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
    nb_prince = len(mouvements_prince)
    # Les arrivées du Prince sont déjà dans l'effectif des écoles : seules les affectations ordinaires s'y ajoutent.
    projections = generer_projections_n3(ecoles, vivier, ordinaires)

    # Enseignants sans poste dans leur région alors qu'un poste libre existe ailleurs : la règle des régions
    # les a laissés dans le vivier, ils vont à la commission d'arbitrage.
    hors_region = _non_affectes_hors_region(vivier, et, non_pourvus) if regions_etanches(cfg) else set()

    affecte_dicts = []
    for i, e in enumerate(vivier):
        d = e.vers_dict()
        d["affecte"] = et.affecte[i]
        if i in hors_region:
            d["motif_non_affectation"] = MOTIF_HORS_REGION
        affecte_dicts.append(d)

    synthese = {
        "besoin_total": besoin, "disponibles": dispo, "affectes": len(ordinaires),
        "effet_de_prince": nb_prince, "affectes_total": len(toutes), "non_affectes": len(non_aff), "postes_non_pourvus": len(non_pourvus),
        "a_recruter": len(non_pourvus), "rt_par_sous_systeme": rt_par_ss,
        "postes_rouge_non_pourvus": len(rouge), "stats_phase": stats_phase,
        "regions_etanches": regions_etanches(cfg), "non_affectes_hors_region": len(hors_region),
    }
    if application is not None:
        synthese.update({
            "besoin_total_avant_prince": application.totaux_avant["besoin_postes"],
            "prince_appliques": len(application.decisions_appliquees()),
            "prince_avec_alerte": sum(1 for d in application.decisions if d.alertes and d.appliquee),
            "prince_rejetes": sum(1 for d in application.decisions if not d.appliquee),
        })
    return ResultatAffectation(
        synthese=synthese, ecoles_en_besoin=ecoles_besoin, ecoles_fournisseurs=fournisseurs,
        affectations=toutes,
        non_affectes=[d for d in affecte_dicts if not d["affecte"]],
        postes_non_pourvus=[p.vers_dict() for p in non_pourvus],
        postes_rouge_non_pourvus=[p.vers_dict() for p in rouge],
        vivier=affecte_dicts, etab_enrichi=ecoles_dicts, projections_n3=projections,
        journal_audit=journal, enseignants_exclus=exclus,
    )
