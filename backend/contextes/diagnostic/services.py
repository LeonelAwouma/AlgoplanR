"""Cas d'usage du contexte Diagnostic (Moteur A) : préparation, indicateurs, territoires, priorités, synthèse."""
from __future__ import annotations

import hashlib
import json
from collections import Counter, OrderedDict
from dataclasses import dataclass
from typing import Dict, List

from contextes.donnees import depots
from contextes.parametrage.services import config_jeu
from contextes.simulation import services as sim
from domaine.diagnostic import synthese as syn
from domaine.diagnostic import territoires as terr
from domaine.diagnostic.indicateurs import enrichir_ecoles
from domaine.donnees import colonnes as C
from domaine.donnees.modeles import Ecole, Enseignant
from domaine.mobilite.bareme import calculer_bareme
from domaine.mobilite.vivier import construire_vivier, enrichir_enseignants, nettoyer_enseignants

from .models import DiagnosticCache


@dataclass
class Preparation:
    cfg: dict
    ecoles: List[Ecole]
    ecoles_par_id: Dict[str, Ecole]
    enseignants: Dict[str, Enseignant]       # tous, enrichis, avec barème
    exclus: Dict[str, str]                   # matricule -> raison d'exclusion du calcul
    vivier: List[Enseignant]
    ecoles_dicts: List[dict]


_PREP: "OrderedDict[tuple, Preparation]" = OrderedDict()


def empreinte_jeu(jeu) -> str:
    brut = json.dumps({"jeu": str(jeu.id), "cfg": config_jeu(jeu), "faits": sim.faits_prince_actifs(jeu),
                       "ne": jeu.etablissements.count(), "nens": jeu.enseignants.count()},
                      sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(brut.encode()).hexdigest()


def preparer(jeu) -> Preparation:
    cle = (str(jeu.id), empreinte_jeu(jeu))
    if cle in _PREP:
        _PREP.move_to_end(cle)
        return _PREP[cle]
    cfg = config_jeu(jeu)
    ecoles = enrichir_ecoles(depots.charger_ecoles(jeu), cfg)
    tous = enrichir_enseignants(depots.charger_enseignants(jeu), ecoles)
    gardes, exclus = nettoyer_enseignants(tous, cfg)
    vivier = construire_vivier(gardes, ecoles, cfg)
    for e in tous:                                   # barème aussi pour les agents exclus (fiche détaillée)
        if e.matricule not in {g.matricule for g in gardes}:
            e.bareme = calculer_bareme(e, cfg)
    prep = Preparation(cfg=cfg, ecoles=ecoles, ecoles_par_id={e.id: e for e in ecoles},
                       enseignants={e.matricule: e for e in tous},
                       exclus={x["matricule"]: x["raison"] for x in exclus}, vivier=vivier,
                       ecoles_dicts=[e.vers_dict() for e in ecoles])
    _PREP[cle] = prep
    while len(_PREP) > 4:
        _PREP.popitem(last=False)
    return prep


def invalider_cache(jeu) -> None:
    DiagnosticCache.objects.filter(jeu=jeu).delete()
    for k in [k for k in _PREP if k[0] == str(jeu.id)]:
        _PREP.pop(k, None)


def ecoles_enrichies(jeu) -> List[dict]:
    """Établissements avec indicateurs ; lecture/écriture du cache indexé par empreinte."""
    emp = empreinte_jeu(jeu)
    c = DiagnosticCache.objects.filter(jeu=jeu, empreinte=emp).first()
    if c:
        return c.contenu["ecoles"]
    ecoles = preparer(jeu).ecoles_dicts
    DiagnosticCache.objects.filter(jeu=jeu).exclude(empreinte=emp).delete()
    DiagnosticCache.objects.create(jeu=jeu, empreinte=emp, contenu={"ecoles": ecoles})
    return ecoles


def diagnostic(jeu, perimetre, *, zone="", securite="", sous_systeme="", type_etab="", seulement="",
               q="", sans_prince=False) -> dict:
    ecoles = syn.filtrer_ecoles(ecoles_enrichies(jeu), perimetre=perimetre, zone=zone, securite=securite,
                                sous_systeme=sous_systeme, type_etab=type_etab, seulement=seulement, q=q)
    prince = Counter(f["id_etab"] for f in sim.faits_prince_actifs(jeu))
    totaux = syn.totaux_diagnostic(ecoles, {} if sans_prince else dict(prince))
    if sans_prince:
        totaux["besoin_postes_apres_prince"] = totaux["besoin_postes"]
    return {"perimetre": perimetre.vers_dict(), "sans_prince": sans_prince, "totaux": totaux, "ecoles": ecoles}


def territoires(jeu, perimetre) -> dict:
    return terr.noeud_territorial(ecoles_enrichies(jeu), perimetre)


def options(jeu, perimetre) -> dict:
    return terr.options_filtres(ecoles_enrichies(jeu), perimetre)


def priorites(jeu, perimetre) -> List[dict]:
    ecoles = terr.filtrer_lignes(ecoles_enrichies(jeu), perimetre, C.COL_ETAB_REGION, C.COL_ETAB_DEPT,
                                 C.COL_ETAB_COMMUNE)
    return syn.trier_par_priorite(ecoles)


def synthese(jeu, perimetre, scenario=None) -> dict:
    sc = scenario or sim.scenario_par_defaut(jeu)
    res = terr.restreindre_resultat(sim.charger_resultat(sc), perimetre)
    s = res["synthese"]
    ecoles = res["etab_enrichi"]
    par_zone: Dict[str, dict] = {}
    for e in ecoles:
        z = e.get(C.COL_ETAB_ALPHA) or "(non renseignée)"
        d = par_zone.setdefault(z, {"zone": z, "nb_ecoles": 0, "besoin": 0, "excedent": 0})
        d["nb_ecoles"] += 1
        d["besoin"] += int(e.get("nb_postes_ouverts", 0) or 0)
        d["excedent"] += int(float(e.get("xe", 0) or 0))
    noeud = terr.noeud_territorial(ecoles, perimetre)
    return {
        "scenario": sim.resume_scenario(sc), "perimetre": perimetre.vers_dict(), "synthese": s,
        "tableau_de_bord": {"totaux": syn.totaux_diagnostic(ecoles),
                            "par_zone": sorted(par_zone.values(), key=lambda d: -d["besoin"]),
                            "par_enfant_territorial": noeud["enfants"]},
        "points_attention": syn.points_attention(s, ecoles),
        "narratif": syn.texte_narratif(s, perimetre.titre),
    }
