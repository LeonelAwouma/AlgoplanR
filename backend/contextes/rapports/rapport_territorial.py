"""Synthèses territoriales du lot 4 (sous-lot 4.6) : une seule source backend pour le taux d'encadrement, la
couverture des besoins (E10, deux indicateurs), la couverture PAREC, l'attrition (M1) et le degré d'aléa, à
chaque niveau de la navigation Cameroun → Région → Département → Arrondissement → École.

« Arrondissement » est l'alias retenu (lot 4) du niveau `commune` du jeu ; l'IAEB reste un niveau distinct,
jamais confondu avec lui (voir `contextes.planification.services.groupes`).

Le périmètre d'entrée est celui de la planification (`dict` région/département/commune/iaeb/sous_système), qui
couvre déjà tous les niveaux dont ce module a besoin ; `region_imposee` (délégué régional) y est déjà appliqué
par `contextes.planification.views.perimetre`.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from contextes.diagnostic import services as diag
from contextes.planification import services as pl
from domaine.commun.encadrement import taux_encadrement
from domaine.donnees.modeles import Ecole
from domaine.planification.parametres import ANNEES_PLAN, REFERENTIEL_ATTRITION_M1
from domaine.planification.projection import ProjectionEcole, lieu_de
from domaine.planification.rapport import alea_et_raison, ecoles_a_l_import
from domaine.planification.suivi import dans
from domaine.rapport.territorial import (
    LigneEcoleCouverture,
    LigneEcoleParec,
    REGISTRE_INDICATEURS,
    SANS_OBJET,
    alea_qualifie,
    couverture_globale,
    couverture_operationnelle,
    couverture_parec,
)

NIVEAUX = ("national", "region", "departement", "commune", "ecole")
LIBELLE_NIVEAU = {"national": "Cameroun", "region": "Région", "departement": "Département",
                  "commune": "Arrondissement", "ecole": "École", "iaeb": "IAEB"}
SITUATIONS_ENCADREMENT = ("import", "apres_prince", "apres_simulation", *[f"n{k + 1}" for k in range(5)])
SITUATIONS_ALEA = ("import", "apres_prince", "apres_simulation")
SITUATIONS_ANNEES = tuple(f"n{k + 1}" for k in range(5))

LIBELLE_SITUATION = {"import": "Import", "apres_prince": "Après Prince", "apres_simulation": "Après simulation",
                     **{f"n{k + 1}": ANNEES_PLAN[k] for k in range(5)}}
ORIGINE_COURTE = {"hypothese_nationale": "national", "hypothese_regionale": "régional",
                  "hypothese_sous_systeme": "sous-système"}


def _valeur(numerateur: Optional[float], denominateur: Optional[float]) -> dict:
    """Même forme que les indicateurs de couverture (domaine.rapport.territorial), pour le taux d'encadrement."""
    if denominateur is None or denominateur <= 0:
        return {"numerateur": 0, "denominateur": 0, "taux": None, "statut": SANS_OBJET,
                "raison": "Aucun enseignant sur ce périmètre"}
    taux = taux_encadrement(numerateur or 0, denominateur, 1)
    return {"numerateur": round(numerateur or 0, 2), "denominateur": round(denominateur, 2), "taux": taux,
            "statut": "normal" if taux is not None else SANS_OBJET, "raison": None}


def _ecart(situations: Dict[str, dict], depart: str = "import", arrivee: str = "n5") -> Optional[float]:
    a, b = situations.get(depart), situations.get(arrivee)
    if not a or not b or a.get("taux") is None or b.get("taux") is None:
        return None
    return round(b["taux"] - a["taux"], 1)


class _Donnees:
    """Les trois instantanés d'un jeu (import, après Prince, après simulation + N+1..N+5), chargés une seule
    fois par requête et filtrables par périmètre."""

    def __init__(self, jeu, scenario_id: Optional[str]):
        self.prep = diag.preparer(jeu)
        self.avant = self.prep.avant()
        self.ctx = pl.contexte(jeu, scenario_id)

    def ecoles_import(self, p: dict) -> List[Ecole]:
        return [e for e in self.avant.ecoles if dans(lieu_de(e), p)]

    def ecoles_apres_prince(self, p: dict) -> List[Ecole]:
        return [e for e in self.prep.ecoles if dans(lieu_de(e), p)]

    def ecoles_apres_simulation(self, p: dict) -> List[ProjectionEcole]:
        return pl.ecoles_de(self.ctx, p)


