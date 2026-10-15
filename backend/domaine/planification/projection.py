"""Projection sur cinq ans d'un ensemble d'écoles : effectifs, départs, besoin, vivier, quota calculé.

Règles (référence : moteur-reference/scripts/serveur/planification.ts, formules DRH de codeSource) :
  - situation de départ : l'effectif de chaque école (Enseignants_Actuels) après les mouvements du scénario retenu ;
  - retraites : un enseignant part l'année où il atteint l'âge légal, compté une seule fois, dans l'école qu'il
    occupe après le plan ; ceux qui l'ont déjà atteint sont imputés à N+1 si CORR_60, ignorés sinon ;
  - croissance des élèves (G_PRI_PCT) : l'effectif d'élèves de chaque école croît chaque année, et la cible K de
    l'école (règle du référentiel MINEDUB) est recalculée sur cet effectif ;
  - besoin d'une école : max(0 ; K − effectif restant) ; attrition hors retraite τ × effectif ÷ 100 arrondie à l'entier
    le plus proche (comme le rapport DRH : 44 232 × 2,25 % = 995) et classes
    libérées par les directeurs déchargés (DIR_NOM_AN × DIR_H_PRI_PCT), au niveau du périmètre ;
  - quotas des années précédentes supposés recrutés (hypothèse par défaut) : ils s'ajoutent à l'effectif suivant
    et le besoin d'une année est son besoin nouveau ; sinon le besoin se cumule d'année en année ;
  - quota calculé (scénario « sous plafond » de codeSource) : besoin de l'année, déficit initial rattrapé sur
    ETAL_N ans, moins les ressources du vivier ; plafonné à PLAF_PRI rapporté à l'effectif du périmètre, sans
    descendre sous les retraites de l'année si PLANCHER_RET.
"""
from __future__ import annotations

import dataclasses
import math
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Tuple

from ..commun.texte import norm, texte
from ..diagnostic.indicateurs import calculer_indicateurs
from ..donnees.modeles import Ecole, Enseignant
from .parametres import ANNEES_PLAN, PART_DIRECTEURS_PRIMAIRE, STOCK_NATIONAL_PRIMAIRE

STRUCTURES = ("IAEB", "DREB", "DELEGATION")


def code_sous_systeme(valeur) -> str:
    v = norm(valeur)
    if v.startswith("franco"):
        return "francophone"
    if v.startswith("anglo"):
        return "anglophone"
    return "non_renseigne"


def est_structure(ecole: Ecole) -> bool:
    return str(ecole.type_etab or "").upper() in STRUCTURES


def lieu_ecole(ident: str, region: str, departement: str, commune: str, iaeb: str, sous_systeme: str) -> Dict[str, str]:
    """Lieu d'une école, pour situer une décision dans un périmètre (suivi.dans)."""
    return {"ecole": ident, "region": region, "departement": departement, "commune": commune, "iaeb": iaeb,
            "sous_systeme": sous_systeme}


def lieu_de(ecole: Ecole) -> Dict[str, str]:
    return lieu_ecole(ecole.id, ecole.region, ecole.departement, ecole.commune, ecole.iaeb,
                      code_sous_systeme(ecole.sous_systeme))


@dataclass
class ProjectionEcole:
    id: str
    nom: str
    region: str
    departement: str
    commune: str
    iaeb: str
    sous_systeme: str
    eleves_connus: bool
    effectif_initial: int
    arrivees: int
    deficit_initial: int
    excedent_initial: int = 0
    cible_initial: int = 0
    eleves_initial: float = 0.0
    eleves: List[float] = field(default_factory=list)
    cibles: List[int] = field(default_factory=list)
    retraites: List[int] = field(default_factory=list)
    effectifs: List[int] = field(default_factory=list)
    besoins: List[int] = field(default_factory=list)
    excedents: List[int] = field(default_factory=list)

    @property
    def cible(self) -> int:
        return self.cibles[-1] if self.cibles else 0

    def lieu(self) -> Dict[str, str]:
        return lieu_ecole(self.id, self.region, self.departement, self.commune, self.iaeb, self.sous_systeme)


@dataclass
class DepartRetraite:
    annee: int                    # 0 pour N+1
    matricule: str
    nom: str
    id_ecole: str
    nom_ecole: str
    age_au_depart: int
    lieu: Dict[str, str]


