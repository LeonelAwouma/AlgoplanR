"""Moteur A : formules des Parties 2 et 3 du guide MINEDUB (calculer_indicateurs_mathematiques)."""
from __future__ import annotations

import math
from typing import Dict, Iterable, List

from ..commun.texte import est_oui, norm
from ..donnees.modeles import Ecole, Indicateurs
from ..parametrage.config import DEFAULT_CONFIG

# Les constantes du moteur d'origine (première section de 20 élèves, norme de 60, 6 niveaux, regroupement par 2) sont les
# valeurs par défaut du bloc `besoin` de la configuration (domaine/parametrage/config.py).


def _pe(n: float, b: dict) -> int:
    """Postes d'enseignement liés à l'effectif d'élèves."""
    premiere = b["effectif_premiere_section"]
    if n <= premiere:
        return 1
    return max(1, int(math.ceil((n - premiere) / float(b["norme_eleves_par_maitre"]))))


def _me(multigrade: bool, b: dict) -> int:
    """Minimum pédagogique : un maître par niveau, ou un pour `niveaux_par_maitre_multigrade` niveaux."""
    regroupe = multigrade or not b["minimum_selon_multigrades"]
    if regroupe:
        return max(1, int(math.ceil(b["nombre_niveaux"] / float(b["niveaux_par_maitre_multigrade"]))))
    return max(1, int(b["nombre_niveaux"]))


def _alpha(acc: str) -> int:
    a = norm(acc)
    if "enclav" in a:
        return 20
    if "rural" in a:
        return 15
    if "semi" in a:
        return 10
    if "urbain" in a:
        return 5
    return 0


def _sigma(sec: str) -> int:
    s = norm(sec)
    if "rouge" in s:
        return 25
    if "jaune" in s:
        return 10
    return 0


def _beta(ne: float, ee: float) -> int:
    if ee <= 0:
        return 15
    rem = ne / ee
    if rem <= 80:
        return 0
    if rem <= 100:
        return 5
    if rem <= 150:
        return 10
    return 15


def _niveau(w: float) -> int:
    if w >= 30:
        return 1
    if w >= 15:
        return 2
    return 3


def calculer_indicateurs(e: Ecole, cfg: dict) -> Indicateurs:
    t1, t2 = cfg["vulnerabilite"]["t1"], cfg["vulnerabilite"]["t2"]
    ne, ee = e.effectif_eleves, e.enseignants_actuels
    b = cfg.get("besoin") or DEFAULT_CONFIG["besoin"]       # configuration enregistrée avant l'ajout du bloc
    pe = _pe(ne, b)
    me = _me(est_oui(e.multigrade), b)
    de = max(pe, me)
    bmax = e.salles_simple_flux + (2 if b["double_flux_autorise"] else 1) * e.salles_double_flux
    ke = min(de, bmax)
    be = max(ke - ee, 0.0)
    xe = max(ee - de, 0.0)
    se = max(de - bmax, 0.0)
    ae = max(min(ee, de) - bmax, 0.0)
    alpha, sigma = _alpha(e.accessibilite), _sigma(e.securite)
    wp = t1 * alpha + t2 * sigma
    beta = _beta(ne, ee)
    return Indicateurs(
        Pe=pe, me=me, De=de, BMAX=bmax, Ke=ke, be=be, xe=xe, se=se, ae=ae,
        alpha=alpha, sigma=sigma, Wp=wp, beta=beta, Up=wp + beta,
        niveau_difficulte=_niveau(wp),
        nb_postes_ouverts=int(be),
        est_necessiteuse=be > 0,
        est_excedentaire=xe > 0,
        est_zone_rouge="rouge" in norm(e.securite),
    )


def enrichir_ecoles(ecoles: Iterable[Ecole], cfg: dict) -> List[Ecole]:
    res = list(ecoles)
    for e in res:
        e.ind = calculer_indicateurs(e, cfg)
    return res
