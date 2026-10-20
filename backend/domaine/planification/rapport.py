"""Tableaux du rapport DRH d'octobre 2026 (§3 à §9), calculés sur les données du jeu importé.

  - §3 tableau national (primaire) et §5 recrutements par région : quatre scénarios de recrutement (S-min,
    S-maintien, S-besoin, sous plafond), chacun avec son propre stock, puisque l'attrition s'applique au stock ;
    le national additionne les régions, sans compenser les besoins des unes par les excédents des autres ;
  - §4 retraites nominatives par région et par année ;
  - §7 redéploiement : excédents et déficits des écoles (règle du référentiel), redéployable à l'intérieur de
    chaque arrondissement (commune), cohorte « au moins N ans au poste » ;
  - §8 priorités régionales selon les règles du rapport, et fiche des problèmes de chaque région ;
  - §9 limites propres au jeu.
Le jeu ne distingue pas la maternelle : seul le bloc primaire est produit.
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Optional

from ..commun.texte import cle_tri_fr
from ..donnees.modeles import Ecole, Enseignant
from .parametres import ANNEES_PLAN
from .projection import (SCENARIOS, ProjectionEcole, arrondi, calculer_annees, code_sous_systeme, est_structure,
                         taux_attrition)
from .referentiel_drh import region_drh

LIBELLES_SCENARIOS = {"min": "S-min", "maintien": "S-maintien", "besoin": "S-besoin", "plafond": "Sous plafond"}
#: Seuils du classement du rapport : écart de REM (points) et part des retraites sur trois ans.
ECART_REM = 10.0
SEUIL_RETRAITES_3ANS = 7.0
SEUIL_FIABILITE = 10.0


def _pct(n: float, total: float) -> float:
    return round(100.0 * n / total, 1) if total else 0.0


def _rem(eleves: float, effectif: float) -> Optional[float]:
    return round(eleves / effectif, 1) if effectif > 0 else None


def _fr(x: float, decimales: int = 1) -> str:
    return f"{x:.{decimales}f}".replace(".", ",")


def _entier(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def eleves_base(ecoles: List[ProjectionEcole]) -> float:
    return sum(e.eleves_initial for e in ecoles if e.eleves_connus)


def rem_base(ecoles: List[ProjectionEcole]) -> Optional[float]:
    return _rem(eleves_base(ecoles), sum(e.effectif_initial for e in ecoles))


def regions(ecoles: List[ProjectionEcole]) -> Dict[str, List[ProjectionEcole]]:
    par: Dict[str, List[ProjectionEcole]] = {}
    for e in ecoles:
        par.setdefault(e.region or "Région non renseignée", []).append(e)
    return dict(sorted(par.items(), key=lambda x: cle_tri_fr(x[0])))


# --- Scénarios -----------------------------------------------------------------------------------------------

def trajectoires(ecoles: List[ProjectionEcole], hyp: dict, horizon: int, ressources: int = 0) -> Dict[str, List[dict]]:
    """Les lignes annuelles de chaque scénario pour un ensemble d'écoles."""
    return {s: calculer_annees(ecoles, hyp, ressources_supplementaires=ressources, scenario=s)[:horizon]
            for s in SCENARIOS}


def _sommer(par_region: List[Dict[str, List[dict]]], horizon: int) -> Dict[str, List[dict]]:
    """Additionne les trajectoires régionales, année par année et scénario par scénario."""
    cles = ("effectif_debut", "departs_retraite", "departs_attrition", "directeurs_decharges", "recrutement",
            "eleves", "besoin", "quota_calcule")
    out: Dict[str, List[dict]] = {}
    for s in SCENARIOS:
        lignes = []
        for k in range(horizon):
            ligne = {"annee": ANNEES_PLAN[k], **{c: 0 for c in cles}}
            for t in par_region:
                for c in cles:
                    ligne[c] += t[s][k].get(c) or 0
            ligne["eleves"] = round(ligne["eleves"], 1)
            lignes.append(ligne)
        out[s] = lignes
    return out