def _lignes_couverture(d: _Donnees, p: dict) -> List[LigneEcoleCouverture]:
    imp = {e.id: e for e in d.ecoles_import(p)}
    prince = {e.id: e for e in d.ecoles_apres_prince(p)}
    sim = d.ecoles_apres_simulation(p)
    out = []
    for e in sim:
        i, pr = imp.get(e.id), prince.get(e.id)
        if i is None or pr is None:
            continue    # structure administrative ou école absente d'une des trois bases : exclue (jamais inventée)
        out.append(LigneEcoleCouverture(id=e.id, besoin_initial=int(i.ind.be), effectif_initial=i.enseignants_actuels,
                                        besoin_apres_prince=int(pr.ind.be), effectif_apres_prince=pr.enseignants_actuels,
                                        effectif_apres_simulation=e.effectif_initial))
    return out


def _lignes_couverture_a_l_annee(lignes: List[LigneEcoleCouverture], sim: List[ProjectionEcole], k: int
                                  ) -> List[LigneEcoleCouverture]:
    """Mêmes écoles, mais comparées à leur effectif projeté N+(k+1) plutôt qu'à l'effectif après simulation."""
    effectifs_n = {e.id: e.effectifs[k] for e in sim if len(e.effectifs) > k}
    return [LigneEcoleCouverture(id=b.id, besoin_initial=b.besoin_initial, effectif_initial=b.effectif_initial,
                                 besoin_apres_prince=b.besoin_apres_prince,
                                 effectif_apres_prince=b.effectif_apres_prince,
                                 effectif_apres_simulation=effectifs_n[b.id])
            for b in lignes if b.id in effectifs_n]


def _indicateur_couverture_globale(d: _Donnees, p: dict, lignes_sim: List[LigneEcoleCouverture],
                                   sim: List[ProjectionEcole]) -> Dict[str, dict]:
    out = {
        "import": couverture_globale(LigneEcoleCouverture(id=l.id, besoin_initial=l.besoin_initial,
                                                           effectif_initial=l.effectif_initial,
                                                           besoin_apres_prince=l.besoin_apres_prince,
                                                           effectif_apres_prince=l.effectif_apres_prince,
                                                           effectif_apres_simulation=l.effectif_initial)
                                     for l in lignes_sim),
        "apres_prince": couverture_globale(LigneEcoleCouverture(id=l.id, besoin_initial=l.besoin_initial,
                                                                 effectif_initial=l.effectif_initial,
                                                                 besoin_apres_prince=l.besoin_apres_prince,
                                                                 effectif_apres_prince=l.effectif_apres_prince,
                                                                 effectif_apres_simulation=l.effectif_apres_prince)
                                           for l in lignes_sim),
        "apres_simulation": couverture_globale(lignes_sim),
    }
    for k in range(5):
        out[f"n{k + 1}"] = couverture_globale(_lignes_couverture_a_l_annee(lignes_sim, sim, k))
    out["ecart_n5_import"] = _ecart(out)
    return out


def _lignes_parec(ecoles: List[Any], *, depuis_projection: bool = False, annee: Optional[int] = None
                  ) -> List[LigneEcoleParec]:
    if depuis_projection:
        if annee is None:
            return [LigneEcoleParec(id=e.id, eleves=e.eleves_initial, enseignants=e.effectif_initial) for e in ecoles]
        return [LigneEcoleParec(id=e.id, eleves=e.eleves[annee], enseignants=e.effectifs[annee])
                for e in ecoles if len(e.effectifs) > annee]
    return [LigneEcoleParec(id=e.id, eleves=e.effectif_eleves, enseignants=e.enseignants_actuels) for e in ecoles]


def _indicateur_parec(d: _Donnees, p: dict, sim: List[ProjectionEcole]) -> Dict[str, dict]:
    out = {
        "import": couverture_parec(_lignes_parec(d.ecoles_import(p))),
        "apres_prince": couverture_parec(_lignes_parec(d.ecoles_apres_prince(p))),
        "apres_simulation": couverture_parec(_lignes_parec(sim, depuis_projection=True)),
    }
    for k in range(5):
        out[f"n{k + 1}"] = couverture_parec(_lignes_parec(sim, depuis_projection=True, annee=k))
    out["ecart_n5_import"] = _ecart(out)
    return out