def annee_depart(age: Optional[float], hyp: dict) -> Optional[int]:
    """Indice de l'année de départ à la retraite (0 = N+1), `None` si l'agent ne part pas dans les cinq ans.

    L'âge du fichier est celui de la rentrée de N+1. Apprécié en fin d'année civile, il gagne une année.
    """
    if age is None:
        return None
    r = hyp["retraite"]
    legal = r["age_legal"]
    if age >= legal:
        return 0 if hyp["drh"].get("CORR_60", True) else None
    decalage = 1 if r.get("date_reference") == "fin_annee_civile" else 0
    for k in range(len(ANNEES_PLAN)):
        if age + k + decalage >= legal:
            return k
    return None


def projeter_ecoles(ecoles: Iterable[Ecole], enseignants: Iterable[Enseignant], cfg: dict, hyp: dict, *,
                    affectations: Iterable[dict] = ()) -> Tuple[List[ProjectionEcole], List[DepartRetraite]]:
    """Projection de chaque école (hors structures administratives) et départs nominatifs à la retraite."""
    ecoles = [e for e in ecoles if not est_structure(e)]
    enseignants = list(enseignants)
    par_id = {e.id: e for e in ecoles}
    attache = {t.matricule: t.ecole_attache for t in enseignants}
    position: Dict[str, str] = {}
    ecart: Dict[str, int] = {}
    arrivees: Dict[str, int] = {}
    for a in affectations:
        matricule, dest = texte(a.get("id_ens")), texte(a.get("id_etab"))
        position[matricule] = dest
        ecart[dest] = ecart.get(dest, 0) + 1
        arrivees[dest] = arrivees.get(dest, 0) + 1
        orig = attache.get(matricule, "")
        if orig:
            ecart[orig] = ecart.get(orig, 0) - 1

    n = len(ANNEES_PLAN)
    retraites: Dict[str, List[int]] = {}
    departs: List[DepartRetraite] = []
    for t in enseignants:
        k = annee_depart(t.age, hyp)
        if k is None:
            continue
        id_ecole = position.get(t.matricule, t.ecole_attache)
        ecole = par_id.get(id_ecole)
        if ecole is None:
            continue
        retraites.setdefault(id_ecole, [0] * n)[k] += 1
        decalage = 1 if hyp["retraite"].get("date_reference") == "fin_annee_civile" else 0
        departs.append(DepartRetraite(
            annee=k, matricule=t.matricule, nom=f"{t.nom} {t.prenom}".strip() or t.matricule, id_ecole=id_ecole,
            nom_ecole=ecole.nom or ecole.id, age_au_depart=int(math.floor(max(t.age, 0) + k + decalage)),
            lieu=lieu_de(ecole)))

    g = float(hyp["drh"].get("G_PRI_PCT", 0)) / 100.0
    resultat: List[ProjectionEcole] = []
    for e in ecoles:
        initial = max(0, int(round(e.enseignants_actuels)) + ecart.get(e.id, 0))
        depart = dataclasses.replace(e, enseignants_actuels=float(initial))
        ind0 = calculer_indicateurs(depart, cfg)
        p = ProjectionEcole(
            id=e.id, nom=e.nom or e.id, region=e.region, departement=e.departement, commune=e.commune,
            iaeb=e.iaeb, sous_systeme=code_sous_systeme(e.sous_systeme), eleves_connus=e.effectif_eleves > 0,
            effectif_initial=initial, arrivees=arrivees.get(e.id, 0),
            deficit_initial=int(ind0.be), excedent_initial=int(ind0.xe), cible_initial=int(ind0.Ke),
            eleves_initial=e.effectif_eleves)
        par_annee = retraites.get(e.id, [0] * n)
        restant = initial
        for k in range(n):
            restant = max(0, restant - par_annee[k])
            eleves = e.effectif_eleves * (1.0 + g) ** (k + 1)
            ind = calculer_indicateurs(dataclasses.replace(e, effectif_eleves=eleves,
                                                           enseignants_actuels=float(restant)), cfg)
            p.eleves.append(eleves)
            p.cibles.append(int(ind.Ke))
            p.retraites.append(par_annee[k])
            p.effectifs.append(restant)
            p.besoins.append(int(ind.be))
            p.excedents.append(int(ind.xe))
        resultat.append(p)
    return resultat, departs


def arrondi(x: float) -> int:
    """Arrondi à l'entier le plus proche, demi vers le haut (round() de Python arrondit au pair)."""
    return int(math.floor(x + 0.5 + 1e-9))


