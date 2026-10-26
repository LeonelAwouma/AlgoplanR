"""Rapport de qualité des données (validation à l'import)."""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Optional

from ..commun.texte import est_vide, nombre_ou_none, norm, texte
from ..donnees import colonnes as C
from ..donnees.modeles import construire_enseignant
from ..mobilite.bareme import categorie_situation
from ..mobilite.bonification import ecole_bonifiee

CHAMPS_NUMERIQUES_ETAB = [C.COL_ETAB_NE, C.COL_ETAB_EE, C.COL_ETAB_SSF, C.COL_ETAB_SDF]
CHAMPS_NUMERIQUES_ENS = [C.COL_ENS_AGE, C.COL_ENS_ANC_CAR, C.COL_ENS_ANC_POSTE, C.COL_ENS_N1, C.COL_ENS_N2,
                         C.COL_ENS_ENFANTS, C.COL_ENS_FORM]


def _anomalie(code: str, gravite: str, message: str, **extra) -> dict:
    return {"code": code, "gravite": gravite, "message": message, **extra}


#: Au-delà, une quantité du fichier (élèves, enseignants, salles, âge, ancienneté…) est une erreur de saisie.
VALEUR_MAX = 1_000_000

#: Nombre maximal d'écoles détaillées dans le rapport (les plus grands écarts d'abord) ; la synthèse porte sur toutes.
LIMITE_ECARTS_DETAILLES = 500

REGLE_RECONCILIATION = ("L'effectif déclaré (Enseignants_Actuels) fait foi pour le calcul du besoin ; l'écart avec le "
                        "nombre de matricules rattachés est un avertissement. Il devient bloquant pour une école "
                        "touchée par un fait du Prince, dont la décision déplace des matricules réels.")


def reconcilier_effectifs(lignes_etab: List[Dict[str, Any]], lignes_ens: List[Dict[str, Any]]) -> Optional[dict]:
    """Écart, pour chaque école, entre l'effectif déclaré et le nombre de matricules rattachés.

    Retourne None quand le fichier ne permet pas la comparaison (colonne d'effectif ou de rattachement absente).
    Les écoles sans effectif renseigné sont comptées à part : il n'y a rien à comparer.
    """
    if not lignes_etab or not lignes_ens or C.COL_ETAB_EE not in lignes_etab[0] or C.COL_ENS_ETAB not in lignes_ens[0]:
        return None
    rattaches = Counter(texte(l.get(C.COL_ENS_ETAB)) for l in lignes_ens)
    ecarts, comparees, sans_effectif = [], 0, 0
    for l in lignes_etab:
        ident = texte(l.get(C.COL_ETAB_ID))
        declare = nombre_ou_none(l.get(C.COL_ETAB_EE))
        if declare is None:
            sans_effectif += 1
            continue
        comparees += 1
        nb = rattaches.get(ident, 0)
        if declare != nb:
            ecarts.append({"id_ecole": ident, "nom_ecole": texte(l.get("nom_etab")) or ident,
                           "enseignants_declares": declare, "matricules_rattaches": nb, "ecart": declare - nb})
    ecarts.sort(key=lambda e: (-abs(e["ecart"]), e["id_ecole"]))
    return {
        "ecoles_comparees": comparees, "ecoles_sans_effectif_declare": sans_effectif,
        "ecoles_en_ecart": len(ecarts),
        "ecart_total": sum(e["ecart"] for e in ecarts),
        "ecart_absolu_total": sum(abs(e["ecart"]) for e in ecarts),
        "ecoles": ecarts[:LIMITE_ECARTS_DETAILLES], "liste_tronquee": len(ecarts) > LIMITE_ECARTS_DETAILLES,
        "regle": REGLE_RECONCILIATION,
    }


MESSAGE_NOMINATIF_ABSENT = ("Aucun fichier nominatif des enseignants n'a été fourni : les retraites, les âges et "
                            "anciennetés individuels, le rapprochement des agents et les affectations individuelles ne "
                            "sont pas calculables. L'effectif déclaré (Enseignants_Actuels) reste un stock administratif, "
                            "pas une liste d'enseignants.")