def stock_fin(d: dict) -> int:
    """Stock de l'année après ses départs et ses recrutements (base du REM obtenu, comme dans le rapport)."""
    return max(0, d["effectif_debut"] - d["departs_retraite"] - d["departs_attrition"] - d["directeurs_decharges"]
               + d["recrutement"])


def rems(lignes: List[dict]) -> List[Optional[float]]:
    """REM obtenu chaque année : élèves de l'année ÷ stock après départs et recrutements de l'année."""
    return [_rem(d["eleves"], stock_fin(d)) for d in lignes]


def _rem_final(lignes: List[dict]) -> Optional[float]:
    return rems(lignes)[-1] if lignes else None


def tableau_national(ecoles: List[ProjectionEcole], traj: Dict[str, List[dict]], hyp: dict, horizon: int) -> dict:
    """§3 : lignes du tableau national, base puis chaque année de l'horizon (trajectoire « sous plafond »)."""
    ref = float(hyp["drh"]["REM_REF_PRI"])
    base_eleves = eleves_base(ecoles)
    base_effectif = sum(e.effectif_initial for e in ecoles)
    plafond = traj["plafond"]
    annees = ["Base"] + [l["annee"] for l in plafond]

    def ligne(libelle: str, base, valeurs: List) -> dict:
        return {"libelle": libelle, "valeurs": [base] + valeurs}

    lignes = [
        ligne("Élèves projetés", round(base_eleves), [round(l["eleves"]) for l in plafond]),
        ligne("Enseignants nécessaires (élèves ÷ REM de référence)", arrondi(base_eleves / ref),
              [arrondi(l["eleves"] / ref) for l in plafond]),
        ligne("Enseignants en poste en début d'année (sous plafond)", base_effectif,
              [l["effectif_debut"] for l in plafond]),
        ligne("Retraites (quota incompressible)", None, [l["departs_retraite"] for l in plafond]),
        ligne("Autres départs (sous plafond)", None, [l["departs_attrition"] for l in plafond]),
        ligne("Directeurs déchargés de classe", None, [l["directeurs_decharges"] for l in plafond]),
    ]
    for s in SCENARIOS:
        lignes.append(ligne(f"Recrutement {LIBELLES_SCENARIOS[s]}", None, [l["recrutement"] for l in traj[s]]))
    for s in ("besoin", "min", "maintien", "plafond"):
        lignes.append(ligne(f"REM obtenu – {LIBELLES_SCENARIOS[s]}", _rem(base_eleves, base_effectif),
                            rems(traj[s])))
    finals = {s: _rem_final(traj[s]) for s in SCENARIOS}
    return {"annees": annees, "lignes": lignes, "rem_reference": ref, "rem_final": finals}


# --- Redéploiement -------------------------------------------------------------------------------------------

def statut_ecole(e: ProjectionEcole) -> str:
    if not e.eleves_connus:
        return "sans_eleves"
    if e.deficit_initial > 0:
        return "deficit"
    if e.excedent_initial > 0:
        return "excedent"
    return "equilibre"


def redeployable(ecoles: List[ProjectionEcole]) -> int:
    """Postes redéployables sans quitter l'arrondissement : Σ par commune de min(excédents, déficits)."""
    par: Dict[tuple, List[int]] = {}
    for e in ecoles:
        c = par.setdefault((e.region, e.departement, e.commune), [0, 0])
        c[0] += e.excedent_initial
        c[1] += e.deficit_initial
    return sum(min(x, d) for x, d in par.values())


def cohorte(enseignants: List[Enseignant], ecoles: List[ProjectionEcole], seuil: float) -> List[dict]:
    par_id = {e.id: e for e in ecoles}
    out = []
    for t in enseignants:
        e = par_id.get(t.ecole_attache)
        if e is None or (t.anciennete_poste or 0) < seuil:
            continue
        out.append({"matricule": t.matricule, "nom": f"{t.nom} {t.prenom}".strip() or t.matricule,
                    "id_ecole": e.id, "nom_ecole": e.nom, "region": e.region, "departement": e.departement,
                    "commune": e.commune, "anciennete_poste": t.anciennete_poste, "statut_ecole": statut_ecole(e)})
    return sorted(out, key=lambda x: (cle_tri_fr(x["region"]), cle_tri_fr(x["commune"]), cle_tri_fr(x["nom"])))