def taux_attrition(ecoles: List[ProjectionEcole], hyp: dict) -> float:
    """Taux annuel d'autres départs du périmètre, pondéré par l'effectif initial selon la méthode retenue."""
    a = hyp["attrition"]
    unique = float(a.get("taux_unique", 0))
    methode = a.get("methode", "taux_unique")
    if methode == "taux_unique":
        return unique
    if methode == "par_region":
        par = {norm(k): float(v) for k, v in (a.get("par_region") or {}).items()}
        cle = lambda e: norm(e.region)  # noqa: E731
    else:
        par = {k: float(v) for k, v in (a.get("par_sous_systeme") or {}).items()}
        cle = lambda e: e.sous_systeme  # noqa: E731
    total = sum(e.effectif_initial for e in ecoles)
    if total == 0:
        return unique
    return sum(e.effectif_initial * par.get(cle(e), unique) for e in ecoles) / total


#: Scénarios de recrutement du rapport DRH : la règle fixe les recrues qui s'ajoutent au stock de l'année suivante.
SCENARIOS = ("min", "maintien", "besoin", "plafond")


def calculer_annees(ecoles: List[ProjectionEcole], hyp: dict, *, ressources_supplementaires: int = 0,
                    scenario: str = "plafond") -> List[dict]:
    """Les indicateurs du mémo, année par année, pour un ensemble d'écoles (avant report des décisions).

    `scenario` fixe les recrues ajoutées au stock suivant : « plafond » (quota calculé, si les quotas précédents
    sont supposés recrutés), « min » (retraites), « maintien » (tous les départs) ou « besoin » (quota avant
    plafond, jamais sous les retraites).
    """
    drh = hyp["drh"]
    horizon = min(int(hyp.get("horizon", 5)), len(ANNEES_PLAN))
    somme = lambda f: sum(f(e) for e in ecoles)  # noqa: E731
    taux = taux_attrition(ecoles, hyp)
    initial = somme(lambda e: e.effectif_initial)
    part = initial / STOCK_NATIONAL_PRIMAIRE
    directeurs = int(round(drh["DIR_NOM_AN"] * PART_DIRECTEURS_PRIMAIRE * drh["DIR_H_PRI_PCT"] / 100.0 * part))
    plafond = int(round(drh["PLAF_PRI"] * part)) if drh["PLAF_PRI"] > 0 else None
    deficit = somme(lambda e: e.deficit_initial)
    supposes = bool(hyp["quotas"].get("annees_precedentes_realisees", True))
    etalement = max(1, int(drh["ETAL_N"]))

    effectif = initial
    attrition_cumulee = directeurs_cumules = 0
    besoin_precedent = rattrapage_precedent = 0
    lignes = []
    for k in range(horizon):
        retraites = somme(lambda e: e.retraites[k])
        attrition = arrondi(taux * effectif / 100.0)
        attrition_cumulee += attrition
        directeurs_cumules += directeurs
        besoin_cumule = somme(lambda e: e.besoins[k]) + attrition_cumulee + directeurs_cumules
        besoin = max(0, besoin_cumule - besoin_precedent) if supposes else besoin_cumule
        besoin_precedent = besoin_cumule
        vivier = (somme(lambda e: e.excedents[0]) + ressources_supplementaires) if k == 0 else 0
        part_cumulee = int(round(deficit * min(k + 1, etalement) / etalement))
        if supposes:
            rattrapage, inclus = part_cumulee - rattrapage_precedent, (deficit if k == 0 else 0)
        else:
            rattrapage, inclus = part_cumulee, deficit
        rattrapage_precedent = part_cumulee
        brut = max(0, besoin - inclus + rattrapage - vivier)
        if plafond is None:
            quota = brut
        elif drh["PLANCHER_RET"]:
            quota = min(brut, max(plafond, retraites))
        else:
            quota = min(brut, plafond)
        eleves = somme(lambda e: e.eleves[k] if e.eleves_connus else 0.0)
        lignes.append({
            "annee": ANNEES_PLAN[k], "effectif_debut": effectif, "departs_retraite": retraites,
            "departs_attrition": attrition, "besoin": besoin, "ressources_vivier": vivier, "quota_calcule": quota,
            "quota_retenu": None, "nominations_prevues": 0, "nominations_realisees": 0,
            "deploiements_prevus": somme(lambda e: e.arrivees) if k == 0 else 0, "deploiements_realises": 0,
            "besoin_restant": quota,
            # Détail DRH (hors contrat) : taux appliqué, classes libérées, rattrapage, plafond, REM projeté.
            "taux_attrition": round(taux, 4), "directeurs_decharges": directeurs, "rattrapage": rattrapage,
            "plafond": plafond, "rem": round(eleves / effectif, 1) if effectif > 0 else None,
        })
        if scenario == "min":
            recrutes = retraites
        elif scenario == "maintien":
            recrutes = retraites + attrition + directeurs
        elif scenario == "besoin":
            recrutes = max(brut, retraites)
        else:
            recrutes = quota if supposes else 0
        lignes[-1]["recrutement"] = recrutes
        lignes[-1]["eleves"] = round(eleves, 1)
        effectif = max(0, effectif - retraites - attrition - directeurs + recrutes)
    return lignes


