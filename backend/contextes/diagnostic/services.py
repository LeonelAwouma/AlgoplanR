"""Cas d'usage du contexte Diagnostic (Moteur A) : préparation, indicateurs, territoires, priorités, synthèse."""
from __future__ import annotations

import hashlib
import json
from collections import Counter, OrderedDict
from dataclasses import dataclass, field, replace
from typing import Dict, List, Optional, Tuple

from contextes.donnees import depots
from contextes.parametrage.services import config_jeu
from contextes.planification import services as pl
from contextes.simulation import services as sim
from domaine.diagnostic import synthese as syn
from domaine.diagnostic import territoires as terr
from domaine.diagnostic.indicateurs import enrichir_ecoles
from domaine.commun.encadrement import taux_encadrement
from domaine.commun.texte import cle_recherche
from domaine.donnees import colonnes as C
from domaine.donnees.modeles import Ecole, Enseignant
from domaine.mobilite.bareme import calculer_bareme
from domaine.mobilite.vivier import construire_vivier, enrichir_enseignants, nettoyer_enseignants
from domaine.prince.projection import ApplicationPrince, appliquer_effets_prince

from .models import DiagnosticCache


@dataclass
class Preparation:
    """Bases du jeu, enrichies, **après application des faits du Prince**.

    Les faits actifs sont appliqués avant tout calcul : enseignants rattachés à leur école de destination, effectifs
    des écoles touchées mis à jour, indicateurs, vivier et besoins recalculés. Les bases d'origine restent
    disponibles par `avant()` (vérification d'un nouveau fait, projections qui rejouent les mouvements).
    """
    cfg: dict
    ecoles: List[Ecole]
    ecoles_par_id: Dict[str, Ecole]
    enseignants: Dict[str, Enseignant]       # tous, enrichis, avec barème
    exclus: Dict[str, str]                   # matricule -> raison d'exclusion du calcul
    vivier: List[Enseignant]
    ecoles_dicts: List[dict]
    #: Bases d'origine (sans les faits du Prince), `None` quand aucun fait n'est actif : elles sont alors identiques.
    origine: Optional["Preparation"] = None
    application: Optional[ApplicationPrince] = None
    # Construits à la première demande, puis réutilisés tant que le jeu ne change pas.
    lignes_enseignants: Optional[List[dict]] = None
    recherche: Dict[str, Tuple[List[dict], List[List[str]]]] = field(default_factory=dict)
    ecoles_dicts_origine: Optional[List[dict]] = None
    #: Lignes des bases « après Prince » (établissements, enseignants, journal), construites à la demande.
    bases: Dict[str, List[dict]] = field(default_factory=dict)

    def avant(self) -> "Preparation":
        """Bases d'origine, avant les faits du Prince."""
        return self.origine or self


_PREP: "OrderedDict[tuple, Preparation]" = OrderedDict()
# Écoles enrichies déjà décodées, pour ne pas relire le cache SQLite (plusieurs Mo de JSON) à chaque page.
_ECOLES: "OrderedDict[tuple, List[dict]]" = OrderedDict()
_MAX_JEUX = 4
# Version du contenu des écoles enrichies : la changer invalide les caches SQLite déjà écrits.
_VERSION_ECOLES = 6