def ligne_redeploiement(territoire: str, ecoles: List[ProjectionEcole], enseignants: List[Enseignant],
                        seuil: float, horizon: int) -> dict:
    statuts = [statut_ecole(e) for e in ecoles]
    return {"territoire": territoire, "ecoles": len(ecoles),
            "ecoles_deficit": statuts.count("deficit"), "ecoles_excedent": statuts.count("excedent"),
            "ecoles_equilibre": statuts.count("equilibre"), "ecoles_sans_eleves": statuts.count("sans_eleves"),
            "excedents": sum(e.excedent_initial for e in ecoles), "deficits": sum(e.deficit_initial for e in ecoles),
            "redeployable_arrondissement": redeployable(ecoles),
            "cohorte": len(cohorte(enseignants, ecoles, seuil)),
            "retraites": sum(sum(e.retraites[:horizon]) for e in ecoles)}


def lignes_ecoles(ecoles: List[ProjectionEcole]) -> List[dict]:
    """Colonnes C1 (enseignants du jeu) et C3 (cible du référentiel) de chaque école, filtrables par commune."""
    return [{"id_ecole": e.id, "nom_ecole": e.nom, "region": e.region, "departement": e.departement,
             "commune": e.commune, "eleves": round(e.eleves_initial) if e.eleves_connus else None,
             "c1_enseignants": e.effectif_initial, "c3_necessaires": e.cible_initial,
             "deficit": e.deficit_initial, "excedent": e.excedent_initial, "statut": statut_ecole(e)}
            for e in sorted(ecoles, key=lambda e: (cle_tri_fr(e.region), cle_tri_fr(e.commune), cle_tri_fr(e.nom)))]


# --- Indicateurs régionaux des fiches ------------------------------------------------------------------------

def part_sous_dotees(ecoles: List[ProjectionEcole]) -> float:
    """Part des écoles de plus de 100 élèves qui ont moins de 3 enseignants."""
    grandes = [e for e in ecoles if e.eleves_connus and e.eleves_initial > 100]
    return _pct(sum(1 for e in grandes if e.effectif_initial < 3), len(grandes))


def part_agents_sans_eleves(ecoles: List[ProjectionEcole]) -> float:
    """Part des agents affectés dans une école dont l'effectif d'élèves est inconnu (données à fiabiliser)."""
    return _pct(sum(e.effectif_initial for e in ecoles if not e.eleves_connus), sum(e.effectif_initial for e in ecoles))


def alea_et_raison(ecoles: List[ProjectionEcole]) -> tuple:
    """(aléa, raison) : l'aléa est `None` quand il n'est pas calculable, et la raison dit pourquoi."""
    pts = [(e.eleves_initial, float(e.effectif_initial)) for e in ecoles if e.eleves_connus]
    n = len(pts)
    if n < 3:
        return None, "Moins de 3 écoles avec un effectif d'élèves connu"
    mx = sum(x for x, _ in pts) / n
    my = sum(y for _, y in pts) / n
    sxx = sum((x - mx) ** 2 for x, _ in pts)
    syy = sum((y - my) ** 2 for _, y in pts)
    sxy = sum((x - mx) * (y - my) for x, y in pts)
    if sxx == 0:
        return None, "Tous les effectifs d'élèves sont identiques"
    if syy == 0:
        return None, "Tous les effectifs d'enseignants sont identiques"
    return round(1 - sxy * sxy / (sxx * syy), 2), None


def ecoles_a_l_import(ecoles: Iterable[Ecole]) -> List[ProjectionEcole]:
    """Écoles telles que les bases importées les déclarent (effectifs déclarés, avant faits du Prince et avant
    l'algorithme), sous la forme que lit `alea_par_region`. Les structures administratives sont exclues, comme pour la
    projection."""
    return [ProjectionEcole(id=e.id, nom=e.nom or e.id, region=e.region, departement=e.departement,
                            commune=e.commune, iaeb=e.iaeb, sous_systeme=code_sous_systeme(e.sous_systeme),
                            eleves_connus=e.effectif_eleves > 0, effectif_initial=max(0, int(round(e.enseignants_actuels))),
                            arrivees=0, deficit_initial=0, eleves_initial=e.effectif_eleves)
            for e in ecoles if not est_structure(e)]


