"""Projection sur cinq ans d'un ensemble d'écoles : effectifs, départs, besoin, vivier, quota calculé.

Règles (référence : moteur-reference/scripts/serveur/planification.ts, formules DRH de codeSource) :
  - situation de départ : l'effectif de chaque école (Enseignants_Actuels) après les mouvements du scénario retenu ;
  - retraites : un enseignant part l'année où il atteint l'âge légal, compté une seule fois (un matricule en double
    n'est compté qu'une fois), dans l'école qu'il occupe après le plan ; ceux qui l'ont déjà atteint au début de N+1
    sont imputés à N+1 si CORR_60, ignorés sinon. Un âge absent n'est jamais remplacé : l'agent n'est pas compté.
    Les âges sont ramenés au début de N+1 quand ils ont été mesurés une autre année (`retraite.annee_ages`) ;
  - croissance des élèves (G_PRI_PCT) : l'effectif d'élèves de chaque école croît chaque année, et la cible K de
    l'école (règle du référentiel MINEDUB) est recalculée sur cet effectif ;
  - besoin d'une école : max(0 ; K − effectif restant) ; attrition hors retraite τ × effectif ÷ 100 arrondie à l'entier
    le plus proche (comme le rapport DRH : 44 232 × 2,25 % = 995) et classes
    libérées par les directeurs déchargés (DIR_NOM_AN × DIR_H_PRI_PCT), au niveau du périmètre ;
  - deux grandeurs distinctes : le stock administratif S(t+1) = S(t) − retraites − autres départs + recrutements, et
    les enseignants disponibles pour tenir une classe U(t) = S(t) − H(t), H(t) étant les décharges cumulées des
    directeurs nommés depuis le début de l'horizon. Un directeur déchargé reste dans le stock : il n'est retranché
    qu'une fois, des disponibles, et jamais à nouveau comme un départ les années suivantes ;
  - enseignants nécessaires selon le REM de référence : C(t) = ⌈N(t) ÷ REM_REF_PRI⌉ (rapport MINEDUB), distinct de
    la somme des besoins pédagogiques calculés école par école (P, m, D, K) ;
  - quotas des années précédentes supposés recrutés (hypothèse par défaut) : ils s'ajoutent à l'effectif suivant
    et le besoin d'une année est son besoin nouveau ; sinon le besoin se cumule d'année en année ;
  - ressources du vivier (N+1) : excédents sûrs des écoles mesurés dans le même état que les besoins de N+1 (après
    les retraites de N+1) : un retraité d'une école excédentaire n'est pas compté à la fois comme départ et comme
    ressource ;
  - quota calculé (scénario « sous plafond » de codeSource) : besoin de l'année, déficit initial rattrapé sur
    ETAL_N ans, moins les ressources du vivier ; plafonné à PLAF_PRI rapporté à l'effectif du périmètre. Si
    PLANCHER_RET, le quota ne descend jamais sous les retraites de l'année (Q ≥ R), même au-delà du plafond :
    Q = max(min(brut ; plafond) ; R). Le quota calculé n'est qu'une proposition : il ne devient un recrutement que
    par hypothèse de projection (`quotas.annees_precedentes_realisees`), jamais un recrutement réalisé.
"""
from __future__ import annotations

import dataclasses
import math
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Tuple

