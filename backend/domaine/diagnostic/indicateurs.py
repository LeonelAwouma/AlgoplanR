"""Moteur A : formules des Parties 2 et 3 du guide MINEDUB (calculer_indicateurs_mathematiques)."""
from __future__ import annotations

import math
from typing import Iterable, List, Optional

from ..commun.texte import nombre_ou_none, norm
from ..donnees.modeles import Ecole, Indicateurs
from ..parametrage.config import DEFAULT_CONFIG

# Les paramètres (REM de référence 74,4, tolérance de 20 élèves, plancher pédagogique de 3, six années d'études,
# deux années par classe multigrade, six groupes de secours) sont ceux du bloc `besoin` de la configuration
# (domaine/parametrage/config.py). Les mêmes formules valent pour les sous-systèmes francophone et anglophone.

#: Provenance du nombre de groupes pédagogiques G d'une école.
OBSERVE, ESTIME, SECOURS, INDETERMINE = "observe", "estime", "secours", "indetermine"
#: Lecture de la colonne Classes_Multigrades (un nombre entier de classes multigrades).
MG_RENSEIGNE, MG_NON_RENSEIGNE, MG_INVALIDE, MG_INCOHERENT = "renseigne", "non_renseigne", "invalide", "incoherent"
MG_OUI, MG_NON = "historique_oui", "historique_non"     # anciens fichiers « Oui » / « Non »

#: Phrase affichée à l'utilisateur quand le minimum pédagogique repose sur l'hypothèse de secours.
MESSAGE_MULTIGRADES_NON_RENSEIGNES = ("Le nombre de classes multigrades n'est pas renseigné. Le besoin en enseignants "
                                      "est provisoire et sera recalculé lorsque cette information sera disponible.")

_OUI = ("oui", "yes", "true", "vrai", "y", "o")
_NON = ("non", "no", "false", "faux", "n")


def lire_multigrades(valeur, b: dict) -> tuple:
    """(nombre de classes multigrades ou None, statut de lecture). Une cellule vide n'est jamais zéro."""
    v = norm(valeur)
    if v in ("", "nan", "none", "n/a", "na", "null", "-"):
        return None, MG_NON_RENSEIGNE
    n = nombre_ou_none(valeur)
    if n is None:
        if v in _OUI:
            return None, MG_OUI
        if v in _NON:
            return 0, MG_NON
        return None, MG_INVALIDE
    if n < 0 or n != int(n):
        return None, MG_INVALIDE
    # Au plus nombre_niveaux ÷ niveaux_par_maitre_multigrade regroupements sans chevauchement (3 par défaut).
    if n > b["nombre_niveaux"] // max(1, int(b["niveaux_par_maitre_multigrade"])):
        return int(n), MG_INCOHERENT
    return int(n), MG_RENSEIGNE


def _groupes_observes(e: Ecole, b: dict) -> Optional[int]:
    """Classes_Ouvertes : groupes-classes qui fonctionnent séparément, quand le fichier le donne (jamais les salles ni
    les enseignants, qui ne prouvent pas le nombre de groupes)."""
    if not b.get("groupes_depuis_classes_ouvertes", True) or e.classes_ouvertes is None:
        return None
    c = e.classes_ouvertes
    return int(c) if c >= 1 and c == int(c) else None


def determiner_groupes(e: Ecole, b: dict) -> tuple:
    """(G, provenance, statut de Classes_Multigrades, M, G maximal plausible) : groupes pédagogiques nécessitant chacun
    un enseignant. G maximal sert à séparer l'excédent sûr de l'excédent qui dépend d'une hypothèse."""
    niveaux = int(b["nombre_niveaux"])
    par_classe = max(1, int(b["niveaux_par_maitre_multigrade"]))
    regroupe = int(math.ceil(niveaux / float(par_classe)))          # toutes les années regroupées : 3
    secours = int(b.get("groupes_secours", niveaux))
    m, statut = lire_multigrades(e.multigrade, b)
    observe = _groupes_observes(e, b)
    if observe is not None:
        return observe, OBSERVE, statut, m, observe
    if not b["minimum_selon_multigrades"]:
        return regroupe, ESTIME, statut, m, max(regroupe, niveaux)
    if statut in (MG_RENSEIGNE, MG_NON):
        # Chaque classe multigrade réunit `par_classe` années sans chevauchement : 6 − M groupes au plus.
        g = max(1, niveaux - m * (par_classe - 1))
        return g, ESTIME, statut, m, g
    if statut == MG_OUI:
        # Ancien « Oui » sans nombre : toutes les années regroupées (comportement historique), à vérifier.
        return regroupe, ESTIME, statut, m, max(regroupe, niveaux - (par_classe - 1))
    if statut == MG_NON_RENSEIGNE:
        return secours, SECOURS, statut, m, max(secours, niveaux)
    return secours, INDETERMINE, statut, m, max(secours, niveaux)


