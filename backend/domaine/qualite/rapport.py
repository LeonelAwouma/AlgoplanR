"""Rapport de qualité des données (validation à l'import)."""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List

from ..commun.texte import est_vide, nombre_ou_none, norm, texte
from ..donnees import colonnes as C

CHAMPS_NUMERIQUES_ETAB = [C.COL_ETAB_NE, C.COL_ETAB_EE, C.COL_ETAB_SSF, C.COL_ETAB_SDF]
CHAMPS_NUMERIQUES_ENS = [C.COL_ENS_AGE, C.COL_ENS_ANC_CAR, C.COL_ENS_ANC_POSTE, C.COL_ENS_N1, C.COL_ENS_N2,
                         C.COL_ENS_ENFANTS, C.COL_ENS_FORM]


def _anomalie(code: str, gravite: str, message: str, **extra) -> dict:
    return {"code": code, "gravite": gravite, "message": message, **extra}


def controler(lignes_etab: List[Dict[str, Any]], lignes_ens: List[Dict[str, Any]], cfg: dict) -> dict:
    """Retourne {valide, erreurs, avertissements, statistiques}. `erreurs` bloque la création du jeu."""
    erreurs: List[dict] = []
    avert: List[dict] = []

    if not lignes_etab:
        erreurs.append(_anomalie("ETAB_VIDE", "erreur", "Le fichier des établissements est vide"))
    if not lignes_ens:
        erreurs.append(_anomalie("ENS_VIDE", "erreur", "Le fichier des enseignants est vide"))

    for col in C.COLONNES_ATTENDUES_ETAB:
        if lignes_etab and col not in lignes_etab[0]:
            (erreurs if col in C.COLONNES_BLOQUANTES_ETAB else avert).append(
                _anomalie("COLONNE_ETAB_MANQUANTE", "erreur" if col in C.COLONNES_BLOQUANTES_ETAB else "avertissement",
                          f"Colonne établissements non fournie : {col}", colonne=col))
    for col in C.COLONNES_ATTENDUES_ENS:
        if lignes_ens and col not in lignes_ens[0]:
            (erreurs if col in C.COLONNES_BLOQUANTES_ENS else avert).append(
                _anomalie("COLONNE_ENS_MANQUANTE", "erreur" if col in C.COLONNES_BLOQUANTES_ENS else "avertissement",
                          f"Colonne enseignants non fournie : {col}", colonne=col))

    ids_etab = [texte(l.get(C.COL_ETAB_ID)) for l in lignes_etab]
    vides = sum(1 for i in ids_etab if not i)
    if vides:
        erreurs.append(_anomalie("ETAB_ID_VIDE", "erreur", f"{vides} établissement(s) sans identifiant"))
    dup = sorted(k for k, v in Counter(i for i in ids_etab if i).items() if v > 1)
    if dup:
        erreurs.append(_anomalie("ETAB_ID_DOUBLON", "erreur", f"Identifiants d'école en doublon : {dup[:10]}",
                                 valeurs=dup))
    mats = [texte(l.get(C.COL_ENS_ID)) for l in lignes_ens]
    vides = sum(1 for m in mats if not m)
    if vides:
        erreurs.append(_anomalie("ENS_MATRICULE_VIDE", "erreur", f"{vides} enseignant(s) sans matricule"))
    dup = sorted(k for k, v in Counter(m for m in mats if m).items() if v > 1)
    if dup:
        erreurs.append(_anomalie("ENS_MATRICULE_DOUBLON", "erreur", f"Matricules en doublon : {dup[:10]}", valeurs=dup))

    for col in CHAMPS_NUMERIQUES_ETAB:
        nb = sum(1 for l in lignes_etab if col in l and not est_vide(l.get(col)) and nombre_ou_none(l.get(col)) is None)
        if nb:
            avert.append(_anomalie("ETAB_NON_NUMERIQUE", "avertissement",
                                   f"{nb} valeur(s) non numérique(s) dans {col} (lues comme 0)", colonne=col))
    for col in CHAMPS_NUMERIQUES_ENS:
        nb = sum(1 for l in lignes_ens if col in l and not est_vide(l.get(col)) and nombre_ou_none(l.get(col)) is None)
        if nb:
            avert.append(_anomalie("ENS_NON_NUMERIQUE", "avertissement",
                                   f"{nb} valeur(s) non numérique(s) dans {col}", colonne=col))

    retraite = cfg["seuils"].get("age_retraite_ans", 60)
    sans_age = sum(1 for l in lignes_ens if C.COL_ENS_AGE in l and nombre_ou_none(l.get(C.COL_ENS_AGE)) is None)
    if sans_age:
        avert.append(_anomalie("ENS_AGE_INVALIDE", "avertissement",
                               f"{sans_age} enseignant(s) sans âge valide seront exclus du calcul"))
    retraites = sum(1 for l in lignes_ens
                    if (nombre_ou_none(l.get(C.COL_ENS_AGE)) is not None and nombre_ou_none(l.get(C.COL_ENS_AGE)) >= retraite))
    if retraites:
        avert.append(_anomalie("ENS_RETRAITE", "avertissement",
                               f"{retraites} enseignant(s) ont atteint l'âge de la retraite ({retraite} ans) : exclus"))

    ids_set = {i for i in ids_etab if i}
    inconnues = sorted({texte(l.get(C.COL_ENS_ETAB)) for l in lignes_ens
                        if texte(l.get(C.COL_ENS_ETAB)) and texte(l.get(C.COL_ENS_ETAB)) not in ids_set})
    if inconnues:
        avert.append(_anomalie("ENS_ECOLE_INCONNUE", "avertissement",
                               f"{len(inconnues)} école(s) d'attache absentes du référentiel : {inconnues[:10]}",
                               valeurs=inconnues))
    voeux_inconnus = sorted({texte(l.get(c)) for l in lignes_ens for c in (C.COL_ENS_V1, C.COL_ENS_V2, C.COL_ENS_V3)
                             if not est_vide(l.get(c)) and texte(l.get(c)) not in ids_set})
    if voeux_inconnus:
        avert.append(_anomalie("VOEU_ECOLE_INCONNUE", "avertissement",
                               f"{len(voeux_inconnus)} vœu(x) visent une école absente du référentiel",
                               valeurs=voeux_inconnus[:50]))
    for col, lib in ((C.COL_ETAB_ALPHA, "accessibilité"), (C.COL_ETAB_SIGMA, "sécurité")):
        if lignes_etab and col in lignes_etab[0]:
            nb = sum(1 for l in lignes_etab if est_vide(l.get(col)))
            if nb:
                avert.append(_anomalie("ETAB_VALEUR_MANQUANTE", "avertissement",
                                       f"{nb} école(s) sans valeur de {lib} (traitées comme neutres)", colonne=col))
    ss_etab = {norm(l.get(C.COL_ETAB_SS)) for l in lignes_etab if not est_vide(l.get(C.COL_ETAB_SS))}
    ss_ens = {norm(l.get(C.COL_ENS_SS)) for l in lignes_ens if not est_vide(l.get(C.COL_ENS_SS))}
    if ss_ens - ss_etab:
        avert.append(_anomalie("SOUS_SYSTEME_ORPHELIN", "avertissement",
                               f"Sous-systèmes d'enseignants sans école correspondante : {sorted(ss_ens - ss_etab)}"))

    return {
        "valide": not erreurs, "erreurs": erreurs, "avertissements": avert,
        "statistiques": {"nb_etablissements": len(lignes_etab), "nb_enseignants": len(lignes_ens),
                         "nb_erreurs": len(erreurs), "nb_avertissements": len(avert)},
    }