from ..commun.encadrement import CHIFFRES_ENCADREMENT, ratio_encadrement
from ..commun.texte import norm, texte
from ..diagnostic.indicateurs import besoin_rem, calculer_indicateurs
from ..donnees.modeles import Ecole, Enseignant
from .parametres import ANNEES_PLAN, PART_DIRECTEURS_PRIMAIRE, STOCK_NATIONAL_PRIMAIRE
from .referentiel_drh import _cle as cle_region

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
    #: Retraites retirées du stock de l'école, année par année : jamais plus d'agents que le stock déclaré n'en compte.
    retraites: List[int] = field(default_factory=list)
    #: Retraites identifiées nominativement (fichier des enseignants) et part qui dépasse le stock déclaré restant :
    #: ces agents ne sont pas retirés d'un stock auquel ils n'appartiennent pas, l'écart est signalé.
    retraites_identifiees: List[int] = field(default_factory=list)
    retraites_non_imputables: List[int] = field(default_factory=list)
    effectifs: List[int] = field(default_factory=list)
    besoins: List[int] = field(default_factory=list)
    excedents: List[int] = field(default_factory=list)
    #: Excédent sûr de chaque année (après les retraites de l'année, élèves projetés).
    excedents_surs: List[int] = field(default_factory=list)
    #: Excédent initial mobilisable sans validation (hors part qui dépend d'un minimum pédagogique non observé).
    excedent_sur_initial: int = 0
    #: Minimum pédagogique fondé sur l'hypothèse de secours (Classes_Multigrades non renseigné ou illisible).
    minimum_provisoire: bool = False
    provenance_groupes: str = "secours"
    statut_besoin: str = "provisoire"
    bmax_incertain: bool = False
    #: Effectif déclaré à l'import (Enseignants_Actuels), avant les mouvements du scénario retenu.
    effectif_declare: int = 0
    #: Composantes du besoin à l'année de base (effectif d'élèves importé).
    pe_initial: int = 0
    me_initial: int = 0
    de_initial: int = 0
    #: Composantes du besoin pédagogique, année par année (élèves projetés) : P, m, D.
    pe: List[int] = field(default_factory=list)
    me: List[int] = field(default_factory=list)
    de: List[int] = field(default_factory=list)

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
    #: Âge légal déjà atteint au début de N+1 : départ imputé à N+1 par CORR_60.
    deja_eligible: bool = False


def decalage_ages(hyp: dict, annee_base: str = "") -> int:
    """Années à retrancher aux âges du fichier pour les ramener au début de N+1 (rentrée qui suit l'année de base).

    Le stock observé à la base est retenu comme début de N+1 (HYPOTHESE_TRANSITION) : les mouvements inconnus ne sont
    pas inventés, mais les agents ont vieilli d'un an entre la base et N+1. Des âges mesurés pendant l'année de base
    sont donc trop jeunes d'un an (décalage −1) ; mesurés en N+1, ils sont justes (0) ; mesurés deux ans après la base
    (âges calculés en 2026-2027 pour une base 2024-2025), ils ont un an de trop (+1). Sans `retraite.annee_ages`, les
    âges sont supposés mesurés au début de N+1 (0) : hypothèse signalée, retraites qualifiées de provisoires. Les âges
    importés ne sont jamais modifiés : le décalage n'intervient que dans le calcul des départs.
    """
    from ..donnees.annee_scolaire import _FORME
    ages = _FORME.match(str(hyp["retraite"].get("annee_ages") or "").strip())
    base = _FORME.match(str(annee_base or "").strip())
    if not ages or not base:
        return 0
    return int(ages.group(1)) - (int(base.group(1)) + 1)


def annee_depart(age: Optional[float], hyp: dict, decalage: int = 0) -> Optional[int]:
    """Indice de l'année de départ à la retraite (0 = N+1), `None` si l'agent ne part pas dans les cinq ans.

    L'âge est ramené au début de N+1 (`decalage`, voir `decalage_ages`). Apprécié en fin d'année civile, il gagne
    une année. Un âge absent n'est jamais remplacé : `None`.
    """
    if age is None:
        return None
    age = age - decalage
    r = hyp["retraite"]
    legal = r["age_legal"]
    if age >= legal:
        return 0 if hyp["drh"].get("CORR_60", True) else None
    fin_annee = 1 if r.get("date_reference") == "fin_annee_civile" else 0
    for k in range(len(ANNEES_PLAN)):
        if age + k + fin_annee >= legal:
            return k
    return None