def _indicateur_encadrement(d: _Donnees, p: dict, sim: List[ProjectionEcole]) -> Dict[str, dict]:
    imp_proj = ecoles_a_l_import(d.ecoles_import(p))
    prince_proj = ecoles_a_l_import(d.ecoles_apres_prince(p))   # même constructeur : « Ecole -> ProjectionEcole »
    out = {
        "import": _valeur(sum(e.eleves_initial for e in imp_proj if e.eleves_connus),
                          sum(e.effectif_initial for e in imp_proj if e.eleves_connus)),
        "apres_prince": _valeur(sum(e.eleves_initial for e in prince_proj if e.eleves_connus),
                                sum(e.effectif_initial for e in prince_proj if e.eleves_connus)),
        "apres_simulation": _valeur(sum(e.eleves_initial for e in sim if e.eleves_connus),
                                    sum(e.effectif_initial for e in sim if e.eleves_connus)),
    }
    annees = pl.annees(d.ctx, p, sim)       # suivi=True : trajectoire réellement ajustée (quotas retenus, E3)
    for k, ligne in enumerate(annees[:5]):
        eff = ligne.get("effectif_debut") or 0
        eleves = ligne.get("eleves")
        out[f"n{k + 1}"] = (_valeur(eleves, eff) if eleves is not None
                            else {"numerateur": 0, "denominateur": 0, "taux": None, "statut": SANS_OBJET,
                                  "raison": "Élèves non projetés pour cette année"})
    out["ecart_n5_import"] = _ecart(out)
    return out


def _indicateur_alea(d: _Donnees, p: dict, sim: List[ProjectionEcole]) -> Dict[str, dict]:
    def ligne(ecoles_proj: List[ProjectionEcole]) -> dict:
        valeur, raison = alea_et_raison(ecoles_proj)
        renseignees = sum(1 for e in ecoles_proj if e.eleves_connus)
        return alea_qualifie(valeur, raison, renseignees)

    return {
        "import": ligne(ecoles_a_l_import(d.ecoles_import(p))),
        "apres_prince": ligne(ecoles_a_l_import(d.ecoles_apres_prince(p))),
        "apres_simulation": ligne(sim),
    }


def _indicateur_attrition(d: _Donnees, p: dict, sim: List[ProjectionEcole], *, niveau: str) -> Dict[str, Any]:
    annees = pl.annees(d.ctx, p, sim)       # suivi=True : trajectoire réellement ajustée (quotas retenus, E3)
    lignes = {}
    for k, ligne in enumerate(annees[:5]):
        lignes[f"n{k + 1}"] = {
            "taux_pct": ligne.get("taux_attrition"), "origine": ligne.get("origine_taux"),
            "departs_attrition": ligne.get("departs_attrition"), "departs_retraite": ligne.get("departs_retraite"),
            "directeurs_decharges": ligne.get("directeurs_decharges"),
        }
    out: Dict[str, Any] = {"annees": lignes}
    if niveau in ("national", "region"):
        out["reference_m1"] = REFERENTIEL_ATTRITION_M1
    else:
        out["reference_m1"] = None
        out["note"] = ("Non mesuré à ce niveau — hypothèse régionale héritée : le taux appliqué est celui de la "
                       "région (ou le taux unique national à défaut), jamais un taux observé à ce niveau.")
    return out


def _indicateurs_territoire(d: _Donnees, p: dict, *, niveau: str) -> dict:
    sim = d.ecoles_apres_simulation(p)
    lignes_sim = _lignes_couverture(d, p)
    return {
        "nb_ecoles": len(sim),
        "encadrement": _indicateur_encadrement(d, p, sim),
        "couverture_globale": _indicateur_couverture_globale(d, p, lignes_sim, sim),
        "couverture_operationnelle": {"apres_simulation": couverture_operationnelle(lignes_sim)},
        "couverture_parec": _indicateur_parec(d, p, sim),
        "alea": _indicateur_alea(d, p, sim),
        "attrition": _indicateur_attrition(d, p, sim, niveau=niveau),
    }


def construire(jeu, p: dict, *, scenario_id: Optional[str] = None, niveau_demande: str = "") -> dict:
    """Synthèse territoriale complète pour le périmètre `p` (dict de planification) : indicateurs du nœud
    courant et, pour chaque enfant immédiat, les mêmes indicateurs — jamais une moyenne, toujours recalculés sur
    les écoles propres à chaque territoire."""
    d = _Donnees(jeu, scenario_id)
    niveau = pl.niveau_de(p)
    niveau_enfant = pl.niveau_enfants(p, niveau_demande)
    noeud = _indicateurs_territoire(d, p, niveau=niveau)
    enfants = []
    for territoire, restriction, liste in pl.groupes(pl.ecoles_de(d.ctx, p), niveau_enfant):
        pe = {**p, **restriction}
        enfants.append({"territoire": territoire, "libelle_niveau": LIBELLE_NIVEAU.get(niveau_enfant, niveau_enfant),
                        **_indicateurs_territoire(d, pe, niveau=niveau_enfant)})
    return {
        "niveau": niveau, "libelle_niveau": LIBELLE_NIVEAU.get(niveau, niveau), "perimetre": p,
        "titre": pl.libelle(p), "scenario_id": str(d.ctx.scenario.pk),
        "noeud": noeud, "niveau_enfants": niveau_enfant, "enfants": enfants,
        "registre_indicateurs": REGISTRE_INDICATEURS,
    }