def empreinte_jeu(jeu) -> str:
    brut = json.dumps({"v": _VERSION_ECOLES, "jeu": str(jeu.id), "cfg": config_jeu(jeu), "faits": sim.faits_prince_actifs(jeu),
                       "ne": jeu.etablissements.count(), "nens": jeu.enseignants.count()},
                      sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(brut.encode()).hexdigest()


def _rem(e: Ecole) -> Optional[float]:
    return taux_encadrement(e.effectif_eleves, e.enseignants_actuels or 0)


def _ligne_ecole(e: Ecole, mobilisables: int, avant: Optional[Ecole] = None, touchee: bool = False) -> dict:
    """École à plat avec ses indicateurs, et ses valeurs d'avant les faits du Prince (celles de l'école si aucune)."""
    o = avant or e
    # Taux d'encadrement et élèves par classe de l'école : calculés ici, par la fonction commune, pour que l'interface
    # n'ait aucun ratio à refaire (None si l'effectif d'élèves, ou les classes ouvertes, ne sont pas connus).
    rem = taux_encadrement(e.effectif_eleves, e.enseignants_actuels) if e.effectif_connu else None
    par_classe = (taux_encadrement(e.effectif_eleves, e.classes_ouvertes)
                  if e.effectif_connu and e.classes_ouvertes else None)
    return {**e.vers_dict(), "mobilisables": mobilisables, "rem": rem, "eleves_par_classe": par_classe,
            "Enseignants_Avant_Prince": o.enseignants_actuels, "Besoin_Avant_Prince": int(o.ind.be), "REM_Avant_Prince": _rem(o), "touche_par_prince": touchee}


def _situation(cfg: dict, ecoles: List[Ecole], tous: List[Enseignant], ecartes=()) -> Preparation:
    """Vivier, exclusions et barèmes d'un couple de bases ; `ecartes` : agents hors mobilité ordinaire."""
    gardes, exclus = nettoyer_enseignants(tous, cfg)
    vivier = construire_vivier(gardes, ecoles, cfg, exclus=ecartes)
    matricules_gardes = {g.matricule for g in gardes}
    for e in tous:                                   # barème aussi pour les agents exclus (fiche détaillée)
        if e.matricule not in matricules_gardes:
            e.bareme = calculer_bareme(e, cfg)
    mobilisables = Counter(v.ecole_attache for v in vivier)
    return Preparation(cfg=cfg, ecoles=ecoles, ecoles_par_id={e.id: e for e in ecoles},
                       enseignants={e.matricule: e for e in tous},
                       exclus={x["matricule"]: x["raison"] for x in exclus}, vivier=vivier,
                       ecoles_dicts=syn.attribuer_rangs([_ligne_ecole(e, mobilisables.get(e.id, 0)) for e in ecoles]))


def preparer(jeu) -> Preparation:
    cle = (str(jeu.id), empreinte_jeu(jeu))
    if cle in _PREP:
        _PREP.move_to_end(cle)
        return _PREP[cle]
    cfg = config_jeu(jeu)
    ecoles = enrichir_ecoles(depots.charger_ecoles(jeu), cfg)
    tous = enrichir_enseignants(depots.charger_enseignants(jeu), ecoles)
    prep = _situation(cfg, ecoles, tous)
    faits = sim.faits_prince_actifs(jeu)
    if faits:
        prep = _apres_prince(prep, faits)
    _PREP[cle] = prep
    while len(_PREP) > _MAX_JEUX:
        _PREP.popitem(last=False)
    return prep


def _apres_prince(origine: Preparation, faits: List[dict]) -> Preparation:
    """Bases après les faits du Prince : écoles touchées recalculées, agents déplacés écartés du vivier ordinaire."""
    cfg = origine.cfg
    application = appliquer_effets_prince(origine.ecoles, list(origine.enseignants.values()), faits, cfg)
    touchees = set(application.ecoles_apres)
    # Les agents des écoles touchées prennent les attributs recalculés de leur école (excédent, accessibilité…) :
    # on les copie pour ne rien modifier des bases d'origine, qui restent en cache.
    tous = [replace(t) if t.ecole_attache in touchees and t.matricule not in application.enseignants_avant else t
            for t in application.enseignants]
    enrichir_enseignants(tous, application.ecoles)
    apres = _situation(cfg, application.ecoles, tous, ecartes=application.deplaces)
    # Chaque école garde, à côté de ses valeurs actuelles, celles d'avant les faits du Prince.
    mobilisables = Counter(v.ecole_attache for v in apres.vivier)
    apres.ecoles_dicts = syn.attribuer_rangs(
        [_ligne_ecole(e, mobilisables.get(e.id, 0), origine.ecoles_par_id[e.id], e.id in touchees) for e in apres.ecoles])
    apres.origine = origine
    apres.application = application
    return apres


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
        # `get_or_create` : deux requêtes simultanées (arbre, diagnostic, totaux…) calculent le même diagnostic ; la
        # seconde à écrire retrouve la ligne de la première au lieu d'échouer sur la contrainte d'unicité.
        DiagnosticCache.objects.get_or_create(jeu=jeu, empreinte=emp, defaults={"contenu": {"ecoles": ecoles}})
    _ECOLES[cle] = ecoles
    while len(_ECOLES) > _MAX_JEUX:
        _ECOLES.popitem(last=False)
    return ecoles


def lignes_enseignants(prep: Preparation) -> List[dict]:
    """Lignes de la liste des enseignants (fiche, vivier, exclusion), construites une fois par préparation."""
    if prep.lignes_enseignants is None:
        ids_vivier = {e.matricule for e in prep.vivier}
        # École de référence : celle du fichier importé. Pour un agent déplacé par un fait du Prince, `Ecole_Attache_Actuelle`
        # est la destination décidée (bases après Prince) ; l'école de référence en est distincte.
        avant = prep.application.enseignants_avant if prep.application else {}
        ecoles_avant = prep.avant().ecoles_par_id
        lignes = []
        for e in prep.enseignants.values():
            d = e.vers_dict()
            d["dans_vivier"] = e.matricule in ids_vivier
            d["exclu_du_calcul"] = prep.exclus.get(e.matricule, "")
            origine = avant.get(e.matricule)
            d["fait_prince"] = origine is not None
            reference = origine.ecole_attache if origine else e.ecole_attache
            d["ecole_reference"] = reference
            d["nom_ecole_reference"] = (ecoles_avant[reference].nom or reference) if reference in ecoles_avant else reference
            lignes.append(d)
        prep.lignes_enseignants = lignes
    return prep.lignes_enseignants


def index_recherche(prep: Preparation, cible: str) -> Tuple[List[dict], List[List[str]]]:
    """Éléments recherchables et leurs clés normalisées (cle_recherche), calculées une fois par préparation."""
    if cible not in prep.recherche:
        if cible == "enseignants":
            # Un agent déjà déplacé par un fait du Prince est signalé : on ne propose pas d'en prendre un second.
            deplaces = prep.application.deplaces if prep.application else set()
            items = [{**e.vers_dict(), "fait_prince": e.matricule in deplaces} for e in prep.enseignants.values()]
            champs = [[d[C.COL_ENS_ID], d["nom"], d["prenom"], f"{d['nom']} {d['prenom']}"] for d in items]
        else:
            items = prep.ecoles_dicts
            champs = [[d[C.COL_ETAB_ID], d.get("nom_etab", ""), d[C.COL_ETAB_COMMUNE]] for d in items]
        prep.recherche[cible] = (items, [[cle_recherche(c) for c in cs] for cs in champs])
    return prep.recherche[cible]


def ecoles_dicts_origine(prep: Preparation) -> List[dict]:
    """Établissements avec indicateurs sur les bases d'origine, avant les faits du Prince."""
    if prep.origine is None:
        return prep.ecoles_dicts
    if prep.ecoles_dicts_origine is None:
        o = prep.origine
        mobilisables = Counter(v.ecole_attache for v in o.vivier)
        prep.ecoles_dicts_origine = syn.attribuer_rangs([_ligne_ecole(e, mobilisables.get(e.id, 0)) for e in o.ecoles])
    return prep.ecoles_dicts_origine


def diagnostic(jeu, perimetre, *, zone="", securite="", sous_systeme="", type_etab="", seulement="",
               q="", sans_prince=False) -> dict:
    """Diagnostic du périmètre. Par défaut sur les bases après les faits du Prince ; `sans_prince` : bases importées."""
    lignes = ecoles_dicts_origine(preparer(jeu)) if sans_prince else ecoles_enrichies(jeu)
    ecoles = syn.filtrer_ecoles(lignes, perimetre=perimetre, zone=zone, securite=securite,
                                sous_systeme=sous_systeme, type_etab=type_etab, seulement=seulement, q=q)
    totaux = syn.totaux_diagnostic(ecoles)
    return {"perimetre": perimetre.vers_dict(), "sans_prince": sans_prince, "totaux": totaux, "ecoles": ecoles}


def totaux_ecoles(jeu, perimetre, identifiants) -> dict:
    """Totaux (`totaux_diagnostic`) des seules écoles demandées, prises dans le périmètre autorisé : une école hors
    périmètre (région d'un autre délégué) est ignorée, jamais comptée. Sert les filtres que le serveur ne sait pas
    exprimer (sévérité, multigrade…) : l'interface choisit les écoles, le serveur en calcule les totaux — la seule
    formule de ces totaux reste celle du serveur."""
    voulues = set(identifiants)
    ecoles = terr.filtrer_lignes(ecoles_enrichies(jeu), perimetre, C.COL_ETAB_REGION, C.COL_ETAB_DEPT,
                                 C.COL_ETAB_COMMUNE)
    return syn.totaux_diagnostic([e for e in ecoles if e[C.COL_ETAB_ID] in voulues])


def territoires(jeu, perimetre) -> dict:
    return terr.noeud_territorial(ecoles_enrichies(jeu), perimetre)


def arbre(jeu, perimetre) -> dict:
    """Arbre territorial complet à partir du périmètre demandé (la région imposée d'un délégué, le national pour
    le DRH) : les écoles hors périmètre sont retirées avant de construire l'arbre, jamais après — un délégué ne
    reçoit donc jamais la moindre trace d'une autre région, même dans un total agrégé."""
    ecoles = terr.filtrer_lignes(ecoles_enrichies(jeu), perimetre, C.COL_ETAB_REGION, C.COL_ETAB_DEPT,
                                 C.COL_ETAB_COMMUNE)
    return terr.arbre_territorial(ecoles, niveau=perimetre.niveau, region=perimetre.region,
                                  departement=perimetre.departement, commune=perimetre.commune)


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
        "synthese_territoriale": syn.synthese_par_sous_systeme(ecoles, pl.hypotheses_dict(jeu)),
    }