def controler(lignes_etab: List[Dict[str, Any]], lignes_ens: List[Dict[str, Any]], cfg: dict, *,
              nominatif: bool = True) -> dict:
    """Retourne {valide, erreurs, avertissements, statistiques}. `erreurs` bloque la création du jeu.

    `nominatif=False` : jeu d'établissements seuls. L'absence du fichier des enseignants est alors un fait signalé
    (avertissement), non une erreur, et le nombre d'enseignants est inconnu (None), jamais 0."""
    erreurs: List[dict] = []
    avert: List[dict] = []

    if not lignes_etab:
        erreurs.append(_anomalie("ETAB_VIDE", "erreur", "Le fichier des établissements est vide"))
    if not nominatif:
        avert.append(_anomalie("NOMINATIF_ABSENT", "avertissement", MESSAGE_NOMINATIF_ABSENT))
    elif not lignes_ens:
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

    for lignes, colonnes, libelle in ((lignes_etab, CHAMPS_NUMERIQUES_ETAB, "établissements"),
                                      (lignes_ens, CHAMPS_NUMERIQUES_ENS, "enseignants")):
        for col in colonnes:
            aberrantes = sum(1 for l in lignes if (v := nombre_ou_none(l.get(col))) is not None and abs(v) > VALEUR_MAX)
            if aberrantes:
                erreurs.append(_anomalie(
                    "VALEUR_ABERRANTE", "erreur",
                    f"{aberrantes} valeur(s) supérieure(s) à {VALEUR_MAX:,} dans {col} ({libelle}) : "
                    "saisie manifestement erronée, corrigez le fichier.".replace(",", " "), colonne=col))
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

    # Données absentes : le calcul garde une valeur par défaut (35 ans, 0 élève, 0 salle), mais elle est signalée.
    if lignes_ens and C.COL_ENS_AGE not in lignes_ens[0]:
        avert.append(_anomalie(
            "ENS_AGE_ABSENT", "avertissement",
            f"La colonne {C.COL_ENS_AGE} est absente : un âge de 35 ans est supposé pour les {len(lignes_ens)} "
            "enseignants. Départs à la retraite, cohortes d'âge et ajustements d'âge ne sont pas fiables.",
            colonne=C.COL_ENS_AGE))
    # Situation matrimoniale (composante C3 du barème) : une valeur absente, vide ou non reconnue vaut 0 point ; elle
    # n'est jamais assimilée à « célibataire ». Signalée pour que la donnée soit corrigée à la source.
    vides, inconnues = 0, Counter()
    for l in lignes_ens:
        brut = l.get(C.COL_ENS_SITU)
        if categorie_situation(brut) is not None:
            continue
        if est_vide(brut):
            vides += 1
        else:
            inconnues[texte(brut)] += 1
    if vides or inconnues:
        nb_inconnues = sum(inconnues.values())
        detail = []
        if vides:
            detail.append(f"{vides} sans situation renseignée")
        if nb_inconnues:
            detail.append(f"{nb_inconnues} avec une situation non reconnue ({', '.join(f'« {v} »' for v, _ in inconnues.most_common(5))})")
        avert.append(_anomalie(
            "ENS_SITUATION_ABSENTE_OU_INCONNUE", "avertissement",
            f"{vides + nb_inconnues} enseignant(s) : {' ; '.join(detail)}. La composante matrimoniale du barème "
            "(C3) vaut 0 point pour eux : ils ne sont pas comptés comme « célibataire ». Reconnues : célibataire, "
            "marié(e), divorcé(e), veuf(ve).",
            colonne=C.COL_ENS_SITU, valeurs=[v for v, _ in inconnues.most_common(50)]))
    sans_effectif = [texte(l.get(C.COL_ETAB_ID)) for l in lignes_etab if nombre_ou_none(l.get(C.COL_ETAB_NE)) is None]
    if sans_effectif:
        avert.append(_anomalie(
            "ETAB_EFFECTIF_INCONNU", "avertissement",
            f"{len(sans_effectif)} école(s) sans effectif d'élèves renseigné : le besoin est calculé pour 0 élève "
            "(un seul maître) et les indicateurs pédagogiques ne s'appliquent pas.",
            colonne=C.COL_ETAB_NE, valeurs=sans_effectif[:50]))
    sans_salles = [texte(l.get(C.COL_ETAB_ID)) for l in lignes_etab
                   if nombre_ou_none(l.get(C.COL_ETAB_SSF)) is None and nombre_ou_none(l.get(C.COL_ETAB_SDF)) is None]
    if sans_salles:
        avert.append(_anomalie(
            "ETAB_SALLES_INCONNUES", "avertissement",
            f"{len(sans_salles)} école(s) sans nombre de salles : capacité inconnue, comptée pour 0 salle (aucun "
            "poste ne peut y être ouvert tant que les salles ne sont pas renseignées).",
            colonne=C.COL_ETAB_SSF, valeurs=sans_salles[:50]))

    # Motif de demande sans école identifiable parmi les vœux : aucune bonification ciblée (voir mobilite.bonification).
    sans_ecole = []
    for l in lignes_ens:
        # Une ligne sans matricule est déjà signalée en erreur : elle ne peut pas être construite.
        if (texte(l.get(C.COL_ENS_ID)) and not est_vide(l.get(C.COL_ENS_MOTIF))
                and ecole_bonifiee(construire_enseignant(l)) is None):
            sans_ecole.append(texte(l.get(C.COL_ENS_ID)))
    if sans_ecole:
        avert.append(_anomalie(
            "MOTIF_SANS_ECOLE", "avertissement",
            f"{len(sans_ecole)} enseignant(s) ont un motif de demande qui ne désigne aucune de leurs écoles demandées "
            "(ou d'un type non reconnu) : aucune bonification ciblée. Citez l'identifiant de l'école visée dans le motif.",
            colonne=C.COL_ENS_MOTIF, valeurs=sans_ecole[:50]))

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

    reconciliation = reconcilier_effectifs(lignes_etab, lignes_ens)
    if reconciliation and reconciliation["ecoles_en_ecart"]:
        r = reconciliation
        avert.append(_anomalie(
            "ECART_EFFECTIFS", "avertissement",
            f"{r['ecoles_en_ecart']} école(s) sur {r['ecoles_comparees']} ont un effectif déclaré différent du nombre "
            f"de matricules rattachés (écart net {r['ecart_total']:+g}, écart absolu {r['ecart_absolu_total']:g}). "
            "L'effectif déclaré fait foi.", ecoles=r["ecoles_en_ecart"]))

    return {
        "valide": not erreurs, "erreurs": erreurs, "avertissements": avert, "nominatif_disponible": nominatif,
        "reconciliation_effectifs": reconciliation,
        "statistiques": {"nb_etablissements": len(lignes_etab), "nb_enseignants": len(lignes_ens) if nominatif else None,
                         "nb_erreurs": len(erreurs), "nb_avertissements": len(avert),
                         "nb_ecoles_en_ecart_effectif": reconciliation["ecoles_en_ecart"] if reconciliation else None},
    }
