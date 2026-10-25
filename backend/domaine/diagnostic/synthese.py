"""Diagnostic (Moteur A), priorités, points d'attention et texte narratif (règles, sans LLM)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from ..commun.encadrement import encadrement_population
from ..commun.texte import est_oui
from ..donnees import colonnes as C
from ..planification.projection import arrondi, taux_attrition_pondere
from ..planification.rapport import alea_et_raison
from ..rapport.territorial import alea_qualifie
from .territoires import Perimetre, filtrer_lignes


def _mobilisable(e: dict) -> float:
    """Enseignants mobilisables d'une école : le vivier rattaché (`mobilisables`), ou l'excédent théorique `xe`
    quand la ligne ne porte pas ce champ (jamais 0 au lieu de l'excédent faute de valeur)."""
    m = e.get("mobilisables")
    return float(m) if m is not None else float(e.get("xe", 0) or 0)


def totaux_diagnostic(ecoles: List[dict]) -> dict:
    """Totaux du diagnostic des lignes données (bases après, ou avant, les faits du Prince selon l'appelant) :
    seule source des totaux territoriaux (diagnostic, synthèse, nœuds de l'arbre territorial) — jamais recalculés
    une seconde fois ailleurs.

    `besoin_postes_avant_prince` : besoin des mêmes écoles avant les faits du Prince, quand les lignes le portent.
    `classes`, `effectif_total_eleves` : `None` si aucune école du périmètre ne renseigne la colonne (pas 0, pour
    ne pas laisser croire à une donnée connue et nulle). `eleves_par_enseignant_etat` et `eleves_par_classe` ne
    portent que sur les écoles qui renseignent les deux termes du ratio (même population au numérateur et au
    dénominateur, comme `domaine.commun.encadrement.taux_encadrement`).
    """
    besoin = sum(int(e.get("nb_postes_ouverts", 0) or 0) for e in ecoles)
    avant = sum(int(e.get("Besoin_Avant_Prince", e.get("nb_postes_ouverts", 0)) or 0) for e in ecoles)

    classes: Optional[int] = None
    effectif_total_eleves: Optional[int] = None
    eleves_avec_classes = 0
    classes_avec_eleves = 0
    ecoles_a_examiner = 0
    ecoles_satisfaisantes = 0

    for e in ecoles:
        co = e.get(C.COL_ETAB_CLASSES_OUVERTES)
        if co is not None:
            classes = (classes or 0) + co
        eleves = e.get(C.COL_ETAB_NE) if e.get("effectif_connu", True) is not False else None
        if eleves is not None:
            effectif_total_eleves = (effectif_total_eleves or 0) + eleves
            if co is not None:
                eleves_avec_classes += eleves
                classes_avec_eleves += co
        be, xe, ae = float(e.get("be", 0) or 0), float(e.get("xe", 0) or 0), float(e.get("ae", 0) or 0)
        if be <= 0 and xe <= 0 and ae > 0:
            ecoles_a_examiner += 1
        if be == 0:
            ecoles_satisfaisantes += 1

    eleves_par_enseignant = encadrement_population(
        (e.get("effectif_connu", True) is not False, e.get(C.COL_ETAB_NE), e.get(C.COL_ETAB_EE)) for e in ecoles).taux
    eleves_par_classe = round(eleves_avec_classes / classes_avec_eleves, 2) if classes_avec_eleves > 0 else None

    return {
        "nb_ecoles": len(ecoles),
        "besoin_postes": besoin,
        "besoin_postes_avant_prince": avant,
        "besoin_postes_apres_prince": besoin,
        "excedent_enseignants": int(sum(float(e.get("xe", 0) or 0) for e in ecoles)),
        "excedent_mobilisable": int(sum(_mobilisable(e) for e in ecoles)),
        "nb_ecoles_necessiteuses": sum(1 for e in ecoles if e.get("est_necessiteuse")),
        "nb_ecoles_excedentaires": sum(1 for e in ecoles if e.get("est_excedentaire")),
        "nb_ecoles_zone_rouge": sum(1 for e in ecoles if e.get("est_zone_rouge")),
        "nb_ecoles_a_examiner": ecoles_a_examiner,
        "nb_ecoles_satisfaisantes": ecoles_satisfaisantes,
        "salles_manquantes": int(sum(float(e.get("se", 0) or 0) for e in ecoles)),
        "surnombre": int(sum(float(e.get("ae", 0) or 0) for e in ecoles)),
        "enseignants_en_poste": int(sum(float(e.get(C.COL_ETAB_EE, 0) or 0) for e in ecoles)),
        "dotation_theorique": int(sum(float(e.get("De", 0) or 0) for e in ecoles)),
        "classes": classes,
        # Jamais renseignées par le fichier d'import actuel (une seule colonne Enseignants_Actuels) : toujours
        # `None`, comme côté interface, plutôt qu'une valeur inventée.
        "autres_enseignants": None,
        "postes_declares": None,
        "effectif_total_eleves": effectif_total_eleves,
        "eleves_par_enseignant_etat": eleves_par_enseignant,
        "eleves_par_classe": eleves_par_classe,
        # Écoles déclarant au moins une classe multigrade (nombre entier, ou ancien « Oui ») ; une cellule vide n'est
        # jamais comptée comme « aucune classe multigrade ».
        "classes_multigrades": sum(1 for e in ecoles if (e.get("Me") or 0) > 0
                                   or e.get("multigrades_statut") == "historique_oui"
                                   or ("Me" not in e and est_oui(e.get(C.COL_ETAB_MULTIGRADE)))),
        "nb_classes_multigrades": sum(int(e.get("Me") or 0) for e in ecoles
                                      if e.get("multigrades_statut") == "renseigne"),
        "multigrades_non_renseignes": sum(1 for e in ecoles if e.get("multigrades_statut", "non_renseigne")
                                          in ("non_renseigne", "invalide", "incoherent")),
        # Besoins confirmés et provisoires (minimum pédagogique de secours, effectif inconnu) : jamais confondus.
        "nb_ecoles_minimum_provisoire": sum(1 for e in ecoles if e.get("minimum_provisoire")),
        "besoin_postes_confirme": sum(int(e.get("nb_postes_ouverts", 0) or 0) for e in ecoles
                                      if e.get("statut_besoin", "confirme") == "confirme"),
        "besoin_postes_estime": sum(int(e.get("nb_postes_ouverts", 0) or 0) for e in ecoles
                                    if e.get("statut_besoin") == "estime"),
        "besoin_postes_provisoire": sum(int(e.get("nb_postes_ouverts", 0) or 0) for e in ecoles
                                        if e.get("statut_besoin") == "provisoire"),
        "excedent_a_verifier": int(sum(float(e.get("xe_a_verifier", 0) or 0) for e in ecoles)),
        "besoin_selon_rem": sum(int(e.get("Ce") or 0) for e in ecoles),
    }


@dataclass(frozen=True)
class _PointAlea:
    """Les trois champs que lit `alea_et_raison` : une école (élèves, enseignants) du périmètre."""
    eleves_connus: bool
    eleves_initial: float
    effectif_initial: float


def synthese_par_sous_systeme(ecoles: List[dict], hyp_attrition: dict, effectifs: Optional[Dict[str, float]] = None) -> dict:
    """Agrégation par sous-système (Moteur B, §2.5-2.6) : besoin, excédent, part couvrable par redéploiement
    interne, besoin restant, recrutement à prévoir (restant + attrition) et degré d'aléa — jamais par moyenne
    des écoles. Francophone et anglophone sont additionnés séparément : l'excédent de l'un ne couvre jamais le
    besoin de l'autre, et chaque excédent est plafonné à zéro école par école avant l'addition.

        couvrable   = Σ_s min(besoin_s, excédent_s)
        restant     = Σ_s max(0, besoin_s − excédent_s)
        recrutement = Σ_s (restant_s + attrition(effectif_s, sous-système s))

    `effectifs` : effectif retenu par école (après un plan), par identifiant ; à défaut, l'effectif actuel
    (`Enseignants_Actuels`). La cible (Ke) et la dotation (De) ne changent jamais : ce sont des capacités fixées
    à l'import, pas des grandeurs qui suivent le personnel effectivement en poste.

    Deux indicateurs distincts, jamais confondus :
      - `degre_alea` : degré d'aléa statistique = 1 − R² de la régression, école par école, du nombre d'enseignants
        sur le nombre d'élèves (« Diagnostic de la politique enseignante », IV.3) — la même fonction
        (`alea_et_raison`) que le rapport territorial, sur les écoles à l'effectif d'élèves connu, avec sa
        qualification E5 (`degre_alea_statut`) et sa raison (`degre_alea_raison`) ; `None` si non calculable ;
      - `taux_desequilibre` : (besoin + excédent) ÷ Σ cibles — part de la cible qui n'est pas là où il faut. Ce n'est
        PAS un degré d'aléa : il ne mesure pas la déconnexion entre dotation et effectifs d'élèves.
    """
    groupes: Dict[str, dict] = {}
    points: List[_PointAlea] = []
    for e in ecoles:
        ss = e.get(C.COL_ETAB_SS) or "non_renseigne"
        g = groupes.setdefault(ss, {"sous_systeme": ss, "besoin": 0.0, "excedent": 0.0, "salles_manquantes": 0.0,
                                     "effectif": 0.0, "somme_cibles": 0.0, "poids": []})
        E = float((effectifs or {}).get(e.get(C.COL_ETAB_ID), e.get(C.COL_ETAB_EE, 0)) or 0)
        cible, dotation = float(e.get("Ke", 0) or 0), float(e.get("De", 0) or 0)
        g["besoin"] += max(0.0, cible - E)
        g["excedent"] += max(0.0, E - dotation)
        g["salles_manquantes"] += float(e.get("se", 0) or 0)
        g["effectif"] += E
        g["somme_cibles"] += cible
        g["poids"].append((e.get(C.COL_ETAB_REGION), ss, E))
        points.append(_PointAlea(eleves_connus=e.get("effectif_connu", True) is not False,
                                 eleves_initial=float(e.get(C.COL_ETAB_NE) or 0), effectif_initial=E))

    par_sous_systeme = []
    for g in sorted(groupes.values(), key=lambda g: str(g["sous_systeme"])):
        couvrable = min(g["besoin"], g["excedent"])
        restant = max(0.0, g["besoin"] - g["excedent"])
        taux = taux_attrition_pondere(g["poids"], hyp_attrition)
        departs = arrondi(taux * g["effectif"] / 100.0)
        par_sous_systeme.append({
            "sous_systeme": g["sous_systeme"], "besoin": int(round(g["besoin"])), "excedent": int(round(g["excedent"])),
            "salles_manquantes": int(round(g["salles_manquantes"])), "effectif": int(round(g["effectif"])),
            "couvrable": int(round(couvrable)), "restant": int(round(restant)),
            "somme_cibles": int(round(g["somme_cibles"])),
            "recrutement_a_prevoir": int(round(restant)) + departs,
        })

    somme = lambda cle: sum(g[cle] for g in par_sous_systeme)  # noqa: E731
    besoin, excedent, somme_cibles = somme("besoin"), somme("excedent"), sum(g["somme_cibles"] for g in groupes.values())
    valeur_alea, raison_alea = alea_et_raison(points)
    alea = alea_qualifie(valeur_alea, raison_alea, sum(1 for p in points if p.eleves_connus))
    return {
        "par_sous_systeme": par_sous_systeme,
        "besoin": besoin, "excedent": excedent,
        "salles_manquantes": somme("salles_manquantes"),
        "couvrable": somme("couvrable"), "restant": somme("restant"),
        "recrutement_a_prevoir": somme("recrutement_a_prevoir"),
        "degre_alea": alea["valeur"], "degre_alea_statut": alea["statut"], "degre_alea_raison": alea["raison"],
        "taux_desequilibre": round((besoin + excedent) / somme_cibles, 4) if somme_cibles > 0 else None,
    }


def filtrer_ecoles(ecoles: List[dict], *, perimetre: Perimetre, zone: str = "", securite: str = "",
                   sous_systeme: str = "", type_etab: str = "", seulement: str = "", q: str = "") -> List[dict]:
    from ..commun.texte import cle_recherche, norm
    res = filtrer_lignes(ecoles, perimetre, C.COL_ETAB_REGION, C.COL_ETAB_DEPT, C.COL_ETAB_COMMUNE)
    if zone:
        res = [e for e in res if norm(e.get(C.COL_ETAB_ALPHA)) == norm(zone)]
    if securite:
        res = [e for e in res if norm(e.get(C.COL_ETAB_SIGMA)) == norm(securite)]
    if sous_systeme:
        res = [e for e in res if norm(e.get(C.COL_ETAB_SS)) == norm(sous_systeme)]
    if type_etab:
        res = [e for e in res if norm(e.get("type_etab")) == norm(type_etab)]
    if seulement == "necessiteuses":
        res = [e for e in res if e.get("est_necessiteuse")]
    elif seulement == "excedentaires":
        res = [e for e in res if e.get("est_excedentaire")]
    elif seulement == "zone_rouge":
        res = [e for e in res if e.get("est_zone_rouge")]
    if q:
        k = cle_recherche(q)
        res = [e for e in res if k in cle_recherche(e.get(C.COL_ETAB_ID)) or k in cle_recherche(e.get("nom_etab"))
               or k in cle_recherche(e.get(C.COL_ETAB_COMMUNE))]
    return res


def raisons_priorite(e: dict) -> List[str]:
    r = []
    if e.get("est_zone_rouge"):
        r.append("Zone à sécurité critique (rouge)")
    if (e.get("alpha") or 0) >= 15:
        r.append("Accessibilité difficile (zone rurale ou enclavée)")
    if (e.get("beta") or 0) >= 10:
        r.append("Remplissage des classes élevé (élèves par enseignant)")
    if (e.get("nb_postes_ouverts") or 0) > 0:
        r.append(f"{int(e['nb_postes_ouverts'])} poste(s) ouvert(s)")
    if (e.get("se") or 0) > 0:
        r.append(f"{int(e['se'])} salle(s) manquante(s)")
    if (e.get(C.COL_ETAB_EE) or 0) <= 0:
        r.append("Aucun enseignant en poste")
    return r


STRUCTURES = ("IAEB", "DREB", "DELEGATION")


def _rem(e: dict) -> float:
    """Élèves par enseignant ; une école sans maître mais avec des élèves passe en premier."""
    ee, ne = float(e.get(C.COL_ETAB_EE, 0) or 0), float(e.get(C.COL_ETAB_NE, 0) or 0)
    return ne / ee if ee > 0 else (float("inf") if ne > 0 else 0.0)


def ordre_priorite(ecoles: List[dict]) -> List[dict]:
    """Écoles à besoin, dans l'ordre de priorité d'accueil (méthodologie §3.3.4) : poids du poste Up décroissant ;
    à poids égal les écoles avant les structures (IAEB, DREB…), puis le REM le plus élevé ; enfin, pour un ordre total,
    le nombre de postes ouverts, la zone rouge puis l'identifiant. C'est l'ordre unique : l'interface l'affiche tel quel."""
    necessiteuses = [e for e in ecoles if e.get("est_necessiteuse")]
    necessiteuses.sort(key=lambda e: (-float(e.get("Up", 0) or 0), str(e.get("type_etab") or "").upper() in STRUCTURES,
                                      -_rem(e), -int(e.get("nb_postes_ouverts", 0) or 0),
                                      not e.get("est_zone_rouge"), str(e.get(C.COL_ETAB_ID))))
    return necessiteuses


def attribuer_rangs(ecoles: List[dict]) -> List[dict]:
    """Ajoute `rang_priorite` (1 = premier ; `None` pour une école sans besoin) à chaque ligne, en place."""
    rangs = {e[C.COL_ETAB_ID]: i for i, e in enumerate(ordre_priorite(ecoles), 1)}
    for e in ecoles:
        e["rang_priorite"] = rangs.get(e[C.COL_ETAB_ID])
    return ecoles


def trier_par_priorite(ecoles: List[dict]) -> List[dict]:
    """Priorité d'affectation (voir `ordre_priorite`), avec rang et raisons."""
    return [{**e, "rang": i + 1, "raisons": raisons_priorite(e)} for i, e in enumerate(ordre_priorite(ecoles))]


def points_attention(synthese: dict, ecoles: List[dict]) -> List[dict]:
    pts = []
    besoin = synthese.get("besoin_total", 0)
    if synthese.get("postes_rouge_non_pourvus", 0) > 0:
        pts.append({"code": "ZONE_ROUGE", "gravite": "critique",
                    "message": f"{synthese['postes_rouge_non_pourvus']} poste(s) en zone rouge restent non pourvus."})
    if besoin:
        taux = synthese.get("affectes", 0) / besoin
        if taux < 0.5:
            pts.append({"code": "COUVERTURE_FAIBLE", "gravite": "alerte",
                        "message": f"Seuls {taux:.0%} du besoin sont couverts par la mobilité interne."})
    if synthese.get("non_affectes", 0) > 0:
        pts.append({"code": "VIVIER_RESIDUEL", "gravite": "info",
                    "message": f"{synthese['non_affectes']} enseignant(s) du vivier restent sans poste compatible."})
    if synthese.get("a_recruter", 0) > 0:
        pts.append({"code": "RECRUTEMENT", "gravite": "alerte",
                    "message": f"{synthese['a_recruter']} poste(s) devront être pourvus par recrutement."})
    manquantes = int(sum(float(e.get("se", 0) or 0) for e in ecoles))
    if manquantes > 0:
        pts.append({"code": "SALLES", "gravite": "info",
                    "message": f"{manquantes} salle(s) de classe manquante(s) limitent la dotation effective."})
    if synthese.get("effet_de_prince", 0) > 0:
        pts.append({"code": "PRINCE", "gravite": "info",
                    "message": f"{synthese['effet_de_prince']} mouvement(s) du Prince appliqués aux bases avant l'algorithme."})
    return pts


def texte_narratif(synthese: dict, perimetre_titre: str) -> str:
    b, a = synthese.get("besoin_total", 0), synthese.get("affectes", 0)
    couv = f"{a / b:.0%}" if b else "n/a"
    return (f"Périmètre {perimetre_titre} : {b} poste(s) à pourvoir pour {synthese.get('disponibles', 0)} "
            f"enseignant(s) mobilisable(s), après les {synthese.get('effet_de_prince', 0)} mouvement(s) du Prince "
            f"appliqués aux bases. {a} affectation(s) réalisée(s) (couverture {couv}). "
            f"{synthese.get('postes_non_pourvus', 0)} poste(s) restent à pourvoir par recrutement.")