def alea(ecoles: List[ProjectionEcole]) -> Optional[float]:
    """Aléa d'affectation : 1 − R² de la régression du nombre d'enseignants sur le nombre d'élèves."""
    return alea_et_raison(ecoles)[0]


def alea_par_region(ecoles: List[ProjectionEcole]) -> dict:
    """Aléa national et de chaque région, avec le nombre d'écoles prises en compte et l'écart à la moyenne nationale."""
    def ligne(nom: str, liste: List[ProjectionEcole]) -> dict:
        valeur, raison = alea_et_raison(liste)
        return {"region": nom, "alea": valeur, "raison": raison, "ecoles": len(liste),
                "ecoles_avec_eleves": sum(1 for e in liste if e.eleves_connus)}

    national = ligne("National", ecoles)
    lignes = []
    for nom, liste in regions(ecoles).items():
        x = ligne(nom, liste)
        x["ecart_national"] = (round(x["alea"] - national["alea"], 2)
                               if x["alea"] is not None and national["alea"] is not None else None)
        lignes.append(x)
    national["ecart_national"] = None
    return {"national": national, "regions": lignes}


# --- Priorités -----------------------------------------------------------------------------------------------

def classer(rem: Optional[float], part_retraites: float, ref: float, seuil_retraites: float) -> tuple:
    """(priorité, situation, orientation) selon les règles du rapport."""
    vague = part_retraites > seuil_retraites
    if rem is not None and rem > ref + ECART_REM:
        return 1, "Déficit structurel d'encadrement", \
            "Recruter en priorité (S-besoin) et recevoir des enseignants redéployés"
    if rem is not None and abs(rem - ref) <= ECART_REM:
        return 2, "Encadrement proche de la norme" + (" ; vague de retraites" if vague else ""), \
            "Remplacer tous les départs (S-maintien)"
    situation = "Encadrement au-dessus de la norme" + (" ; vague de retraites" if vague else "")
    return (2 if vague else 3), situation, \
        "Remplacer au moins les retraites (S-min) ; région pourvoyeuse pour le redéploiement"


