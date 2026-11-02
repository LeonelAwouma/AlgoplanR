"""Moteur A : formules des Parties 2 et 3 du guide MINEDUB (calculer_indicateurs_mathematiques)."""
from __future__ import annotations

import math
from typing import Iterable, List

from ..commun.texte import nombre_ou_none, norm
from ..donnees.modeles import Ecole, Indicateurs
from ..parametrage.config import DEFAULT_CONFIG

# Une seule méthode de calcul du besoin pédagogique, commune à toutes les écoles :
#     B = max(M ; max(1 ; ⌈(N − T) ÷ R⌉))
# M = plancher_pedagogique (minimum pédagogique commun), T = effectif_premiere_section (tolérance), R =
# norme_eleves_par_maitre (bloc `besoin` de domaine/parametrage/config.py). Les classes multigrades et les classes
# ouvertes n'interviennent plus dans le besoin ; la colonne Classes_Multigrades reste lue pour les statistiques.

#: Lecture de la colonne Classes_Multigrades (un nombre entier de classes multigrades) : information statistique.
MG_RENSEIGNE, MG_NON_RENSEIGNE, MG_INVALIDE, MG_INCOHERENT = "renseigne", "non_renseigne", "invalide", "incoherent"
MG_OUI, MG_NON = "historique_oui", "historique_non"     # anciens fichiers « Oui » / « Non »
#: Au plus six années d'études réunies deux à deux : trois classes multigrades sans chevauchement.
_MG_MAX = 3

_OUI = ("oui", "yes", "true", "vrai", "y", "o")
_NON = ("non", "no", "false", "faux", "n")


def lire_multigrades(valeur) -> tuple:
    """(nombre de classes multigrades ou None, statut de lecture). Une cellule vide n'est jamais zéro.
    Information statistique et de mobilité : elle ne modifie jamais le besoin en enseignants."""
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
    if n > _MG_MAX:
        return int(n), MG_INCOHERENT
    return int(n), MG_RENSEIGNE


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
    me = int(b["plancher_pedagogique"])                 # minimum pédagogique commun M
    de = max(pe, me)                                    # B = max(M ; P)
    bmax = e.salles_simple_flux + (2 if b["double_flux_autorise"] else 1) * e.salles_double_flux
    ke = min(de, bmax)
    be = max(ke - ee, 0.0)
    xe = max(ee - de, 0.0)
    se = max(de - bmax, 0.0)
    ae = max(min(ee, de) - bmax, 0.0)
    # Effectif d'élèves absent ou illisible : le besoin n'est que le minimum commun, donc provisoire, et l'excédent
    # n'alimente aucune sortie automatique tant que l'effectif n'est pas connu.
    statut_besoin = "confirme" if e.effectif_connu else "provisoire"
    xe_sur = xe if e.effectif_connu else 0.0
    m, statut_mg = lire_multigrades(e.multigrade)
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
        Me=m, multigrades_statut=statut_mg,
        statut_besoin=statut_besoin, xe_sur=xe_sur, xe_a_verifier=max(xe - xe_sur, 0.0),
        besoin_final_incertain=statut_besoin != "confirme",
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
