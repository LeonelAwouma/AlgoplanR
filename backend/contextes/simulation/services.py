"""Cas d'usage du contexte Simulation : scénarios, calculs, stockage des résultats, règles de recalcul."""
from __future__ import annotations

import hashlib
import json
import zlib
from collections import OrderedDict
from typing import Any, Dict, List, Optional

from django.db import transaction
from django.shortcuts import get_object_or_404

from contextes.commun.erreurs import RefusMetier
from contextes.donnees import depots
from contextes.parametrage.services import config_jeu
from domaine.mobilite.moteur import ResultatAffectation, lancer_affectation
from domaine.mobilite.scenarios import SCENARIO_PRESETS, SCENARIOS_GEOGRAPHIQUES
from domaine.parametrage import config as cfg_dom

from .models import ResultatSimulation, Scenario

_CACHE: "OrderedDict[tuple, dict]" = OrderedDict()
_CACHE_MAX = 12


# --- entrées du moteur -------------------------------------------------------

def faits_prince_actifs(jeu) -> List[dict]:
    return [{"id_ens": f.id_ens, "id_etab": f.id_etab, "motif": f.motif}
            for f in jeu.faits_prince.filter(statut="ACTIF").order_by("id")]


def arbitrages_jeu(jeu) -> List[dict]:
    return [{"id_ens": a.id_ens, "id_etab": a.id_etab, "motif": a.motif} for a in jeu.arbitrages.order_by("id")]


def config_scenario(jeu, scenario: Scenario) -> dict:
    return cfg_dom.fusionner(config_jeu(jeu), scenario.parametres)