def age_exploitable(t: Enseignant) -> Optional[float]:
    """Âge utilisable pour les retraites : jamais l'âge supposé d'un fichier sans colonne Age (`age_connu`)."""
    return t.age if getattr(t, "age_connu", True) else None


def matricules_uniques(enseignants: List[Enseignant]) -> Tuple[List[Enseignant], int]:
    """Enseignants dédoublonnés par matricule (le premier est gardé) et nombre de doublons écartés."""
    vus, out = set(), []
    for t in enseignants:
        if t.matricule not in vus:
            vus.add(t.matricule)
            out.append(t)
    return out, len(enseignants) - len(out)


def projeter_ecoles(ecoles: Iterable[Ecole], enseignants: Iterable[Enseignant], cfg: dict, hyp: dict, *,
                    affectations: Iterable[dict] = (), decalage: int = 0
                    ) -> Tuple[List[ProjectionEcole], List[DepartRetraite]]:
    """Projection de chaque école (hors structures administratives) et départs nominatifs à la retraite."""
    ecoles = [e for e in ecoles if not est_structure(e)]
    enseignants, _ = matricules_uniques(list(enseignants))
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
        k = annee_depart(age_exploitable(t), hyp, decalage)
        if k is None:
            continue
        id_ecole = position.get(t.matricule, t.ecole_attache)
        ecole = par_id.get(id_ecole)
        if ecole is None:
            continue
        retraites.setdefault(id_ecole, [0] * n)[k] += 1
        departs.append(DepartRetraite(
            annee=k, matricule=t.matricule, nom=f"{t.nom} {t.prenom}".strip() or t.matricule, id_ecole=id_ecole,
            nom_ecole=ecole.nom or ecole.id,
            age_au_depart=int(math.floor(max(t.age - decalage, 0) + k + (1 if hyp["retraite"].get("date_reference")
                                                                            == "fin_annee_civile" else 0))),
            lieu=lieu_de(ecole), deja_eligible=(age_exploitable(t) - decalage) >= hyp["retraite"]["age_legal"]))

    g = float(hyp["drh"].get("G_PRI_PCT", 0)) / 100.0
    resultat: List[ProjectionEcole] = []
    for e in ecoles:
        initial = max(0, arrondi(e.enseignants_actuels) + ecart.get(e.id, 0))
        depart = dataclasses.replace(e, enseignants_actuels=float(initial))
        ind0 = calculer_indicateurs(depart, cfg)
        p = ProjectionEcole(
            id=e.id, nom=e.nom or e.id, region=e.region, departement=e.departement, commune=e.commune,
            iaeb=e.iaeb, sous_systeme=code_sous_systeme(e.sous_systeme), eleves_connus=e.effectif_connu,
            effectif_initial=initial, arrivees=arrivees.get(e.id, 0), effectif_declare=arrondi(e.enseignants_actuels),
            deficit_initial=int(ind0.be), excedent_initial=int(ind0.xe), cible_initial=int(ind0.Ke),
            eleves_initial=e.effectif_eleves, excedent_sur_initial=int(ind0.xe_sur),
            minimum_provisoire=ind0.minimum_provisoire, provenance_groupes=ind0.Ge_provenance,
            statut_besoin=ind0.statut_besoin, bmax_incertain=ind0.bmax_incertain, pe_initial=ind0.Pe,
            me_initial=ind0.me, de_initial=ind0.De)
        par_annee = retraites.get(e.id, [0] * n)
        restant = initial
        for k in range(n):
            # Un agent n'est retiré que du stock auquel il peut appartenir : au-delà du stock déclaré restant, la
            # retraite identifiée est « non imputable » (sources discordantes), comptée à part et signalée.
            imputees = min(restant, par_annee[k])
            restant -= imputees
            eleves = e.effectif_eleves * (1.0 + g) ** (k + 1)
            ind = calculer_indicateurs(dataclasses.replace(e, effectif_eleves=eleves,
                                                           enseignants_actuels=float(restant)), cfg)
            p.eleves.append(eleves)
            p.cibles.append(int(ind.Ke))
            p.retraites.append(imputees)
            p.retraites_identifiees.append(par_annee[k])
            p.retraites_non_imputables.append(par_annee[k] - imputees)
            p.effectifs.append(restant)
            p.besoins.append(int(ind.be))
            p.excedents.append(int(ind.xe))
            p.excedents_surs.append(int(ind.xe_sur))
            p.pe.append(ind.Pe)
            p.me.append(ind.me)
            p.de.append(ind.De)
        resultat.append(p)
    return resultat, departs


