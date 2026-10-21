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
from domaine.commun.encadrement import encadrement_population, taux_encadrement
from domaine.donnees.modeles import Ecole
from domaine.planification.parametres import ANNEES_PLAN, REFERENTIEL_ATTRITION_M1
from domaine.planification.projection import ProjectionEcole, lieu_de
from domaine.planification.rapport import alea_et_raison, ecoles_a_l_import
from domaine.planification.suivi import dans
from domaine.rapport.territorial import (
    LigneEcoleCouverture,
    LigneEcoleParec,
    REGISTRE_INDICATEURS,
    NON_DISPONIBLE,
    SANS_OBJET,
    SEUIL_ELEVES_PAREC,
    SEUIL_ENSEIGNANTS_PAREC,
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
    taux = taux_encadrement(numerateur or 0, denominateur)
    return {"numerateur": round(numerateur or 0, 2), "denominateur": round(denominateur, 2), "taux": taux,
            "statut": "normal" if taux is not None else SANS_OBJET, "raison": None}


def _non_disponible(raison: str) -> dict:
    """Valeur qui ne peut pas être calculée de façon fiable (population commune impossible) : jamais inventée."""
    return {"numerateur": 0, "denominateur": 0, "taux": None, "statut": NON_DISPONIBLE,
            "raison": raison}


def _non_arrondi(v: Optional[dict], facteur: float) -> Optional[float]:
    """Valeur d'une situation sans l'arrondi de restitution : numérateur ÷ dénominateur (× `facteur`)."""
    if not v or v.get("taux") is None or not v.get("denominateur"):
        return None
    return v["numerateur"] / v["denominateur"] * facteur


def _ecart(situations: Dict[str, dict], depart: str = "import", arrivee: str = "n5", facteur: float = 1.0
           ) -> Optional[float]:
    """Écart arrivée − départ, calculé sur les valeurs non arrondies : l'arrondi n'intervient qu'ici, à la
    restitution (`facteur` = 100 pour un pourcentage, 1 pour un taux d'encadrement)."""
    va, vb = _non_arrondi(situations.get(depart), facteur), _non_arrondi(situations.get(arrivee), facteur)
    return None if va is None or vb is None else round(vb - va, 1)


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
    out["ecart_n5_import"] = _ecart(out, facteur=100.0)
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
    out["ecart_n5_import"] = _ecart(out, facteur=100.0)
    return out


def _indicateur_encadrement(d: _Donnees, p: dict, sim: List[ProjectionEcole], annees: List[dict]) -> Dict[str, dict]:
    imp_proj = ecoles_a_l_import(d.ecoles_import(p))
    prince_proj = ecoles_a_l_import(d.ecoles_apres_prince(p))   # même constructeur : « Ecole -> ProjectionEcole »
    def situation(ecoles: List[ProjectionEcole]) -> dict:
        enc = encadrement_population((e.eleves_connus, e.eleves_initial, e.effectif_initial) for e in ecoles)
        return _valeur(enc.eleves, enc.enseignants)

    out = {"import": situation(imp_proj), "apres_prince": situation(prince_proj), "apres_simulation": situation(sim)}
    for k, ligne in enumerate(annees[:5]):
        eleves = ligne.get("eleves_brut", ligne.get("eleves"))
        if ligne.get("rem_raison"):
            out[f"n{k + 1}"] = _non_disponible(ligne["rem_raison"])
        elif eleves is None:
            out[f"n{k + 1}"] = {"numerateur": 0, "denominateur": 0, "taux": None, "statut": SANS_OBJET,
                                "raison": "Élèves non projetés pour cette année"}
        else:
            # Dénominateur de la population commune (début d'année ; année 1 restreinte aux écoles à effectif connu).
            out[f"n{k + 1}"] = _valeur(eleves, ligne.get("rem_denominateur", ligne.get("effectif_debut") or 0))
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


def _indicateur_attrition(annees: List[dict], *, niveau: str) -> Dict[str, Any]:
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
    annees = pl.annees(d.ctx, p, sim)       # suivi=True (E3) ; calculé une fois, partagé par deux indicateurs
    return {
        "nb_ecoles": len(sim),
        "encadrement": _indicateur_encadrement(d, p, sim, annees),
        "couverture_globale": _indicateur_couverture_globale(d, p, lignes_sim, sim),
        "couverture_operationnelle": {"apres_simulation": couverture_operationnelle(lignes_sim)},
        "couverture_parec": _indicateur_parec(d, p, sim),
        "alea": _indicateur_alea(d, p, sim),
        "attrition": _indicateur_attrition(annees, niveau=niveau),
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
    if v.get("statut") == NON_DISPONIBLE:
        return "Non disponible"
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


def tableaux_pour_export(rapport: dict, *, indicateur: Optional[str] = None,
                         annee: Optional[str] = None) -> List[dict]:
    """Un tableau par indicateur (ou un seul si `indicateur` est précisé) : le nœud courant en première ligne,
    puis chacun de ses enfants — jamais une ligne recalculée autrement que par les mêmes fonctions que le JSON.
    `annee` (« n1 » à « n5 ») ne garde, parmi les colonnes de projection, que l'année demandée ; import, après
    Prince et après simulation restent toujours présents. L'unité de l'indicateur figure dans l'intitulé."""
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
        if annee:
            situations = tuple(x for x in situations if x not in SITUATIONS_ANNEES or x == annee)
        lignes = [_ligne_territoire(rapport["titre"], rapport["noeud"], code, situations)]
        for enfant in rapport["enfants"]:
            lignes.append(_ligne_territoire(enfant["territoire"]["nom"], enfant, code, situations))
        tableaux.append({
            "code": code, "intitule": definition["intitule"], "unite": definition.get("unite", ""), "formule": definition["formule"],
            "population": definition["population"], "source": definition["source"], "limites": definition["limites"],
            "colonnes": [LIBELLE_SITUATION[s] for s in situations], "lignes": lignes,
        })
    return tableaux


def _resume_territoire(bloc: dict) -> dict:
    """Une ligne de synthèse (indicateurs clés après simulation, attrition N+1) pour les feuilles exhaustives
    (tous les départements, tous les arrondissements) de l'export national complet : le détail complet par
    situation reste dans les tableaux nationaux et régionaux, et dans l'export par périmètre (type=perimetre)."""
    return {
        "nb_ecoles": bloc["nb_ecoles"],
        "encadrement": _cellule(bloc["encadrement"]["apres_simulation"]),
        "couverture_globale": _cellule(bloc["couverture_globale"]["apres_simulation"]),
        "couverture_operationnelle": _cellule(bloc["couverture_operationnelle"]["apres_simulation"]),
        "couverture_parec": _cellule(bloc["couverture_parec"]["apres_simulation"]),
        "alea": _cellule_alea(bloc["alea"]["apres_simulation"]),
        "attrition_n1": _cellule_attrition(bloc["attrition"]["annees"]["n1"]),
    }


def _lignes_etablissements(d: _Donnees, ecoles: List[ProjectionEcole]) -> List[dict]:
    """Une ligne par établissement, calculée en un seul passage sur les écoles déjà chargées (jamais un appel à
    `construire()` par école) : le classeur national complet reste praticable avec plusieurs milliers d'écoles."""
    out = []
    for e in ecoles:
        i, pr = d.avant.ecoles_par_id.get(e.id), d.prep.ecoles_par_id.get(e.id)
        if i is None or pr is None:
            continue
        besoin_initial, besoin_apres_prince = int(i.ind.be), int(pr.ind.be)
        postes_resorbes = min(besoin_initial, max(0.0, e.effectif_initial - i.enseignants_actuels))
        couverts = min(besoin_apres_prince, max(0.0, e.effectif_initial - pr.enseignants_actuels))
        out.append({
            "id": e.id, "nom": e.nom, "region": e.region, "departement": e.departement, "commune": e.commune,
            "eleves": e.eleves_initial if e.eleves_connus else "Inconnu",
            "effectif_import": i.enseignants_actuels, "effectif_apres_prince": pr.enseignants_actuels,
            "effectif_apres_simulation": e.effectif_initial,
            "taux_encadrement": (taux_encadrement(e.eleves_initial, e.effectif_initial, 1)
                                 if e.eleves_connus and e.effectif_initial > 0 else "—"),
            "besoin_initial": besoin_initial,
            "couverture_globale_pct": (round(postes_resorbes / besoin_initial * 100, 1)
                                       if besoin_initial > 0 else "Sans objet"),
            "besoin_apres_prince": besoin_apres_prince,
            "couverture_operationnelle_pct": (round(couverts / besoin_apres_prince * 100, 1)
                                              if besoin_apres_prince > 0 else "Sans objet"),
            "parec_eligible": "Oui" if e.eleves_connus and e.eleves_initial > SEUIL_ELEVES_PAREC else "Non",
            "parec_couverte": ("Oui" if e.effectif_initial >= SEUIL_ENSEIGNANTS_PAREC
                               else "Non") if e.eleves_connus and e.eleves_initial > SEUIL_ELEVES_PAREC else "—",
        })
    return out


def construire_national_complet(jeu, *, scenario_id: Optional[str] = None,
                                indicateur: Optional[str] = None) -> dict:
    """Export national complet (réservé au DRH), exhaustif : synthèse nationale, les dix régions, tous les
    départements, tous les arrondissements et le détail de tous les établissements — chacun recalculé sur ses
    propres écoles (jamais une moyenne), et filtrable dans le classeur (une feuille par palier, autofiltre).

    Les paliers région → département → arrondissement sont parcourus une seule fois chacun (`pl.groupes`, pas de
    relance de `construire()` par territoire) : le coût reste proportionnel au nombre de départements et
    d'arrondissements réels du jeu, pas à une récursion redondante. Le document Word imbriqué (région →
    département → arrondissement) réutilise exactement les mêmes blocs d'indicateurs que les feuilles Excel."""
    d = _Donnees(jeu, scenario_id)
    toutes = d.ecoles_apres_simulation({})

    def bloc_de(p: dict, niveau: str) -> dict:
        return _indicateurs_territoire(d, p, niveau=niveau)

    national_bloc = bloc_de({}, "national")
    enfants_national, regions_mot, flat_regions, flat_departements, flat_arrondissements = [], [], [], [], []

    for terr_r, restr_r, ecoles_r in pl.groupes(toutes, "region"):
        bloc_r = bloc_de(restr_r, "region")
        enfants_national.append({"territoire": terr_r, **bloc_r})
        flat_regions.append({"territoire": terr_r, **_resume_territoire(bloc_r)})
        enfants_region, departements_mot = [], []
        for terr_d, restr_d, ecoles_d in pl.groupes(ecoles_r, "departement"):
            pd = {**restr_r, **restr_d}
            bloc_d = bloc_de(pd, "departement")
            enfants_region.append({"territoire": terr_d, **bloc_d})
            flat_departements.append({"territoire": terr_d, **_resume_territoire(bloc_d)})
            enfants_departement = []
            for terr_a, restr_a, _ in pl.groupes(ecoles_d, "commune"):
                pa = {**pd, **restr_a}
                bloc_a = bloc_de(pa, "commune")
                enfants_departement.append({"territoire": terr_a, **bloc_a})
                flat_arrondissements.append({"territoire": terr_a, **_resume_territoire(bloc_a)})
            rapport_dept = {"titre": terr_d["nom"], "noeud": bloc_d, "enfants": enfants_departement}
            departements_mot.append({"titre": rapport_dept["titre"], "niveau": "departement",
                                     "tableaux": tableaux_pour_export(rapport_dept, indicateur=indicateur)})
        rapport_region = {"titre": terr_r["nom"], "noeud": bloc_r, "enfants": enfants_region}
        regions_mot.append({"titre": rapport_region["titre"], "niveau": "region",
                            "tableaux": tableaux_pour_export(rapport_region, indicateur=indicateur),
                            "departements": departements_mot})

    national_rapport = {"titre": "Cameroun", "noeud": national_bloc, "enfants": enfants_national}
    return {
        "national": {"titre": "Cameroun", "niveau": "national",
                    "tableaux": tableaux_pour_export(national_rapport, indicateur=indicateur)},
        "regions": regions_mot,
        "exhaustif": {
            "regions": flat_regions, "departements": flat_departements, "arrondissements": flat_arrondissements,
            "etablissements": _lignes_etablissements(d, toutes),
        },
        "registre_indicateurs": REGISTRE_INDICATEURS,
        "scenario_id": str(d.ctx.scenario.pk),          # scénario réellement utilisé (demandé ou par défaut)
    }