def empreinte(jeu, cfg: dict, faits: list, arbitrages: list) -> str:
    brut = json.dumps({"jeu": str(jeu.id), "cfg": cfg, "faits": faits, "arbitrages": arbitrages,
                       "ne": jeu.etablissements.count(), "nens": jeu.enseignants.count()},
                      sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(brut.encode()).hexdigest()


# --- calcul et stockage ------------------------------------------------------

def executer_moteur(jeu, cfg: dict, *, faits: Optional[list] = None, arbitrages: Optional[list] = None,
                    ecoles=None, enseignants=None) -> ResultatAffectation:
    ecoles = ecoles if ecoles is not None else depots.charger_ecoles(jeu)
    enseignants = enseignants if enseignants is not None else depots.charger_enseignants(jeu)
    if not ecoles:
        raise RefusMetier("Le jeu ne contient aucun établissement")
    return lancer_affectation(ecoles, enseignants, cfg, faits_prince=faits, arbitrages=arbitrages)


@transaction.atomic
def calculer(scenario: Scenario, *, ecoles=None, enseignants=None) -> dict:
    jeu = scenario.jeu
    cfg = config_scenario(jeu, scenario)
    faits, arbs = faits_prince_actifs(jeu), arbitrages_jeu(jeu)
    res = executer_moteur(jeu, cfg, faits=faits, arbitrages=arbs, ecoles=ecoles, enseignants=enseignants).vers_dict()
    blob = zlib.compress(json.dumps(res, default=str, ensure_ascii=False).encode("utf-8"), 6)
    ResultatSimulation.objects.update_or_create(
        scenario=scenario, defaults={"donnees": blob, "config": cfg, "empreinte": empreinte(jeu, cfg, faits, arbs)})
    if scenario.obsolete:
        scenario.obsolete = False
        scenario.save(update_fields=["obsolete"])
    for k in [k for k in _CACHE if k[0] == scenario.pk]:
        _CACHE.pop(k, None)
    return res


def charger_resultat(scenario: Scenario) -> dict:
    try:
        r = scenario.resultat
    except ResultatSimulation.DoesNotExist:
        return calculer(scenario)
    cle = (scenario.pk, r.empreinte, r.calcule_le.isoformat())
    if cle in _CACHE:
        _CACHE.move_to_end(cle)
        return _CACHE[cle]
    res = json.loads(zlib.decompress(bytes(r.donnees)).decode("utf-8"))
    _CACHE[cle] = res
    while len(_CACHE) > _CACHE_MAX:
        _CACHE.popitem(last=False)
    return res


def config_resultat(scenario: Scenario) -> dict:
    charger_resultat(scenario)
    return scenario.resultat.config


# --- scénarios ---------------------------------------------------------------

def creer_scenario(jeu, *, code: str = "", nom: str = "", description: str = "",
                   parametres: Optional[dict] = None) -> Scenario:
    parametres = parametres or {}
    cfg_dom.valider(parametres)
    if code:
        if code not in SCENARIO_PRESETS:
            raise RefusMetier("Modèle de scénario inconnu", [f"Modèles disponibles : {sorted(SCENARIO_PRESETS)}"])
        preset = SCENARIO_PRESETS[code]
        fusion = cfg_dom.fusionner(cfg_dom.fusionner(cfg_dom.DEFAULT_CONFIG, preset["parametres"]), parametres)
        surcharge = _difference(fusion)
        sc = Scenario(jeu=jeu, code=code, nom=nom or preset["nom"],
                      description=description or preset["description"], geographique=preset["geographique"],
                      parametres=surcharge)
    else:
        if not nom:
            raise RefusMetier("Un scénario personnalisé doit avoir un nom", ["nom manquant"])
        sc = Scenario(jeu=jeu, nom=nom, description=description, parametres=parametres)
    sc.save()
    calculer(sc)
    return sc


def _difference(cfg: dict, base: Optional[dict] = None, chemin: str = "") -> dict:
    """Surcharge minimale de cfg par rapport aux défauts."""
    base = base if base is not None else cfg_dom.DEFAULT_CONFIG
    out: Dict[str, Any] = {}
    for k, v in cfg.items():
        if isinstance(v, dict):
            d = _difference(v, base[k])
            if d:
                out[k] = d
        elif v != base[k]:
            out[k] = v
    return out


def creer_scenarios_base(jeu) -> List[Scenario]:
    existants = {s.code: s for s in jeu.scenarios.exclude(code="")}
    ecoles, ens = depots.charger_ecoles(jeu), depots.charger_enseignants(jeu)
    res = []
    for code in SCENARIOS_GEOGRAPHIQUES:
        if code in existants:
            sc = existants[code]
            calculer(sc, ecoles=ecoles, enseignants=ens)
        else:
            p = SCENARIO_PRESETS[code]
            sc = Scenario.objects.create(jeu=jeu, code=code, nom=p["nom"], description=p["description"],
                                         geographique=True, parametres=_difference(
                                             cfg_dom.fusionner(cfg_dom.DEFAULT_CONFIG, p["parametres"])))
            calculer(sc, ecoles=ecoles, enseignants=ens)
        res.append(sc)
    return res


def recalculer_scenarios(jeu) -> int:
    """Règle de recalcul : un fait de Prince, un arbitrage ou une recrue change -> tous les scénarios sont recalculés."""
    scs = list(jeu.scenarios.all())
    if not scs:
        return 0
    ecoles, ens = depots.charger_ecoles(jeu), depots.charger_enseignants(jeu)
    for sc in scs:
        calculer(sc, ecoles=ecoles, enseignants=ens)
    return len(scs)


def marquer_obsoletes(jeu) -> int:
    """Règle de recalcul : un changement de paramètres rend les scénarios obsolètes."""
    return jeu.scenarios.update(obsolete=True)


def scenario_par_defaut(jeu) -> Scenario:
    sc = jeu.scenarios.filter(code="geo_region").first() or jeu.scenarios.first()
    if sc is None:
        sc = creer_scenarios_base(jeu)[-1]
    return sc


def scenario_du_jeu(jeu, sid: int) -> Scenario:
    return get_object_or_404(Scenario, pk=sid, jeu=jeu)


def resume_scenario(sc: Scenario) -> dict:
    try:
        r = sc.resultat
        calcule = r.calcule_le
    except ResultatSimulation.DoesNotExist:
        calcule = None
    return {"id": sc.pk, "code": sc.code, "nom": sc.nom, "description": sc.description,
            "geographique": sc.geographique, "obsolete": sc.obsolete, "parametres": sc.parametres,
            "cree_le": sc.cree_le, "calcule_le": calcule}