def fiche_region(nom: str, ecoles: List[ProjectionEcole], traj: Dict[str, List[dict]], hyp: dict, horizon: int,
                 nationaux: dict) -> dict:
    ref = float(hyp["drh"]["REM_REF_PRI"])
    r_pct = float(hyp["drh"]["R_PRI_PCT"])
    seuil = SEUIL_RETRAITES_3ANS * horizon / 3.0
    stock = sum(e.effectif_initial for e in ecoles)
    rem = rem_base(ecoles)
    retraites = [l["departs_retraite"] for l in traj["min"]]
    part_ret = _pct(sum(retraites), stock)
    priorite, situation, orientation = classer(rem, part_ret, ref, seuil)
    total = {s: sum(l["recrutement"] for l in traj[s]) for s in SCENARIOS}
    rem_txt = _fr(rem) if rem is not None else "non calculable"
    derniere = traj["min"][-1]["annee"] if traj["min"] else ""

    problemes = []
    if priorite == 1:
        final = _rem_final(traj["min"])
        problemes.append(("Déficit structurel d'encadrement",
                          f"REM du primaire de {rem_txt} (référence {_fr(ref)}). Atteindre la norme demande "
                          f"{_entier(total['besoin'])} recrutements sur {horizon} an(s) (S-besoin), contre "
                          f"{_entier(total['plafond'])} sous plafond ; à défaut, le REM serait de "
                          f"{_fr(final) if final is not None else '–'} en {derniere} avec les seules retraites "
                          "remplacées."))
    elif rem is not None and abs(rem - ref) <= ECART_REM:
        problemes.append(("Encadrement proche de la norme",
                          f"REM du primaire de {rem_txt} ; tout départ non remplacé le dégrade."))
    else:
        problemes.append(("Encadrement au-dessus de la norme",
                          f"REM du primaire de {rem_txt}. La région peut fournir des enseignants au redéploiement "
                          "plutôt que d'en recevoir."))
    detail = ", ".join(f"{n} en {a}" for n, a in zip(retraites, (l["annee"] for l in traj["min"])))
    problemes.append(("Retraites", f"{detail}, soit {_fr(part_ret)} % du stock ; quota incompressible de "
                                   f"{_entier(sum(retraites))} sur {horizon} an(s)"
                                   + (" — l'une des vagues les plus fortes du pays." if part_ret > seuil else ".")))
    attr = round(taux_attrition(ecoles, hyp) + r_pct, 2)
    if attr > nationaux["attrition"] + 0.05:
        problemes.append(("Autres départs élevés",
                          f"attrition estimée à {_fr(attr)} % par an au primaire (moyenne "
                          f"{_fr(nationaux['attrition'])} %) ; les motifs (mutations, abandons de poste, décès) "
                          "sont à examiner avec la DRH."))
    sd = part_sous_dotees(ecoles)
    if sd > nationaux["sous_dotees"]:
        problemes.append(("Écoles sous-dotées",
                          f"{_fr(sd)} % des écoles de plus de 100 élèves ont moins de 3 enseignants "
                          f"(moyenne {_fr(nationaux['sous_dotees'])} %)."))
    fia = part_agents_sans_eleves(ecoles)
    if fia > SEUIL_FIABILITE:
        problemes.append(("Données à fiabiliser",
                          f"{_fr(fia)} % des agents sont affectés dans une école dont l'effectif d'élèves est "
                          "inconnu."))
    a = alea(ecoles)
    if a is not None and nationaux["alea"] is not None and a > nationaux["alea"]:
        problemes.append(("Répartition inégale entre écoles",
                          f"aléa de {_fr(a, 2)} (moyenne {_fr(nationaux['alea'], 2)}) ; le nombre d'enseignants "
                          "suit mal le nombre d'élèves."))

    drh = region_drh(nom)
    return {"region": nom, "priorite": priorite, "rem_base": rem, "part_retraites": part_ret,
            "situation": situation, "orientation": orientation,
            "recrutements": total, "retraites": retraites,
            "problemes": [{"titre": t, "detail": d} for t, d in problemes],
            "priorite_rapport_drh": drh["priorite"] if drh else None}


# --- Limites -------------------------------------------------------------------------------------------------

def limites(ecoles: List[ProjectionEcole], enseignants: List[Enseignant], hyp: dict, traj_nat: Dict[str, List[dict]],
            agents_age_atteint: int) -> List[str]:
    drh, a = hyp["drh"], hyp["attrition"]
    ids = {e.id for e in ecoles}
    rattaches = [t for t in enseignants if t.ecole_attache in ids]
    age_connu = _pct(sum(1 for t in rattaches if t.age is not None), len(rattaches))
    out = [
        f"Âge connu pour {_fr(age_connu)} % des enseignants : les retraites des autres ne sont pas comptées.",
    ]
    if agents_age_atteint:
        quota1 = traj_nat["min"][0]["departs_retraite"] if traj_nat["min"] else 0
        out.append(f"{_entier(agents_age_atteint)} agents ont déjà {hyp['retraite']['age_legal']} ans ou plus et "
                   f"sont imputés à la première année (CORR_60), soit {_fr(_pct(agents_age_atteint, quota1))} % de "
                   "ses retraites : à confirmer par la DRH (en activité, prorogés ou non radiés).")
    methode = {"taux_unique": f"taux unique de {a['taux_unique']} % par an",
               "par_region": "taux propres à chaque région",
               "par_sous_systeme": "taux propres à chaque sous-système"}[a["methode"]]
    source = f" — source : {a['source']}" if a.get("source") else ""
    out += [
        f"Attrition hors retraite : {methode} (hypothèses de planification{source}) ; mutations, abandons et décès "
        "ne sont pas distingués.",
        f"Croissance des élèves de {drh['G_PRI_PCT']} % par an appliquée à toutes les écoles.",
        f"Directeurs : {drh['DIR_NOM_AN']} prises de fonction par an, dont {drh['DIR_H_PRI_PCT']} % sans classe "
        "(paramètres nationaux rapportés au périmètre) ; le jeu ne renseigne ni la fonction ni la date de prise de "
        "fonction.",
        "Besoin des écoles calculé par la règle du référentiel MINEDUB ; la ligne « enseignants nécessaires » "
        f"utilise le REM de référence ({drh['REM_REF_PRI']}).",
        "La maternelle n'est pas distinguée dans le jeu, et les chargés de classe du SIGE (colonne C2) comme les "
        "agents absents de la cartographie ne sont pas disponibles.",
    ]
    return out


