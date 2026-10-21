"""Hypothèses de la planification : valeurs par défaut, normalisation et contrôle.

Les arbitrages du rapport DRH d'octobre 2026 (codeSource, `DEFAULT_PLANNING_PARAMS` et
`Planification5YearsService.normaliser_parametres`) sont conservés dans le bloc `drh` des hypothèses, à côté des
hypothèses documentées du contrat (retraite, attrition, quotas, vivier). Seuls les paramètres du primaire servent :
les jeux importés ne distinguent pas la maternelle. Les anciens paramètres propres à la maternelle
(REM_REF_MAT, G_MAT_PCT, A_AUT_MAT_PCT, DIR_H_MAT_PCT, PLAF_MAT) ne sont plus des réglages actifs : ils sont
seulement ignorés s'ils apparaissent encore dans une configuration ou un jeu de hypothèses enregistré plus ancien
(lecture tolérante, sans migration).
"""
from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional

from .referentiel_drh import REGIONS_DRH

ANNEES_PLAN = ("N+1", "N+2", "N+3", "N+4", "N+5")
METHODES_ATTRITION = ("taux_unique", "par_sous_systeme", "par_region")
DATES_REFERENCE = ("rentree", "fin_annee_civile")
NIVEAUX = ("national", "region", "departement", "commune", "ecole", "iaeb")
SOURCES_VIVIER = ("excedentaire", "laureat_sans_poste", "disponibilite", "fin_detachement", "reintegration",
                  "autre")
SOUS_SYSTEMES = ("francophone", "anglophone")

#: Stock national du primaire public du rapport : sert à rapporter au jeu les volumes nationaux (plafond,
#: directeurs déchargés), comme codeSource le fait pour une région (`part_pri = stock_pri / 44232`).
STOCK_NATIONAL_PRIMAIRE = 44232
#: Part du primaire dans les prises de fonction de directeurs (codeSource, tableau 6 : 12 704 / 16 475).
PART_DIRECTEURS_PRIMAIRE = 12704 / 16475

# Paramètres par défaut du rapport officiel DRH (codeSource, DEFAULT_PLANNING_PARAMS). Primaire uniquement : les
# anciens paramètres de maternelle (REM_REF_MAT, G_MAT_PCT, A_AUT_MAT_PCT, DIR_H_MAT_PCT, PLAF_MAT) ne sont plus
# des réglages actifs (voir module docstring).
DRH_DEFAUT: Dict[str, Any] = {
    "REM_REF_PRI": 74.4,
    "G_PRI_PCT": 2.70,
    "AGE_RETRAITE": 60,
    "CORR_60": True,
    "A_TOT_PRI_PCT": 3.33,
    "R_PRI_PCT": 1.08,
    "A_AUT_PRI_PCT": 2.25,
    "ATTR_REG": False,
    "DIR_NOM_AN": 856,
    "DIR_H_PRI_PCT": 15.4,
    "ETAL_N": 5,
    "PLAF_PRI": 3000,
    "PLANCHER_RET": True,
}

#: Référentiel du modèle officiel M1 du SIGE (validation métier, lot 4) : constante en lecture seule, jamais
#: versionnée ni modifiable via les hypothèses. Exposée en API sous la clé `reference_attrition`, séparément du
#: bloc `attrition` (qui porte le taux réellement appliqué aux projections).
REFERENTIEL_ATTRITION_M1: Dict[str, Any] = {
    "modele": "M1",
    "formule": "Effectif(t+1) − Recrues(t+1) = β × Effectif(t) ; attrition totale = 1 − β",
    "perimetre": "primaire",
    "attrition_totale_pct": 3.33,
    "intervalle_confiance_points": 0.41,
    "retraites_pct": 1.08,
    "autres_departs_pct": 2.25,
    "fenetre_donnees": "SIGE 2018-2019 à 2024-2025",
    "nombre_regions": 10,
    "nombre_transitions_annuelles": 6,
    "source": "Rapport DRH d'octobre 2026, modèle officiel M1 du SIGE",
}


