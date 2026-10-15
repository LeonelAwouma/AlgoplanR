"""Cas d'usage du contexte Diagnostic (Moteur A) : préparation, indicateurs, territoires, priorités, synthèse."""
from __future__ import annotations

import hashlib
import json
from collections import Counter, OrderedDict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from contextes.donnees import depots
from contextes.parametrage.services import config_jeu
from contextes.simulation import services as sim
from domaine.diagnostic import synthese as syn
from domaine.diagnostic import territoires as terr
from domaine.diagnostic.indicateurs import enrichir_ecoles
from domaine.commun.texte import cle_recherche
from domaine.donnees import colonnes as C
from domaine.donnees.modeles import Ecole, Enseignant
from domaine.mobilite.bareme import calculer_bareme
from domaine.mobilite.vivier import construire_vivier, enrichir_enseignants, nettoyer_enseignants

from .models import DiagnosticCache


@dataclass
class Preparation:
    cfg: dict
    ecoles: List[Ecole]
    ecoles_par_id: Dict[str, Ecole]
    enseignants: Dict[str, Enseignant]       # tous, enrichis, avec barème
    exclus: Dict[str, str]                   # matricule -> raison d'exclusion du calcul
    vivier: List[Enseignant]
    ecoles_dicts: List[dict]
    # Construits à la première demande, puis réutilisés tant que le jeu ne change pas.
    lignes_enseignants: Optional[List[dict]] = None
    recherche: Dict[str, Tuple[List[dict], List[List[str]]]] = field(default_factory=dict)


_PREP: "OrderedDict[tuple, Preparation]" = OrderedDict()
# Écoles enrichies déjà décodées, pour ne pas relire le cache SQLite (plusieurs Mo de JSON) à chaque page.
_ECOLES: "OrderedDict[tuple, List[dict]]" = OrderedDict()
_MAX_JEUX = 4
# Version du contenu des écoles enrichies : la changer invalide les caches SQLite déjà écrits.
_VERSION_ECOLES = 2