# --- Fiabilité ---------------------------------------------------------------------------------------------------

def ligne_fiabilite(territoire: str, ecoles: List[ProjectionEcole], enseignants: List[Enseignant]) -> dict:
    ids = {e.id for e in ecoles}
    rattaches = [t for t in enseignants if t.ecole_attache in ids]
    part = lambda n, total: 0.0 if total == 0 else round(n / total, 2)  # noqa: E731
    return {
        "territoire": territoire, "ecoles": len(ecoles), "enseignants": len(rattaches),
        "taux_date_naissance": part(sum(1 for t in rattaches if t.age is not None), len(rattaches)),
        "taux_sous_systeme": part(sum(1 for t in rattaches if code_sous_systeme(t.sous_systeme) != "non_renseigne"),
                                  len(rattaches)),
        "taux_effectifs_eleves": part(sum(1 for e in ecoles if e.eleves_connus), len(ecoles)),
    }


_RANG = {"bonne": 0, "partielle": 1, "faible": 2}


def _niveau(taux: float) -> str:
    return "bonne" if taux >= 0.9 else "partielle" if taux >= 0.6 else "faible"


def _pire(*niveaux: str) -> str:
    return max(niveaux, key=lambda n: _RANG[n])


def fiabilite_indicateurs(ligne: dict, par_sous_systeme: bool) -> List[dict]:
    """Fiabilité de chaque indicateur selon la disponibilité des données sources."""
    pct = lambda t: f"{round(t * 100)} %"  # noqa: E731
    sous_systeme = _niveau(ligne["taux_sous_systeme"]) if par_sous_systeme else "bonne"
    precision = f" Sous-système connu pour {pct(ligne['taux_sous_systeme'])} des enseignants." if par_sous_systeme else ""
    retraite = _niveau(ligne["taux_date_naissance"])
    besoin = _pire(_niveau(ligne["taux_effectifs_eleves"]), "partielle")
    vivier = "partielle"
    lignes = [
        ("effectif_debut", "bonne", "Enseignants des écoles, après les mouvements retenus et les recrutements supposés."),
        ("departs_retraite", retraite, f"Âge connu pour {pct(ligne['taux_date_naissance'])} des enseignants."),
        ("departs_attrition", "partielle", "Taux d'autres départs du modèle M1 du rapport DRH, à confirmer."),
        ("besoin", besoin, f"Effectifs d'élèves connus pour {pct(ligne['taux_effectifs_eleves'])} des écoles ; "
                           "inclut la croissance des élèves, l'attrition et les directeurs déchargés."),
        ("ressources_vivier", vivier, "Seules les sources retenues du vivier sont comptées."),
        ("quota_calcule", _pire(besoin, vivier), "Dépend du besoin, du rattrapage étalé, du plafond et du vivier."),
        ("quota_retenu", "bonne", "Décision administrative enregistrée (ajustement ou validation)."),
        ("nominations_prevues", "bonne", "Lu dans le suivi des nominations validées."),
        ("nominations_realisees", "bonne", "Lu dans le suivi des nominations mises en œuvre."),
        ("deploiements_prevus", "bonne", "Lu dans le registre des mouvements."),
        ("deploiements_realises", "bonne", "Lu dans le registre des mouvements."),
        ("besoin_restant", _pire(besoin, vivier), "Dépend du besoin, des ressources du vivier et du quota retenu."),
    ]
    return [{"indicateur": i, "niveau": _pire(n, sous_systeme), "detail": d + precision} for i, n, d in lignes]