def arrondi(x: float) -> int:
    """Arrondi à l'entier le plus proche, demi vers le haut (round() de Python arrondit au pair)."""
    return int(math.floor(x + 0.5 + 1e-9))


#: Statuts possibles pour l'origine du taux d'attrition effectivement appliqué à un périmètre (metadonnée M1,
#: exposée dans les lignes de `calculer_annees` sous la clé `origine_taux`).
ORIGINE_TAUX_NATIONALE = "hypothese_nationale"
ORIGINE_TAUX_REGIONALE = "hypothese_regionale"
ORIGINE_TAUX_SOUS_SYSTEME = "hypothese_sous_systeme"


def origine_taux(hyp: dict) -> str:
    """Origine du taux d'attrition selon la méthode retenue (jamais « observé » : toujours une hypothèse)."""
    return {"taux_unique": ORIGINE_TAUX_NATIONALE, "par_region": ORIGINE_TAUX_REGIONALE,
            "par_sous_systeme": ORIGINE_TAUX_SOUS_SYSTEME}.get(
        hyp["attrition"].get("methode", "taux_unique"), ORIGINE_TAUX_NATIONALE)


def taux_attrition_pondere(poids: List[Tuple[str, str, float]], hyp: dict) -> float:
    """Taux annuel d'autres départs, pondéré par l'effectif selon la méthode retenue — seule formule de
    pondération, pour un périmètre de planification (`taux_attrition`) comme pour tout autre regroupement
    (synthèse territoriale par sous-système).

    `poids` : un triplet (région, sous-système, effectif) par école. Pour la méthode « par région », la
    correspondance tolère la casse, les accents et les tirets (comme le référentiel DRH, `referentiel_drh.
    region_drh`) : une région absente du périmètre à l'identique (espace au lieu d'un tiret, accent manquant)
    est quand même reconnue, et seules les régions réellement absentes du barème retombent sur le taux unique.
    """
    a = hyp["attrition"]
    unique = float(a.get("taux_unique", 0))
    methode = a.get("methode", "taux_unique")
    if methode == "taux_unique" or not poids:
        return unique
    if methode == "par_region":
        par = {cle_region(k): float(v) for k, v in (a.get("par_region") or {}).items()}
        cle = lambda p: cle_region(p[0])  # noqa: E731
    else:
        par = {k: float(v) for k, v in (a.get("par_sous_systeme") or {}).items()}
        cle = lambda p: p[1]  # noqa: E731
    total = sum(effectif for _, _, effectif in poids)
    if total == 0:
        return unique
    return sum(p[2] * par.get(cle(p), unique) for p in poids) / total


def taux_attrition(ecoles: List[ProjectionEcole], hyp: dict) -> float:
    """Taux annuel d'autres départs du périmètre, pondéré par l'effectif initial selon la méthode retenue."""
    return taux_attrition_pondere([(e.region, e.sous_systeme, e.effectif_initial) for e in ecoles], hyp)


def raison_encadrement_indisponible(nb_inconnues: int) -> str:
    """Pourquoi le taux d'encadrement projeté n'est pas calculable : des écoles à effectif d'élèves inconnu."""
    return (f"Le taux d'encadrement ne peut pas être calculé pour l'ensemble des écoles, car {nb_inconnues} école(s) "
            "ont un effectif d'élèves inconnu. Les départs et les recrutements projetés concernent tout le périmètre : "
            "ils ne peuvent pas être attribués aux seules écoles à effectif connu sans répartir artificiellement les "
            "recrutements entre écoles.")