# --- Assemblage ----------------------------------------------------------------------------------------------

def construire(ecoles: List[ProjectionEcole], enseignants: List[Enseignant], hyp: dict, horizon: int, *,
               ressources: Optional[Dict[str, int]] = None, seuil_cohorte: float = 5.0,
               agents_age_atteint: int = 0) -> dict:
    horizon = max(1, min(int(horizon), len(ANNEES_PLAN)))
    ressources = ressources or {}
    par_region = regions(ecoles)
    traj_reg = {r: trajectoires(liste, hyp, horizon, ressources.get(r, 0)) for r, liste in par_region.items()}
    traj_nat = _sommer(list(traj_reg.values()), horizon)
    nationaux = {"attrition": round(taux_attrition(ecoles, hyp) + float(hyp["drh"]["R_PRI_PCT"]), 2),
                 "sous_dotees": part_sous_dotees(ecoles), "alea": alea(ecoles)}

    retraites_regions = []
    scenarios_regions = []
    for r, liste in par_region.items():
        t = traj_reg[r]
        ret = [l["departs_retraite"] for l in t["min"]]
        retraites_regions.append({"region": r, "annees": ret, "total": sum(ret)})
        scenarios_regions.append({"region": r, **{s: sum(l["recrutement"] for l in t[s]) for s in SCENARIOS},
                                  "rem_base": rem_base(liste), "alea": alea(liste),
                                  "rem_final": {s: _rem_final(t[s]) for s in ("min", "besoin", "plafond")}})
    ret_nat = [l["departs_retraite"] for l in traj_nat["min"]]
    nat_scen = {"region": "National", **{s: sum(l["recrutement"] for l in traj_nat[s]) for s in SCENARIOS},
                "rem_base": rem_base(ecoles), "alea": nationaux["alea"],
                "rem_final": {s: _rem_final(traj_nat[s]) for s in ("min", "besoin", "plafond")}}

    fiches = [fiche_region(r, liste, traj_reg[r], hyp, horizon, nationaux) for r, liste in par_region.items()]
    fiches.sort(key=lambda f: (f["priorite"], -(f["rem_base"] or 0)))
    redeploiement = [ligne_redeploiement(r, liste, enseignants, seuil_cohorte, horizon)
                     for r, liste in par_region.items()]
    total_red = ligne_redeploiement("National", ecoles, enseignants, seuil_cohorte, horizon)
    # Le redéployable national reste la somme des arrondissements : on ne redéploie pas d'une région à l'autre ici.
    return {
        "horizon": horizon, "annees": list(ANNEES_PLAN[:horizon]),
        "national": tableau_national(ecoles, traj_nat, hyp, horizon),
        "retraites_regions": {"lignes": retraites_regions,
                              "national": {"region": "National", "annees": ret_nat, "total": sum(ret_nat)}},
        "scenarios_regions": {"lignes": scenarios_regions, "national": nat_scen},
        "redeploiement": {"lignes": redeploiement, "national": total_red, "seuil_cohorte": seuil_cohorte},
        "priorites": fiches,
        "limites": limites(ecoles, enseignants, hyp, traj_nat, agents_age_atteint),
        "parametres": {"rem_reference": float(hyp["drh"]["REM_REF_PRI"]), "ecart_rem": ECART_REM,
                       "seuil_retraites": round(SEUIL_RETRAITES_3ANS * horizon / 3.0, 2),
                       "plancher_retraites": bool(hyp["drh"]["PLANCHER_RET"]), "plafond": hyp["drh"]["PLAF_PRI"]},
    }