# --- Mise en tableaux pour les exports (xlsx / docx) -----------------------------------------------------------

def _cellule(v: dict) -> Any:
    """Valeur d'une cellule de tableau d'export pour un indicateur de couverture/encadrement : le taux (nombre),
    ou un texte explicite (« Non calculable », « Sans objet ») quand il n'est pas calculable — jamais inventé."""
    if v.get("statut") == "sans_objet":
        return "Sans objet"
    if v.get("taux") is None:
        return "—"
    return v["taux"]


def _cellule_alea(v: dict) -> Any:
    if v["valeur"] is None:
        return "Non calculable"
    suffixe = " (indicatif)" if v["statut"] == "indicatif" else ""
    return f"{v['valeur']}{suffixe}"


def _cellule_attrition(annee: dict) -> str:
    taux = annee.get("taux_pct")
    if taux is None:
        return "—"
    origine = ORIGINE_COURTE.get(annee.get("origine"), "")
    return f"{taux:g} % ({origine})" if origine and origine != "national" else f"{taux:g} %"


def _ligne_territoire(nom: str, bloc: dict, code: str, situations: tuple) -> dict:
    if code == "alea":
        return {"territoire": nom, "valeurs": [_cellule_alea(bloc["alea"][s]) for s in situations]}
    if code == "attrition":
        return {"territoire": nom, "valeurs": [_cellule_attrition(bloc["attrition"]["annees"][s]) for s in situations]}
    return {"territoire": nom, "valeurs": [_cellule(bloc[code][s]) for s in situations]}


def tableaux_pour_export(rapport: dict, *, indicateur: Optional[str] = None) -> List[dict]:
    """Un tableau par indicateur (ou un seul si `indicateur` est précisé) : le nœud courant en première ligne,
    puis chacun de ses enfants — jamais une ligne recalculée autrement que par les mêmes fonctions que le JSON."""
    registre = REGISTRE_INDICATEURS
    if indicateur:
        registre = [x for x in registre if x["code"] == indicateur]
    tableaux = []
    for definition in registre:
        code = definition["code"]
        if code == "couverture_operationnelle":
            situations = ("apres_simulation",)
        elif code == "alea":
            situations = SITUATIONS_ALEA
        elif code == "attrition":
            situations = SITUATIONS_ANNEES
        else:
            situations = SITUATIONS_ENCADREMENT
        lignes = [_ligne_territoire(rapport["titre"], rapport["noeud"], code, situations)]
        for enfant in rapport["enfants"]:
            lignes.append(_ligne_territoire(enfant["territoire"]["nom"], enfant, code, situations))
        tableaux.append({
            "code": code, "intitule": definition["intitule"], "formule": definition["formule"],
            "population": definition["population"], "source": definition["source"], "limites": definition["limites"],
            "colonnes": [LIBELLE_SITUATION[s] for s in situations], "lignes": lignes,
        })
    return tableaux


def construire_national_complet(jeu, *, scenario_id: Optional[str] = None,
                                indicateur: Optional[str] = None) -> dict:
    """Une synthèse nationale, puis une section par région, ventilée jusqu'aux arrondissements (décision validée
    pour l'export national complet, réservé au DRH) : chaque région liste ses départements, et chaque
    département sa propre section listant ses arrondissements. Les écoles restent dans le classeur Excel du
    même export, et dans le Word propre à chaque arrondissement — ce document resterait sinon illisible
    (environ 360 arrondissements)."""
    national = construire(jeu, {}, scenario_id=scenario_id)
    regions = []
    for enfant_region in national["enfants"]:
        p_region = {"region": enfant_region["territoire"]["region"]}
        rapport_region = construire(jeu, p_region, scenario_id=scenario_id)
        departements = []
        for enfant_dept in rapport_region["enfants"]:
            p_dept = {**p_region, "departement": enfant_dept["territoire"]["departement"]}
            rapport_dept = construire(jeu, p_dept, scenario_id=scenario_id)
            departements.append({"titre": rapport_dept["titre"], "niveau": "departement",
                                 "tableaux": tableaux_pour_export(rapport_dept, indicateur=indicateur)})
        regions.append({"titre": rapport_region["titre"], "niveau": "region",
                        "tableaux": tableaux_pour_export(rapport_region, indicateur=indicateur),
                        "departements": departements})
    return {
        "national": {"titre": national["titre"], "niveau": "national",
                    "tableaux": tableaux_pour_export(national, indicateur=indicateur)},
        "regions": regions, "registre_indicateurs": REGISTRE_INDICATEURS,
    }