#: Scénarios de recrutement du rapport DRH : la règle fixe les recrues qui s'ajoutent au stock de l'année suivante.
SCENARIOS = ("min", "maintien", "besoin", "plafond")


def calculer_annees(ecoles: List[ProjectionEcole], hyp: dict, *, ressources_supplementaires: int = 0,
                    scenario: str = "plafond") -> List[dict]:
    """Les indicateurs du mémo, année par année, pour un ensemble d'écoles (avant report des décisions).

    `scenario` fixe les recrues ajoutées au stock suivant : « plafond » (quota calculé, si les quotas précédents
    sont supposés recrutés), « min » (retraites), « maintien » (tous les départs et les décharges de l'année) ou
    « besoin » (quota avant plafond, jamais sous les retraites). Chaque scénario a son propre stock.
    """
    drh = hyp["drh"]
    horizon = min(int(hyp.get("horizon", 5)), len(ANNEES_PLAN))
    somme = lambda f: sum(f(e) for e in ecoles)  # noqa: E731
    taux = taux_attrition(ecoles, hyp)
    initial = somme(lambda e: e.effectif_initial)
    part = initial / STOCK_NATIONAL_PRIMAIRE
    directeurs = arrondi(drh["DIR_NOM_AN"] * PART_DIRECTEURS_PRIMAIRE * drh["DIR_H_PRI_PCT"] / 100.0 * part)
    plafond = arrondi(drh["PLAF_PRI"] * part) if drh["PLAF_PRI"] > 0 else None
    deficit = somme(lambda e: e.deficit_initial)
    supposes = bool(hyp["quotas"].get("annees_precedentes_realisees", True))
    etalement = max(1, int(drh["ETAL_N"]))
    rem_ref = float(drh.get("REM_REF_PRI", 74.4))

    # Population commune du taux d'encadrement (décision « Encadrement ») : élèves ET enseignants des seules écoles à
    # effectif d'élèves connu. Le stock de début de l'année 1 est connu école par école : il se restreint sans rien
    # répartir. Après, l'attrition, les directeurs et les recrutements ne sont projetés que pour le périmètre entier :
    # sans école à effectif inconnu le périmètre EST la population commune ; sinon le taux n'est pas calculable.
    nb_inconnues = sum(1 for e in ecoles if not e.eleves_connus)
    nb_provisoires = sum(1 for e in ecoles if e.minimum_provisoire)
    initial_connus = somme(lambda e: e.effectif_initial if e.eleves_connus else 0)
    effectif = initial                      # S(t) : stock administratif en début d'année
    decharges = 0                           # H(t − 1) : décharges cumulées avant l'année
    attrition_cumulee = 0
    besoin_precedent = rattrapage_precedent = 0
    origine = origine_taux(hyp)
    lignes = []
    for k in range(horizon):
        retraites = somme(lambda e: e.retraites[k])
        non_imputables = somme(lambda e: e.retraites_non_imputables[k] if e.retraites_non_imputables else 0)
        attrition = arrondi(taux * effectif / 100.0)
        attrition_cumulee += attrition
        decharges_fin = decharges + directeurs
        besoin_cumule = somme(lambda e: e.besoins[k]) + attrition_cumulee + decharges_fin
        besoin = max(0, besoin_cumule - besoin_precedent) if supposes else besoin_cumule
        besoin_precedent = besoin_cumule
        # Même état que les besoins de N+1 (après ses retraites) : un retraité n'est pas aussi une ressource.
        vivier = (somme(lambda e: e.excedents_surs[0] if e.excedents_surs else e.excedent_sur_initial)
                  + ressources_supplementaires) if k == 0 else 0
        part_cumulee = arrondi(deficit * min(k + 1, etalement) / etalement)
        if supposes:
            rattrapage, inclus = part_cumulee - rattrapage_precedent, (deficit if k == 0 else 0)
        else:
            rattrapage, inclus = part_cumulee, deficit
        rattrapage_precedent = part_cumulee
        brut = max(0, besoin - inclus + rattrapage - vivier)
        sous_plafond = brut if plafond is None else min(brut, plafond)
        # PLANCHER_RET : le quota remplace au moins les retraites de l'année, même au-delà du plafond (Q ≥ R).
        quota = max(sous_plafond, retraites) if drh["PLANCHER_RET"] else sous_plafond
        eleves = somme(lambda e: e.eleves[k] if e.eleves_connus else 0.0)
        disponibles = max(0, effectif - decharges)          # U(t) au début de l'année
        if nb_inconnues == 0:
            rem_den, rem_raison = disponibles, None
        elif k == 0:
            rem_den, rem_raison = initial_connus, None
        else:
            rem_den, rem_raison = None, raison_encadrement_indisponible(nb_inconnues)
        rem_brut = None if rem_den is None else ratio_encadrement(eleves, rem_den)
        lignes.append({
            "annee": ANNEES_PLAN[k], "effectif_debut": effectif, "departs_retraite": retraites,
            "departs_attrition": attrition, "retraites_non_imputables": non_imputables,
            "retraites_identifiees": retraites + non_imputables, "besoin": besoin, "ressources_vivier": vivier, "quota_calcule": quota,
            "quota_retenu": None, "nominations_prevues": 0, "nominations_realisees": 0,
            "deploiements_prevus": somme(lambda e: e.arrivees) if k == 0 else 0, "deploiements_realises": 0,
            "besoin_restant": quota,
            # Détail DRH (hors contrat) : taux appliqué, classes libérées, rattrapage, plafond, REM projeté.
            "taux_attrition": round(taux, 4), "origine_taux": origine, "directeurs_decharges": directeurs,
            "decharges_avant": decharges, "decharges_cumulees": decharges_fin, "disponibles_debut": disponibles,
            "rattrapage": rattrapage, "plafond": plafond, "quota_avant_plafond": brut,
            "plancher_retraites": retraites if drh["PLANCHER_RET"] else None,
            "plancher_applique": bool(drh["PLANCHER_RET"]) and quota > sous_plafond,
            # Dépassement du plafond dû au plancher (0 sans plafond ou sans dépassement), et quota de l'autre règle
            # possible, présenté pour la décision D1 : le plafond prime sur le remplacement des retraites.
            "depassement_plafond": 0 if plafond is None else max(0, quota - plafond),
            "quota_plafond_prioritaire": (max(brut, retraites) if plafond is None
                                          else min(max(brut, retraites), plafond)),
            # Taux d'encadrement projeté (population commune, voir plus haut) : arrondi à la restitution seulement ;
            # `rem_brut` et `eleves_brut` gardent la précision pour la suite des calculs. `None` + raison quand il
            # n'est pas calculable sur la population commune.
            "rem": None if rem_brut is None else round(rem_brut, CHIFFRES_ENCADREMENT), "rem_brut": rem_brut,
            "rem_denominateur": rem_den, "rem_raison": rem_raison, "population_complete": nb_inconnues == 0, "eleves_brut": eleves,
            # Besoins pédagogiques école par école (élèves projetés) et besoin selon le REM de référence.
            "besoin_rem": besoin_rem(eleves, rem_ref), "somme_pe": somme(lambda e: e.pe[k]),
            "somme_me": somme(lambda e: e.me[k]), "somme_de": somme(lambda e: e.de[k]),
            "somme_ke": somme(lambda e: e.cibles[k]), "besoin_non_couvert": somme(lambda e: e.besoins[k]),
            "ecoles": len(ecoles), "ecoles_eleves_inconnus": nb_inconnues, "ecoles_minimum_provisoire": nb_provisoires,
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
        effectif = max(0, effectif - retraites - attrition + recrutes)
        decharges = decharges_fin
        lignes[-1]["effectif_fin"] = effectif
        lignes[-1]["disponibles_fin"] = max(0, effectif - decharges)
    return lignes


# --- Fiabilité ---------------------------------------------------------------------------------------------------

def ligne_fiabilite(territoire: str, ecoles: List[ProjectionEcole], enseignants: List[Enseignant],
                    nominatif_disponible: bool = True) -> dict:
    """Taux de complétude des sources. Sans fichier nominatif, les taux d'enseignants sont inconnus (None), pas 0 %."""
    ids = {e.id for e in ecoles}
    if not nominatif_disponible:
        return {"territoire": territoire, "ecoles": len(ecoles), "enseignants": None, "taux_date_naissance": None,
                "taux_sous_systeme": None,
                "taux_effectifs_eleves": 0.0 if not ecoles else round(sum(1 for e in ecoles if e.eleves_connus)
                                                                      / len(ecoles), 2)}
    rattaches = [t for t in enseignants if t.ecole_attache in ids]
    part = lambda n, total: 0.0 if total == 0 else round(n / total, 2)  # noqa: E731
    return {
        "territoire": territoire, "ecoles": len(ecoles), "enseignants": len(rattaches),
        "taux_date_naissance": part(sum(1 for t in rattaches if age_exploitable(t) is not None), len(rattaches)),
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
    sans_nominatif = ligne["taux_date_naissance"] is None
    sous_systeme = ("faible" if sans_nominatif else _niveau(ligne["taux_sous_systeme"])) if par_sous_systeme else "bonne"
    precision = (f" Sous-système connu pour {pct(ligne['taux_sous_systeme'])} des enseignants."
                 if par_sous_systeme and not sans_nominatif else "")
    retraite = "faible" if sans_nominatif else _niveau(ligne["taux_date_naissance"])
    detail_retraite = ("Fichier nominatif des enseignants indisponible : retraites non calculables." if sans_nominatif
                       else f"Âge connu pour {pct(ligne['taux_date_naissance'])} des enseignants.")
    besoin = _pire(_niveau(ligne["taux_effectifs_eleves"]), "partielle")
    vivier = "faible" if sans_nominatif else "partielle"
    detail_vivier = ("Estimation d'après les excédents du stock déclaré (Enseignants_Actuels) des écoles : aucune liste "
                     "nominative d'enseignants mobilisables n'existe sans fichier nominatif."
                     if sans_nominatif else "Seules les sources retenues du vivier sont comptées.")
    lignes = [
        ("effectif_debut", "bonne", "Enseignants des écoles, après les mouvements retenus et les recrutements supposés."),
        ("departs_retraite", retraite, detail_retraite),
        ("departs_attrition", "partielle", "Taux d'autres départs des hypothèses de planification (par défaut celui du modèle M1 du rapport DRH), à confirmer."),
        ("besoin", besoin, f"Effectifs d'élèves connus pour {pct(ligne['taux_effectifs_eleves'])} des écoles ; "
                           "inclut la croissance des élèves, l'attrition et les directeurs déchargés."),
        ("ressources_vivier", vivier, detail_vivier),
        ("quota_calcule", _pire(besoin, vivier), "Dépend du besoin, du rattrapage étalé, du plafond et du vivier."),
        ("quota_retenu", "bonne", "Décision administrative enregistrée (ajustement ou validation)."),
        ("nominations_prevues", "bonne", "Lu dans le suivi des nominations validées."),
        ("nominations_realisees", "bonne", "Lu dans le suivi des nominations mises en œuvre."),
        ("deploiements_prevus", "bonne", "Lu dans le registre des mouvements."),
        ("deploiements_realises", "bonne", "Lu dans le registre des mouvements."),
        ("besoin_restant", _pire(besoin, vivier), "Dépend du besoin, des ressources du vivier et du quota retenu."),
    ]
    return [{"indicateur": i, "niveau": _pire(n, sous_systeme), "detail": d + precision} for i, n, d in lignes]