def normaliser_drh(params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Fusionne avec les valeurs du rapport et borne chaque paramètre (normaliser_parametres de codeSource)."""
    p = dict(DRH_DEFAUT)
    if params:
        p.update({k: v for k, v in params.items() if k in DRH_DEFAUT or k.endswith("_EXPLICIT")})
    p["A_TOT_PRI_PCT"] = max(0.0, min(100.0, float(p.get("A_TOT_PRI_PCT", 3.33))))
    p["R_PRI_PCT"] = max(0.0, min(100.0, float(p.get("R_PRI_PCT", 1.08))))
    if "A_AUT_PRI_PCT_EXPLICIT" in p:
        p["A_AUT_PRI_PCT"] = max(0.0, min(100.0, float(p.pop("A_AUT_PRI_PCT_EXPLICIT"))))
    else:
        p["A_AUT_PRI_PCT"] = max(0.0, min(100.0, p["A_TOT_PRI_PCT"] - p["R_PRI_PCT"]))
    p["REM_REF_PRI"] = max(5.0, float(p.get("REM_REF_PRI", 74.4)))
    p["G_PRI_PCT"] = max(-50.0, min(100.0, float(p.get("G_PRI_PCT", 2.70))))
    p["AGE_RETRAITE"] = max(45, min(75, int(p.get("AGE_RETRAITE", 60))))
    p["CORR_60"] = bool(p.get("CORR_60", True))
    p["ATTR_REG"] = bool(p.get("ATTR_REG", False))
    p["DIR_NOM_AN"] = max(0, int(p.get("DIR_NOM_AN", 856)))
    p["DIR_H_PRI_PCT"] = max(0.0, min(100.0, float(p.get("DIR_H_PRI_PCT", 15.4))))
    p["ETAL_N"] = max(1, min(15, int(p.get("ETAL_N", 5))))
    p["PLAF_PRI"] = max(0, int(p.get("PLAF_PRI", 3000)))
    p["PLANCHER_RET"] = bool(p.get("PLANCHER_RET", True))
    # Les anciennes clés de maternelle (voir module docstring) ne sont plus normalisées : si elles étaient
    # présentes dans `params` (config ou hypothèses d'un jeu plus ancien), elles sont simplement ignorées ici,
    # car `p` ne les reprend déjà plus de DRH_DEFAUT.
    return p


def taux_regionaux(drh: Dict[str, Any]) -> Dict[str, float]:
    """Autres départs par région : attrition régionale du rapport moins la part des retraites (R_PRI_PCT).

    Les retraites sont comptées nominativement d'après les âges : seul le reste de l'attrition est un taux.
    """
    return {r["region"]: round(max(0.0, float(r["attr_reg_pri_pct"]) - drh["R_PRI_PCT"]), 2) for r in REGIONS_DRH}


def hypotheses_par_defaut(cfg: Optional[dict] = None) -> Dict[str, Any]:
    """Hypothèses en vigueur tant qu'aucune n'a été enregistrée pour le jeu."""
    drh = normaliser_drh()
    age = int((cfg or {}).get("seuils", {}).get("age_retraite_ans", drh["AGE_RETRAITE"]))
    drh["AGE_RETRAITE"] = age
    return {
        "horizon": 5,
        "retraite": {
            "source": "Rapport DRH d'octobre 2026 (AGE_RETRAITE, CORR_60) et paramètres du moteur",
            "justification": (f"Départ l'année où l'agent atteint {age} ans ; les agents ayant déjà atteint cet âge "
                              "sont imputés à la première année (CORR_60). Aucune exception n'est documentée."),
            "age_legal": age,
            "date_reference": "rentree",
            "exceptions": [],
        },
        "attrition": {
            "source": "Rapport DRH d'octobre 2026, modèle officiel M1 du SIGE (A_TOT_PRI_PCT, R_PRI_PCT)",
            "justification": (
                f"Modèle M1 du SIGE : attrition totale de {drh['A_TOT_PRI_PCT']} % par an au primaire "
                f"(± {REFERENTIEL_ATTRITION_M1['intervalle_confiance_points']} point, {REFERENTIEL_ATTRITION_M1['fenetre_donnees']}, "
                f"{REFERENTIEL_ATTRITION_M1['nombre_regions']} régions, {REFERENTIEL_ATTRITION_M1['nombre_transitions_annuelles']} "
                f"transitions annuelles), dont {drh['R_PRI_PCT']} % de retraites — calculées nominativement par le "
                f"backend d'après les dates de naissance, jamais par ce taux — soit {drh['A_AUT_PRI_PCT']} % "
                "d'autres départs (mutations hors champ, abandons, décès) appliqués aux projections. Hypothèse "
                "nationale, non un taux observé sur ce jeu ; voir `reference_attrition` pour les chiffres du "
                "rapport DRH et l'estimation du taux observé via l'endpoint dédié."),
            "methode": "taux_unique",
            "taux_unique": drh["A_AUT_PRI_PCT"],
            "par_sous_systeme": {},
            "par_region": taux_regionaux(drh),
            "niveau_arrondi": "departement",
        },
        "quotas": {
            "source": "Mémo de synthèse, §2.1",
            "justification": ("Les quotas des années précédentes sont supposés recrutés : chaque année ne porte que "
                              f"son besoin nouveau, et le déficit initial est rattrapé sur {drh['ETAL_N']} ans (ETAL_N)."),
            "annees_precedentes_realisees": True,
        },
        "vivier": {
            "source": "Mémo de synthèse, §2.2",
            "justification": "Seules les deux sources confirmées sont retenues : excédentaires et lauréats sans poste.",
            "sources": ["excedentaire", "laureat_sans_poste"],
        },
        "drh": drh,
    }


def _nombre(v: Any) -> Optional[float]:
    if isinstance(v, bool) or v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _justification(bloc: dict, nom: str, erreurs: List[str]) -> Dict[str, str]:
    source, justification = bloc.get("source"), bloc.get("justification")
    if not isinstance(source, str) or not isinstance(justification, str):
        erreurs.append(f"{nom} : source et justification sont attendues (texte)")
    return {"source": str(source or ""), "justification": str(justification or "")}


def _taux(v: Any, nom: str, erreurs: List[str]) -> float:
    n = _nombre(v)
    if n is None or not 0 <= n <= 100:
        erreurs.append(f"{nom} : taux attendu entre 0 et 100 %")
        return 0.0
    return n


def valider_hypotheses(h: Any, base: Optional[Dict[str, Any]] = None) -> tuple[Dict[str, Any], List[str]]:
    """Hypothèses complètes et normalisées, et la liste des incohérences (vide si tout est valide).

    Le bloc `drh`, absent du contrat de l'interface, est repris de `base` (hypothèses en vigueur) s'il manque.
    """
    erreurs: List[str] = []
    if not isinstance(h, dict):
        return {}, ["Les hypothèses doivent être un objet"]
    base = base or hypotheses_par_defaut()
    out: Dict[str, Any] = {}

    horizon = _nombre(h.get("horizon"))
    if horizon is None or int(horizon) != horizon or not 1 <= horizon <= len(ANNEES_PLAN):
        erreurs.append(f"horizon : nombre entier d'années entre 1 et {len(ANNEES_PLAN)} attendu")
        horizon = 5
    out["horizon"] = int(horizon)

    r = h.get("retraite") if isinstance(h.get("retraite"), dict) else {}
    if not r:
        erreurs.append("retraite : bloc manquant")
    age = _nombre(r.get("age_legal"))
    if age is None or not 45 <= age <= 75:
        erreurs.append("retraite.age_legal : âge entre 45 et 75 ans attendu")
        age = base["retraite"]["age_legal"]
    date_ref = r.get("date_reference", "rentree")
    if date_ref not in DATES_REFERENCE:
        erreurs.append(f"retraite.date_reference : {' ou '.join(DATES_REFERENCE)} attendu")
        date_ref = "rentree"
    exceptions = []
    for i, x in enumerate(r.get("exceptions") or []):
        if (not isinstance(x, dict) or x.get("critere") not in ("statut", "categorie")
                or not str(x.get("valeur") or "").strip()
                or (_nombre(x.get("age_legal")) is None or not 45 <= float(x["age_legal"]) <= 75)):
            erreurs.append(f"retraite.exceptions[{i}] : critère (statut | categorie), valeur et âge (45 à 75) attendus")
            continue
        exceptions.append({"critere": x["critere"], "valeur": str(x["valeur"]).strip(),
                           "age_legal": int(float(x["age_legal"]))})
    out["retraite"] = {**_justification(r, "retraite", erreurs), "age_legal": int(age),
                       "date_reference": date_ref, "exceptions": exceptions}

    a = h.get("attrition") if isinstance(h.get("attrition"), dict) else {}
    if not a:
        erreurs.append("attrition : bloc manquant")
    drh_demande = h.get("drh") if isinstance(h.get("drh"), dict) else {}
    # ATTR_REG (option du rapport DRH) et attrition.methode désignent le même choix : la méthode fait foi,
    # ATTR_REG ne la fixe que lorsqu'elle n'est pas précisée.
    methode = a.get("methode") or ("par_region" if drh_demande.get("ATTR_REG") else "taux_unique")
    if methode not in METHODES_ATTRITION:
        erreurs.append(f"attrition.methode : {' | '.join(METHODES_ATTRITION)} attendu")
        methode = "taux_unique"
    par_ss = {}
    for k, v in (a.get("par_sous_systeme") or {}).items():
        if k not in SOUS_SYSTEMES:
            erreurs.append(f"attrition.par_sous_systeme : sous-système inconnu « {k} »")
            continue
        par_ss[k] = _taux(v, f"attrition.par_sous_systeme.{k}", erreurs)
    par_region = {str(k): _taux(v, f"attrition.par_region.{k}", erreurs)
                  for k, v in (a.get("par_region") or {}).items()}
    niveau = a.get("niveau_arrondi", "departement")
    if niveau not in NIVEAUX:
        erreurs.append(f"attrition.niveau_arrondi : {' | '.join(NIVEAUX)} attendu")
        niveau = "departement"
    out["attrition"] = {**_justification(a, "attrition", erreurs), "methode": methode,
                        "taux_unique": _taux(a.get("taux_unique"), "attrition.taux_unique", erreurs),
                        "par_sous_systeme": par_ss, "par_region": par_region, "niveau_arrondi": niveau}

    q = h.get("quotas") if isinstance(h.get("quotas"), dict) else {}
    if not q:
        erreurs.append("quotas : bloc manquant")
    if not isinstance(q.get("annees_precedentes_realisees", True), bool):
        erreurs.append("quotas.annees_precedentes_realisees : booléen attendu")
    out["quotas"] = {**_justification(q, "quotas", erreurs),
                     "annees_precedentes_realisees": bool(q.get("annees_precedentes_realisees", True))}

    v = h.get("vivier") if isinstance(h.get("vivier"), dict) else {}
    if not v:
        erreurs.append("vivier : bloc manquant")
    sources = v.get("sources")
    if not isinstance(sources, list) or any(s not in SOURCES_VIVIER for s in sources):
        erreurs.append(f"vivier.sources : liste parmi {', '.join(SOURCES_VIVIER)} attendue")
        sources = list(base["vivier"]["sources"])
    out["vivier"] = {**_justification(v, "vivier", erreurs), "sources": list(dict.fromkeys(sources))}

    drh = h.get("drh") if isinstance(h.get("drh"), dict) else base.get("drh")
    out["drh"] = normaliser_drh(drh)
    out["drh"]["AGE_RETRAITE"] = out["retraite"]["age_legal"]
    out["drh"]["ATTR_REG"] = methode == "par_region"
    return out, erreurs


def copie(h: Dict[str, Any]) -> Dict[str, Any]:
    return copy.deepcopy(h)