def empreinte_jeu(jeu) -> str:
    brut = json.dumps({"v": _VERSION_ECOLES, "jeu": str(jeu.id), "cfg": config_jeu(jeu), "faits": sim.faits_prince_actifs(jeu),
                       "ne": jeu.etablissements.count(), "nens": jeu.enseignants.count()},
                      sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(brut.encode()).hexdigest()


def preparer(jeu) -> Preparation:
    cle = (str(jeu.id), empreinte_jeu(jeu))
    if cle in _PREP:
        _PREP.move_to_end(cle)
        return _PREP[cle]
    cfg = config_jeu(jeu)
    ecoles = enrichir_ecoles(depots.charger_ecoles(jeu), cfg)
    tous = enrichir_enseignants(depots.charger_enseignants(jeu), ecoles)
    gardes, exclus = nettoyer_enseignants(tous, cfg)
    vivier = construire_vivier(gardes, ecoles, cfg)
    # Enseignants réellement mobilisables par école : ceux du vivier (excédent xe, ancienneté de poste suffisante).
    mobilisables = Counter(v.ecole_attache for v in vivier)
    matricules_gardes = {g.matricule for g in gardes}
    for e in tous:                                   # barème aussi pour les agents exclus (fiche détaillée)
        if e.matricule not in matricules_gardes:
            e.bareme = calculer_bareme(e, cfg)
    prep = Preparation(cfg=cfg, ecoles=ecoles, ecoles_par_id={e.id: e for e in ecoles},
                       enseignants={e.matricule: e for e in tous},
                       exclus={x["matricule"]: x["raison"] for x in exclus}, vivier=vivier,
                       ecoles_dicts=[{**e.vers_dict(), "mobilisables": mobilisables.get(e.id, 0)} for e in ecoles])
    _PREP[cle] = prep
    while len(_PREP) > _MAX_JEUX:
        _PREP.popitem(last=False)
    return prep


def invalider_cache(jeu) -> None:
    DiagnosticCache.objects.filter(jeu=jeu).delete()
    for cache in (_PREP, _ECOLES):
        for k in [k for k in cache if k[0] == str(jeu.id)]:
            cache.pop(k, None)


def ecoles_enrichies(jeu) -> List[dict]:
    """Établissements avec indicateurs ; caches mémoire puis SQLite, indexés par empreinte."""
    emp = empreinte_jeu(jeu)
    cle = (str(jeu.id), emp)
    if cle in _ECOLES:
        _ECOLES.move_to_end(cle)
        return _ECOLES[cle]
    c = DiagnosticCache.objects.filter(jeu=jeu, empreinte=emp).first()
    if c:
        ecoles = c.contenu["ecoles"]
    else:
        ecoles = preparer(jeu).ecoles_dicts
        DiagnosticCache.objects.filter(jeu=jeu).exclude(empreinte=emp).delete()
        DiagnosticCache.objects.create(jeu=jeu, empreinte=emp, contenu={"ecoles": ecoles})
    _ECOLES[cle] = ecoles
    while len(_ECOLES) > _MAX_JEUX:
        _ECOLES.popitem(last=False)
    return ecoles


def lignes_enseignants(prep: Preparation) -> List[dict]:
    """Lignes de la liste des enseignants (fiche, vivier, exclusion), construites une fois par préparation."""
    if prep.lignes_enseignants is None:
        ids_vivier = {e.matricule for e in prep.vivier}
        lignes = []
        for e in prep.enseignants.values():
            d = e.vers_dict()
            d["dans_vivier"] = e.matricule in ids_vivier
            d["exclu_du_calcul"] = prep.exclus.get(e.matricule, "")
            lignes.append(d)
        prep.lignes_enseignants = lignes
    return prep.lignes_enseignants


def index_recherche(prep: Preparation, cible: str) -> Tuple[List[dict], List[List[str]]]:
    """Éléments recherchables et leurs clés normalisées (cle_recherche), calculées une fois par préparation."""
    if cible not in prep.recherche:
        if cible == "enseignants":
            items = [e.vers_dict() for e in prep.enseignants.values()]
            champs = [[d[C.COL_ENS_ID], d["nom"], d["prenom"], f"{d['nom']} {d['prenom']}"] for d in items]
        else:
            items = prep.ecoles_dicts
            champs = [[d[C.COL_ETAB_ID], d.get("nom_etab", ""), d[C.COL_ETAB_COMMUNE]] for d in items]
        prep.recherche[cible] = (items, [[cle_recherche(c) for c in cs] for cs in champs])
    return prep.recherche[cible]


def diagnostic(jeu, perimetre, *, zone="", securite="", sous_systeme="", type_etab="", seulement="",
               q="", sans_prince=False) -> dict:
    ecoles = syn.filtrer_ecoles(ecoles_enrichies(jeu), perimetre=perimetre, zone=zone, securite=securite,
                                sous_systeme=sous_systeme, type_etab=type_etab, seulement=seulement, q=q)
    prince = Counter(f["id_etab"] for f in sim.faits_prince_actifs(jeu))
    totaux = syn.totaux_diagnostic(ecoles, {} if sans_prince else dict(prince))
    if sans_prince:
        totaux["besoin_postes_apres_prince"] = totaux["besoin_postes"]
    return {"perimetre": perimetre.vers_dict(), "sans_prince": sans_prince, "totaux": totaux, "ecoles": ecoles}


def territoires(jeu, perimetre) -> dict:
    return terr.noeud_territorial(ecoles_enrichies(jeu), perimetre)


def options(jeu, perimetre) -> dict:
    return terr.options_filtres(ecoles_enrichies(jeu), perimetre)


def priorites(jeu, perimetre) -> List[dict]:
    ecoles = terr.filtrer_lignes(ecoles_enrichies(jeu), perimetre, C.COL_ETAB_REGION, C.COL_ETAB_DEPT,
                                 C.COL_ETAB_COMMUNE)
    return syn.trier_par_priorite(ecoles)


def synthese(jeu, perimetre, scenario=None) -> dict:
    sc = scenario or sim.scenario_par_defaut(jeu)
    res = terr.restreindre_resultat(sim.charger_resultat(sc), perimetre)
    s = res["synthese"]
    ecoles = res["etab_enrichi"]
    par_zone: Dict[str, dict] = {}
    for e in ecoles:
        z = e.get(C.COL_ETAB_ALPHA) or "(non renseignée)"
        d = par_zone.setdefault(z, {"zone": z, "nb_ecoles": 0, "besoin": 0, "excedent": 0})
        d["nb_ecoles"] += 1
        d["besoin"] += int(e.get("nb_postes_ouverts", 0) or 0)
        d["excedent"] += int(float(e.get("xe", 0) or 0))
    noeud = terr.noeud_territorial(ecoles, perimetre)
    return {
        "scenario": sim.resume_scenario(sc), "perimetre": perimetre.vers_dict(), "synthese": s,
        "tableau_de_bord": {"totaux": syn.totaux_diagnostic(ecoles),
                            "par_zone": sorted(par_zone.values(), key=lambda d: -d["besoin"]),
                            "par_enfant_territorial": noeud["enfants"]},
        "points_attention": syn.points_attention(s, ecoles),
        "narratif": syn.texte_narratif(s, perimetre.titre),
    }