def _pe(n: float, b: dict) -> int:
    """Postes liés à l'effectif : max(1 ; ⌈(N − tolérance) ÷ REM⌉), le REM gardant sa précision décimale (74,4)."""
    premiere = b["effectif_premiere_section"]
    if n <= premiere:
        return 1
    return max(1, int(math.ceil((n - premiere) / float(b["norme_eleves_par_maitre"]) - 1e-9)))


def besoin_rem(n: float, rem: float) -> int:
    """Enseignants nécessaires par division directe des élèves par le REM de référence : ⌈N ÷ REM⌉ (rapport
    MINEDUB). Indicateur de ratio, distinct du besoin pédagogique P calculé avec la tolérance."""
    return int(math.ceil(n / float(rem) - 1e-9)) if n > 0 else 0


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
    b = {**DEFAULT_CONFIG["besoin"], **(cfg.get("besoin") or {})}   # configuration enregistrée avant ces clés
    pe = _pe(ne, b)
    ge, provenance, statut_mg, m, ge_max = determiner_groupes(e, b)
    plancher = int(b.get("plancher_pedagogique", 3))
    me = max(plancher, ge)
    de = max(pe, me)
    bmax = e.salles_simple_flux + (2 if b["double_flux_autorise"] else 1) * e.salles_double_flux
    ke = min(de, bmax)
    be = max(ke - ee, 0.0)
    xe = max(ee - de, 0.0)
    se = max(de - bmax, 0.0)
    ae = max(min(ee, de) - bmax, 0.0)
    # Excédent sûr : celui qui reste avec le minimum le plus élevé que les données permettent (G maximal). Le reste
    # dépend d'une hypothèse sur les groupes : il n'entraîne aucune sortie automatique d'enseignant.
    xe_sur = max(ee - max(pe, plancher, ge_max), 0.0)
    if b.get("mobiliser_excedent_incertain"):
        xe_sur = xe
    minimum_observe = provenance == OBSERVE
    depend_minimum = me > pe
    if not e.effectif_connu or (depend_minimum and provenance in (SECOURS, INDETERMINE)):
        statut_besoin = "provisoire"
    elif depend_minimum and provenance == ESTIME:
        statut_besoin = "estime"
    else:
        statut_besoin = "confirme"
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
        Ce=besoin_rem(ne, b["norme_eleves_par_maitre"]) if e.effectif_connu else None,
        Ge=ge, Ge_provenance=provenance, Me=m, multigrades_statut=statut_mg,
        minimum_provisoire=provenance in (SECOURS, INDETERMINE), minimum_observe=minimum_observe,
        statut_besoin=statut_besoin, xe_sur=xe_sur, xe_a_verifier=max(xe - xe_sur, 0.0),
        # Fichier sans mode d'utilisation des salles (total des salles compté en simple flux) ; pour un jeu importé
        # avant ce suivi, une absence de double flux est tenue pour incertaine.
        bmax_incertain=e.salles_connues and (e.salles_double_flux_connues is False or (
            e.salles_double_flux_connues is None and not e.salles_double_flux)),
    )


def enrichir_ecoles(ecoles: Iterable[Ecole], cfg: dict) -> List[Ecole]:
    res = list(ecoles)
    for e in res:
        e.ind = calculer_indicateurs(e, cfg)
    return res
