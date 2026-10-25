"""Cas d'usage du contexte Planification : hypothèses versionnées, tableau sur cinq ans, quotas, versions, suivi.

Le tableau se calcule à la demande sur les données du jeu (domaine/planification) : projection des écoles après
les mouvements du scénario de référence, puis report des décisions enregistrées (quotas, nominations, registre).
Chaque recalcul demandé conserve un instantané (version) du national et de chaque région.
"""
from __future__ import annotations

import hashlib
import threading
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from django.db import transaction
from django.http import Http404
from django.utils import timezone

from contextes.audit.services import journaliser
from contextes.commun.erreurs import RefusMetier
from contextes.simulation import services as sim
from domaine.commun.texte import cle_tri_fr, norm
from domaine.donnees.modeles import Enseignant
from domaine.planification import parametres as par
from domaine.planification import previsionnel as prev
from domaine.planification import rapport as rap
from domaine.planification.projection import (SCENARIOS, DepartRetraite, ProjectionEcole, calculer_annees,
                                              fiabilite_indicateurs, ligne_fiabilite, projeter_ecoles)
from domaine.planification.referentiel_drh import region_drh
from domaine.planification.suivi import appliquer_suivi, dans, indicateurs_suivi

from .models import EtatPlanification, EvenementQuota, HypothesesJeu, Quota, VersionPlanification

AUTEUR_INITIAL = "Paramétrage initial"
REGION_MANQUANTE = "Région non renseignée"
SOUS_SYSTEMES = ("francophone", "anglophone", "non_renseigne")
INDICATEURS = ("effectif_debut", "departs_retraite", "departs_attrition", "besoin", "ressources_vivier",
               "quota_calcule", "quota_retenu", "nominations_prevues", "nominations_realisees", "deploiements_prevus",
               "deploiements_realises", "besoin_restant")
NIVEAU_ENFANT = {"national": "region", "region": "departement", "departement": "commune", "commune": "ecole",
                 "iaeb": "ecole"}

# --- Hypothèses ------------------------------------------------------------------------------------------------


def hypotheses_courantes(jeu) -> Tuple[dict, dict]:
    """(hypothèses en vigueur, {version, modifiees_le, modifiees_par})."""
    h = jeu.hypotheses.first()
    if h is not None:
        return par.copie(h.contenu), {"version": h.version, "modifiees_le": h.modifiees_le,
                                      "modifiees_par": h.modifiees_par or None}
    from contextes.parametrage.services import config_jeu
    return par.hypotheses_par_defaut(config_jeu(jeu)), {"version": 1, "modifiees_le": jeu.cree_le,
                                                        "modifiees_par": AUTEUR_INITIAL}


def hypotheses_dict(jeu) -> dict:
    contenu, meta = hypotheses_courantes(jeu)
    # `reference_attrition` est un référentiel en lecture seule (modèle M1 du rapport DRH) : jamais stocké dans
    # `contenu`, jamais modifiable via PUT, toujours recalculé à la demande pour rester à jour indépendamment des
    # versions d'hypothèses enregistrées.
    return {**contenu, **meta, "reference_attrition": par.REFERENTIEL_ATTRITION_M1}


def historique_hypotheses(jeu) -> List[dict]:
    lignes = [{"version": h.version, "modifiees_le": h.modifiees_le, "modifiees_par": h.modifiees_par or None,
               "motif": h.motif, "hypotheses": {**h.contenu, "version": h.version, "modifiees_le": h.modifiees_le,
                                                "modifiees_par": h.modifiees_par or None}}
              for h in jeu.hypotheses.all()]
    if not lignes:
        h = hypotheses_dict(jeu)
        lignes = [{"version": 1, "modifiees_le": h["modifiees_le"], "modifiees_par": AUTEUR_INITIAL,
                   "motif": "Hypothèses par défaut", "hypotheses": h}]
    return lignes


@transaction.atomic
def modifier_hypotheses(jeu, corps: dict, *, motif: str, auteur: str, request) -> dict:
    if not (motif or "").strip():
        raise RefusMetier("Toute modification des hypothèses doit être motivée", code="motif_manquant")
    courant, meta = hypotheses_courantes(jeu)
    nouvelles, erreurs = par.valider_hypotheses(corps, courant)
    if erreurs:
        raise RefusMetier("Hypothèses incohérentes", erreurs, code="hypotheses_invalides")
    if not jeu.hypotheses.exists():
        HypothesesJeu.objects.create(jeu=jeu, version=1, contenu=courant, modifiees_par=AUTEUR_INITIAL,
                                     motif="Hypothèses par défaut")
    version = meta["version"] + 1
    HypothesesJeu.objects.create(jeu=jeu, version=version, contenu=nouvelles, modifiees_par=auteur, motif=motif.strip())
    journaliser(jeu, "hypotheses", "modification", f"Hypothèses, version {version} : {motif.strip()}",
                request=request, auteur=auteur, objet=("hypotheses", version), avant=courant, apres=nouvelles)
    marquer_obsolete(jeu, "Modification des hypothèses")
    return hypotheses_dict(jeu)


def documentation(jeu) -> dict:
    h, _ = hypotheses_courantes(jeu)
    d, r, a = h["drh"], h["retraite"], h["attrition"]
    methode = {"taux_unique": f"taux unique de {a['taux_unique']} % par an",
               "par_region": "taux propre à chaque région (taux régionaux du rapport DRH moins les retraites)",
               "par_sous_systeme": "taux propre à chaque sous-système"}[a["methode"]]
    plafond = (f"Le quota annuel est plafonné à {d['PLAF_PRI']} recrutements pour le primaire national (PLAF_PRI), "
               "rapportés à l'effectif du périmètre" if d["PLAF_PRI"] > 0 else "Aucun plafond de recrutement")
    plafond += (", sans descendre sous les retraites de l'année (PLANCHER_RET)." if d["PLANCHER_RET"] else ".")
    sections = [
        {"titre": "Départs à la retraite", "paragraphes": [
            f"Un enseignant part l'année où il atteint {r['age_legal']} ans "
            f"({'à la rentrée scolaire' if r['date_reference'] == 'rentree' else 'en fin d’année civile'}).",
            ("Les agents ayant déjà atteint cet âge sont imputés à la première année (CORR_60)." if d["CORR_60"]
             else "Les agents ayant déjà atteint cet âge ne sont pas comptés (CORR_60 désactivé)."),
            r["justification"]]},
        {"titre": "Attrition hors retraite", "paragraphes": [
            f"Méthode : {methode}, appliqué à l'effectif du périmètre et arrondi à l'entier le plus proche.",
            a["justification"]]},
        {"titre": "Croissance des élèves et besoin", "paragraphes": [
            f"L'effectif d'élèves de chaque école croît de {d['G_PRI_PCT']} % par an (G_PRI_PCT) ; la cible de "
            "l'école (règle du référentiel MINEDUB) est recalculée chaque année sur cet effectif.",
            f"Les prises de fonction de directeurs ({d['DIR_NOM_AN']} par an, dont {d['DIR_H_PRI_PCT']} % sans classe "
            "au primaire) libèrent des classes, rapportées à l'effectif du périmètre.",
            f"Taux d'encadrement de référence du rapport : {d['REM_REF_PRI']} élèves par enseignant au primaire ; "
            "le taux d'encadrement projeté du périmètre est donné à titre indicatif."]},
        {"titre": "Quotas de recrutement", "paragraphes": [
            h["quotas"]["justification"],
            f"Le déficit initial est rattrapé sur {d['ETAL_N']} an(s) (ETAL_N). {plafond}"]},
        {"titre": "Vivier", "paragraphes": [
            h["vivier"]["justification"], f"Sources retenues : {', '.join(h['vivier']['sources']) or 'aucune'}."]},
    ]
    regions = sorted({e.region for e in _ecoles_jeu(jeu)}, key=cle_tri_fr)
    fiches = [f"{x['region']} (priorité {x['priorite']}) : {x['situation']}. {x['orientation']}."
              for x in (region_drh(r) for r in regions) if x]
    if fiches:
        sections.append({"titre": "Orientations régionales du rapport DRH", "paragraphes": fiches})
    return {"sections": sections}


def _ecoles_jeu(jeu):
    from contextes.diagnostic import services as diag
    return diag.preparer(jeu).ecoles


def estimer_attrition(jeu) -> dict:
    h, _ = hypotheses_courantes(jeu)
    legal = h["retraite"]["age_legal"]
    actualisations = list(jeu.actualisations.all())
    a = h["attrition"]
    en_vigueur = {"taux_unique": f"un taux unique de {a['taux_unique']} % par an",
                  "par_region": f"un taux par région (repli : {a['taux_unique']} % par an)",
                  "par_sous_systeme": f"un taux par sous-système (repli : {a['taux_unique']} % par an)"}[a["methode"]]
    m1 = (f"Les hypothèses en vigueur retiennent {en_vigueur} ; pour mémoire, le modèle M1 du rapport DRH retient "
          f"{h['drh']['A_AUT_PRI_PCT']} % d'autres départs par an au primaire.")
    if not actualisations:
        return {"taux_propose": None, "methode": "Comparaison des effectifs entre deux actualisations successives",
                "base": "Une seule photographie des effectifs est disponible pour ce jeu.",
                "avertissements": ["Il faut au moins une actualisation des fichiers pour estimer un taux observé.", m1]}
    avant = departs = 0
    for a in actualisations:
        avant += int(a.ecarts.get("nb_avant") or 0)
        departs += sum(1 for d in a.ecarts.get("departs", []) if d.get("age") is None or d["age"] < legal - 2)
    taux = round(departs / avant * 100, 2) if avant else None
    avert = ["Taux rapporté à une année : les actualisations sont supposées annuelles."]
    if len(actualisations) == 1:
        avert.append("Une seule actualisation : l'estimation reste fragile.")
    avert.append(m1)
    return {"taux_propose": taux, "methode": "Comparaison des effectifs entre deux actualisations successives",
            "base": (f"{len(actualisations)} actualisation(s) : {departs} départ(s) hors retraite pour {avant} "
                     f"enseignant(s) ; les départs à {legal - 2} ans et plus sont comptés comme retraites (rapport DRH)."),
            "avertissements": avert}


# --- Contexte de calcul ----------------------------------------------------------------------------------------

@dataclass
class Contexte:
    jeu: object
    hyp: dict
    meta: dict
    scenario: object
    ecoles: List[ProjectionEcole]
    departs: List[DepartRetraite]
    enseignants: List[Enseignant]
    decisions: dict
    etat: Optional[EtatPlanification] = None
    quotas: List[dict] = field(default_factory=list)


_PROJECTIONS: "OrderedDict[tuple, tuple]" = OrderedDict()
_MAX = 6
# Les écritures de la planification (quotas calculés, premier instantané) sont rares et sérialisées : plusieurs
# lectures simultanées d'un même écran ne doivent ni réécrire les mêmes lignes ni se bloquer dans SQLite.
_VERROU = threading.RLock()   # réentrant : etat() appelle contexte() sous le verrou
# Empreinte des calculs qui ont produit les quotas enregistrés, par jeu (mémoire du processus).
_QUOTAS_A_JOUR: Dict[str, str] = {}


def contexte(jeu, scenario_id: Optional[str] = None, *, avec_etat: bool = True) -> Contexte:
    from contextes.diagnostic import services as diag
    from contextes.nominations import services as nom

    prep = diag.preparer(jeu)
    hyp, meta = hypotheses_courantes(jeu)
    decisions = nom.decisions_suivi(jeu)
    sc = decisions["scenario"]
    if scenario_id:
        sc = jeu.scenarios.filter(pk=scenario_id).first() if str(scenario_id).isdigit() else None
        if sc is None:
            raise Http404("Ce scénario n'existe pas")
    res = sim.charger_resultat(sc)
    cle = (str(jeu.id), diag.empreinte_jeu(jeu), meta["version"], str(meta["modifiees_le"]), sc.pk,
           str(sc.resultat.calcule_le))
    if cle in _PROJECTIONS:
        _PROJECTIONS.move_to_end(cle)
        ecoles, departs = _PROJECTIONS[cle]
    else:
        # Bases d'origine : les affectations du résultat contiennent déjà les mouvements du Prince, qui rejouent
        # le départ et l'arrivée de chaque agent. Partir des bases après Prince les compterait deux fois.
        avant = prep.avant()
        ecoles, departs = projeter_ecoles(avant.ecoles, avant.enseignants.values(), prep.cfg, hyp,
                                          affectations=res["affectations"])
        _PROJECTIONS[cle] = (ecoles, departs)
        while len(_PROJECTIONS) > _MAX:
            _PROJECTIONS.popitem(last=False)
    ctx = Contexte(jeu=jeu, hyp=hyp, meta=meta, scenario=sc, ecoles=ecoles, departs=departs,
                   enseignants=list(prep.enseignants.values()), decisions=decisions)
    hors_moteur = sorted((x.get("region") or "", x.get("sous_systeme") or "") for x in decisions["hors_moteur"])
    empreinte = hashlib.sha256(repr((cle, hors_moteur)).encode()).hexdigest()
    ctx.quotas = synchroniser_quotas(ctx, empreinte)
    if avec_etat:
        ctx.etat = etat(jeu, ctx)
    return ctx


def ecoles_de(ctx: Contexte, p: dict) -> List[ProjectionEcole]:
    return [e for e in ctx.ecoles if dans(e.lieu(), p)]


def _supplementaires(ctx: Contexte, p: dict) -> int:
    return sum(1 for x in ctx.decisions["hors_moteur"] if dans(x, p))


def annees(ctx: Contexte, p: dict, ecoles: Optional[List[ProjectionEcole]] = None, *, suivi: bool = True
           ) -> List[dict]:
    ecoles = ecoles_de(ctx, p) if ecoles is None else ecoles
    lignes = calculer_annees(ecoles, ctx.hyp, ressources_supplementaires=_supplementaires(ctx, p))
    if not suivi:
        return lignes
    return appliquer_suivi(lignes, p, quotas=ctx.quotas, nominations=ctx.decisions["nominations"],
                           mouvements=ctx.decisions["mouvements"],
                           recrutements_supposes=bool(ctx.hyp["quotas"]["annees_precedentes_realisees"]))


def niveau_de(p: dict) -> str:
    for n in ("commune", "departement", "iaeb", "region"):
        if p.get(n):
            return n
    return "national"


def libelle(p: dict) -> str:
    return p.get("commune") or p.get("departement") or p.get("iaeb") or p.get("region") or "Cameroun"


def tableau(ctx: Contexte, p: dict) -> dict:
    ecoles = ecoles_de(ctx, p)
    fiab = ligne_fiabilite(libelle(p), ecoles, ctx.enseignants)
    return {"perimetre": libelle(p), "niveau": niveau_de(p), "sous_systeme": p.get("sous_systeme") or None,
            "scenario_id": str(ctx.scenario.pk), "version": ctx.etat.version if ctx.etat else 1,
            "calcule_le": ctx.etat.calcule_le if ctx.etat else None, "annees": annees(ctx, p, ecoles),
            "fiabilite": fiabilite_indicateurs(fiab, bool(p.get("sous_systeme")))}


# --- Territoires ---------------------------------------------------------------------------------------------

def _territoire(niveau: str, region: str, departement: str = "", commune: str = "", nom: str = "",
                iaeb: str = "") -> dict:
    if niveau == "region":
        parties = [region or REGION_MANQUANTE]
    elif niveau == "departement":
        parties = [region or REGION_MANQUANTE, departement or "Département non renseigné"]
    elif niveau == "iaeb":
        parties = [region or REGION_MANQUANTE, departement or "Département non renseigné", iaeb or "IAEB non renseignée"]
    else:
        parties = [region or REGION_MANQUANTE, departement or "Département non renseigné",
                   commune or "Commune non renseignée"]
        if niveau == "ecole":
            parties.append(nom)
    return {"code": " / ".join(parties), "niveau": niveau, "nom": nom or parties[-1], "region": region or None,
            "departement": (departement or None) if niveau != "region" else None,
            "commune": (commune or None) if niveau in ("commune", "ecole") else None,
            "code_parent": " / ".join(parties[:-1])}


def groupes(ecoles: List[ProjectionEcole], niveau: str) -> List[Tuple[dict, dict, List[ProjectionEcole]]]:
    """(territoire, restriction du périmètre, écoles) pour chaque territoire du niveau demandé."""
    par: Dict[tuple, List[ProjectionEcole]] = OrderedDict()
    for e in ecoles:
        cle = {"region": (e.region,), "departement": (e.region, e.departement),
               "commune": (e.region, e.departement, e.commune), "iaeb": (e.region, e.departement, e.iaeb),
               "ecole": (e.id,)}[niveau]
        par.setdefault(cle, []).append(e)
    out = []
    for cle, liste in par.items():
        e = liste[0]
        if niveau == "ecole":
            t = _territoire("ecole", e.region, e.departement, e.commune, e.nom)
            restriction = {"ecole": e.id}
        elif niveau == "iaeb":
            t = _territoire("iaeb", e.region, e.departement, iaeb=e.iaeb)
            restriction = {"region": e.region, "departement": e.departement, "iaeb": e.iaeb}
        else:
            t = _territoire(niveau, *cle)
            restriction = dict(zip(("region", "departement", "commune"), cle))
        out.append((t, restriction, liste))
    return sorted(out, key=lambda x: cle_tri_fr(x[0]["nom"]))


def niveau_enfants(p: dict, demande: str = "") -> str:
    if demande in ("region", "departement", "commune", "ecole", "iaeb"):
        return demande
    return NIVEAU_ENFANT[niveau_de(p)]


def ventilation_territoriale(ctx: Contexte, p: dict, demande: str = "") -> dict:
    niveau = niveau_enfants(p, demande)
    lignes = [{"territoire": t, "annees": annees(ctx, {**p, **r}, liste)}
              for t, r, liste in groupes(ecoles_de(ctx, p), niveau)]
    return {"niveau": niveau, "lignes": lignes}


def ventilation_sous_systemes(ctx: Contexte, p: dict) -> dict:
    ecoles = ecoles_de(ctx, p)
    lignes = []
    for s in SOUS_SYSTEMES:
        liste = [e for e in ecoles if e.sous_systeme == s]
        a = annees(ctx, {**p, "sous_systeme": s}, liste)
        if any(x["effectif_debut"] > 0 for x in a):
            lignes.append({"sous_systeme": s, "annees": a})
    return {"lignes": lignes}


def lignes_ecoles(ctx: Contexte, p: dict) -> List[dict]:
    return [{"id_ecole": e.id, "nom_ecole": e.nom, "region": e.region, "departement": e.departement,
             "commune": e.commune, "sous_systeme": None if e.sous_systeme == "non_renseigne" else e.sous_systeme,
             "cible": e.cible,
             "annees": [{"annee": par.ANNEES_PLAN[k], "effectif": e.effectifs[k], "departs_retraite": e.retraites[k],
                         "besoin": e.besoins[k], "excedent": e.excedents[k]} for k in range(len(e.effectifs))]}
            for e in ecoles_de(ctx, p)]


def plan_departs(ctx: Contexte, p: dict) -> dict:
    retraites = sorted((d for d in ctx.departs if dans(d.lieu, p)), key=lambda d: (d.annee, cle_tri_fr(d.nom)))
    ecoles = ecoles_de(ctx, p)
    attrition = []
    for s in SOUS_SYSTEMES:
        liste = [e for e in ecoles if e.sous_systeme == s]
        if not liste:
            continue
        for a in annees(ctx, {**p, "sous_systeme": s}, liste, suivi=False):
            if a["departs_attrition"] > 0:
                attrition.append({"annee": a["annee"], "territoire": libelle(p), "sous_systeme": s,
                                  "departs": a["departs_attrition"]})
    return {"retraites": [{"annee": par.ANNEES_PLAN[d.annee], "matricule": d.matricule, "nom": d.nom,
                           "id_ecole": d.id_ecole, "nom_ecole": d.nom_ecole, "date_naissance": None,
                           "age_au_depart": d.age_au_depart} for d in retraites],
            "attrition": attrition}


def _horizon_rapport(horizon) -> int:
    try:
        h = int(horizon)
    except (TypeError, ValueError):
        raise RefusMetier("Horizon invalide", [f"Nombre entier d'années entre 1 et {len(par.ANNEES_PLAN)} attendu"])
    if not 1 <= h <= len(par.ANNEES_PLAN):
        raise RefusMetier("Horizon invalide", [f"Nombre entier d'années entre 1 et {len(par.ANNEES_PLAN)} attendu"])
    return h


def _seuil_cohorte(seuil) -> float:
    try:
        v = float(seuil)
    except (TypeError, ValueError):
        raise RefusMetier("Seuil de la cohorte invalide", ["Nombre d'années au poste attendu"])
    if v < 0:
        raise RefusMetier("Seuil de la cohorte invalide", ["Nombre d'années au poste positif attendu"])
    return v


def rapport(ctx: Contexte, p: dict, horizon=3, seuil_cohorte=5) -> dict:
    """Tableaux du rapport DRH (§3 à §9) sur le périmètre, ventilés par région."""
    ecoles = ecoles_de(ctx, p)
    ids = {e.id for e in ecoles}
    legal = ctx.hyp["retraite"]["age_legal"]
    age_atteint = sum(1 for t in ctx.enseignants if t.ecole_attache in ids and t.age is not None and t.age >= legal)
    ressources = {r: _supplementaires(ctx, {**p, "region": r}) for r in {e.region for e in ecoles}}
    out = rap.construire(ecoles, ctx.enseignants, ctx.hyp, _horizon_rapport(horizon), ressources=ressources,
                         seuil_cohorte=_seuil_cohorte(seuil_cohorte),
                         agents_age_atteint=age_atteint if ctx.hyp["drh"].get("CORR_60", True) else 0)
    return {"perimetre": libelle(p), "scenario_id": str(ctx.scenario.pk), **out}


def previsionnel(ctx: Contexte, p: dict) -> dict:
    """Tableau prévisionnel complet (base, N+1 à N+5) : les quatre scénarios sont calculés sur le même périmètre que le
    tableau principal, dont la trajectoire sous plafond (quotas retenus inclus) fournit les groupes A à C."""
    from contextes.parametrage.services import config_jeu
    ecoles = ecoles_de(ctx, p)
    supp = _supplementaires(ctx, p)
    traj = {s: calculer_annees(ecoles, ctx.hyp, ressources_supplementaires=supp, scenario=s) for s in SCENARIOS}
    out = prev.construire(ecoles, ctx.enseignants, traj, annees(ctx, p, ecoles), ctx.hyp,
                          annee_scolaire=getattr(ctx.jeu, "annee_scolaire", ""))
    out["hypotheses"] = prev.hypotheses_methodologiques(ctx.hyp, config_jeu(ctx.jeu)["besoin"])
    return {"perimetre": libelle(p), "niveau": niveau_de(p), "sous_systeme": p.get("sous_systeme") or None,
            "scenario_id": str(ctx.scenario.pk), "base_calcul": base_de_calcul(ctx.jeu), **out}


def alea(ctx: Contexte, p: dict) -> dict:
    """Degré d'aléa (1 − R² enseignants ~ élèves) du périmètre et de chacune de ses régions.

    « Après » (au premier niveau de la réponse) : effectifs après les faits du Prince et les mouvements du scénario du
    contexte, comme le rapport prévisionnel. « Avant » (clé `avant`) : effectifs déclarés des bases à l'import, avant
    les faits du Prince et avant l'algorithme.
    """
    from contextes.diagnostic import services as diag
    importees = [e for e in rap.ecoles_a_l_import(diag.preparer(ctx.jeu).avant().ecoles) if dans(e.lieu(), p)]
    return {"perimetre": libelle(p), "scenario_id": str(ctx.scenario.pk), **rap.alea_par_region(ecoles_de(ctx, p)),
            "avant": rap.alea_par_region(importees)}


def listes_rapport(ctx: Contexte, p: dict, seuil_cohorte=5) -> dict:
    """Listes nominatives du volet redéploiement : écoles (C1, C3) et cohorte « au moins N ans au poste »."""
    ecoles = ecoles_de(ctx, p)
    seuil = _seuil_cohorte(seuil_cohorte)
    return {"seuil_cohorte": seuil, "ecoles": rap.lignes_ecoles(ecoles),
            "cohorte": rap.cohorte(ctx.enseignants, ecoles, seuil)}


def fiabilite(ctx: Contexte, p: dict) -> dict:
    ecoles = ecoles_de(ctx, p)
    return {"global": ligne_fiabilite(libelle(p), ecoles, ctx.enseignants),
            "par_territoire": [ligne_fiabilite(t["nom"], liste, ctx.enseignants)
                               for t, _, liste in groupes(ecoles, niveau_enfants(p))]}


def indicateurs(ctx: Contexte, p: dict) -> dict:
    a = annees(ctx, p)
    return {"perimetre": libelle(p), "indicateurs": indicateurs_suivi(a[0]) if a else []}


def evolution(ctx: Contexte, p: dict) -> dict:
    cle = _cle_instantane(p)
    points = []
    for v in sorted(ctx.jeu.versions_planification.all(), key=lambda v: v.version):
        valeurs = (v.indicateurs.get("national") if cle == "national"
                   else (v.indicateurs.get("regions") or {}).get(cle)) if cle else None
        if valeurs is not None:
            points.append({"version": v.version, "calcule_le": v.calcule_le, "indicateurs": valeurs})
    courant = indicateurs(ctx, p)["indicateurs"]
    if not points or points[-1]["indicateurs"] != courant:
        actuel = {"version": ctx.etat.version, "calcule_le": timezone.now(), "indicateurs": courant}
        if points and points[-1]["version"] == actuel["version"]:
            points[-1] = actuel  # une version n'apparaît qu'une fois : l'état courant remplace son instantané
        else:
            points.append(actuel)
    return {"points": points}


# --- Quotas -----------------------------------------------------------------------------------------------------

def _quota_dict(q: Quota) -> dict:
    return {"annee": q.annee, "code_territoire": q.code_territoire, "territoire": q.territoire,
            "sous_systeme": q.sous_systeme, "calcule": q.calcule, "retenu": q.retenu,
            "motif_ajustement": q.motif_ajustement, "statut": q.statut, "ajuste_par": q.ajuste_par,
            "valide_le": q.valide_le}


def _quotas_enregistres(jeu) -> List[dict]:
    return [_quota_dict(q) for q in sorted(jeu.quotas.all(), key=lambda q: (q.annee, cle_tri_fr(q.territoire),
                                                                           q.sous_systeme))]


def synchroniser_quotas(ctx: Contexte, empreinte: Optional[str] = None) -> List[dict]:
    """Quotas calculés par région, sous-système et année ; les quotas validés restent figés.

    Les quotas ne sont recalculés et réécrits que si les données qui les produisent ont changé (`empreinte`) :
    une simple lecture de la planification n'écrit rien.
    """
    cle = str(ctx.jeu.id)
    if empreinte is not None and _QUOTAS_A_JOUR.get(cle) == empreinte:
        return _quotas_enregistres(ctx.jeu)
    with _VERROU:
        if empreinte is not None and _QUOTAS_A_JOUR.get(cle) == empreinte:
            return _quotas_enregistres(ctx.jeu)
        resultat = _ecrire_quotas(ctx)
        if empreinte is not None:
            _QUOTAS_A_JOUR[cle] = empreinte
        return resultat


@transaction.atomic
def _ecrire_quotas(ctx: Contexte) -> List[dict]:
    calcules: Dict[tuple, tuple] = {}
    for t, r, liste in groupes(ctx.ecoles, "region"):
        region = t["nom"]
        for s in SOUS_SYSTEMES:
            sous = [e for e in liste if e.sous_systeme == s]
            if not sous:
                continue
            for a in annees(ctx, {**r, "sous_systeme": s}, sous, suivi=False):
                calcules[(a["annee"], region, s)] = a["quota_calcule"]
    existants = {(q.annee, q.code_territoire, q.sous_systeme): q for q in ctx.jeu.quotas.all()}
    evenements = []
    for (annee, region, s), valeur in calcules.items():
        q = existants.get((annee, region, s))
        if q is None:
            existants[(annee, region, s)] = Quota.objects.create(
                jeu=ctx.jeu, annee=annee, code_territoire=region, territoire=region, sous_systeme=s,
                calcule=valeur, retenu=valeur)
        elif q.statut == "valide" or q.calcule == valeur:
            continue
        else:
            q.calcule = valeur
            if q.statut == "calcule":
                q.retenu = valeur
            q.save(update_fields=["calcule", "retenu"])
        evenements.append(EvenementQuota(jeu=ctx.jeu, annee=annee, code_territoire=region, sous_systeme=s,
                                         evenement="calcul", valeur=valeur))
    for cle, q in list(existants.items()):
        if cle not in calcules and q.statut == "calcule":
            q.delete()
            existants.pop(cle)
    EvenementQuota.objects.bulk_create(evenements)
    return [_quota_dict(q) for q in sorted(existants.values(), key=lambda q: (q.annee, cle_tri_fr(q.territoire),
                                                                              q.sous_systeme))]


def quotas(ctx: Contexte, *, annee: str = "", region: str = "", sous_systeme: str = "") -> List[dict]:
    return [q for q in ctx.quotas if (not annee or q["annee"] == annee)
            and (not region or norm(q["territoire"]) == norm(region))
            and (not sous_systeme or q["sous_systeme"] == sous_systeme)]


@transaction.atomic
def ajuster_quota(jeu, annee: str, territoire: str, corps: dict, *, request, auteur: str) -> dict:
    from contextes.acces.perimetre import region_imposee

    ss = corps.get("sous_systeme") or "non_renseigne"
    q = jeu.quotas.filter(annee=annee, code_territoire=territoire, sous_systeme=ss).first()
    imposee = region_imposee(request)
    if q is None or (imposee and norm(q.territoire) != norm(imposee)):
        raise Http404("Ce quota n'existe pas")
    if q.statut == "valide":
        from contextes.nominations.services import Conflit
        raise Conflit("Ce quota est validé : il ne peut plus être ajusté.")
    valeur = corps.get("retenu")
    if isinstance(valeur, float) and not valeur.is_integer():
        raise RefusMetier("Quota retenu invalide", ["Nombre entier attendu"])
    from contextes.commun.outils import entier_param
    retenu = entier_param(None if valeur is None else int(valeur) if isinstance(valeur, float) else valeur,
                          "retenu", minimum=0, maximum=10_000_000)
    if retenu is None:
        raise RefusMetier("Quota retenu invalide", ["Nombre entier attendu"])
    motif = str(corps.get("motif") or "").strip()
    if retenu != q.calcule and not motif:
        raise RefusMetier("Un ajustement doit être motivé.", code="motif_manquant")
    avant = _quota_dict(q)
    q.retenu, q.motif_ajustement, q.statut, q.ajuste_par = retenu, motif or None, "ajuste", auteur
    q.save()
    EvenementQuota.objects.create(jeu=jeu, annee=annee, code_territoire=territoire, sous_systeme=ss,
                                  evenement="ajustement", valeur=retenu, motif=motif or None, auteur=auteur)
    journaliser(jeu, "quota", "ajustement", f"Quota {annee} {q.territoire} : {avant['retenu']} → {retenu}",
                request=request, auteur=auteur, objet=("quota", f"{annee}:{territoire}:{ss}"), avant=avant,
                apres=_quota_dict(q))
    return _quota_dict(q)


@transaction.atomic
def valider_quotas(jeu, annee: str, *, request, auteur: str) -> List[dict]:
    from contextes.acces.perimetre import region_imposee

    if annee not in par.ANNEES_PLAN:
        raise RefusMetier("Année du plan invalide", [f"Années possibles : {', '.join(par.ANNEES_PLAN)}"])
    imposee = region_imposee(request)
    maintenant = timezone.now()
    liste = [q for q in jeu.quotas.filter(annee=annee) if not imposee or norm(q.territoire) == norm(imposee)]
    for q in liste:
        if q.statut == "valide":
            continue
        q.statut, q.valide_le = "valide", maintenant
        q.save(update_fields=["statut", "valide_le"])
        EvenementQuota.objects.create(jeu=jeu, annee=annee, code_territoire=q.code_territoire,
                                      sous_systeme=q.sous_systeme, evenement="validation", valeur=q.retenu,
                                      auteur=auteur)
    journaliser(jeu, "quota", "validation", f"Validation des quotas de {annee}", request=request, auteur=auteur,
                objet=("quotas", annee), apres={"quotas": len(liste)})
    return [_quota_dict(q) for q in liste]


def historique_quotas(jeu, annee: str = "", region: str = "") -> List[dict]:
    evts = jeu.evenements_quotas.all()
    if annee:
        evts = evts.filter(annee=annee)
    if region:
        evts = [e for e in evts if norm(e.code_territoire) == norm(region)]
    return [{"annee": e.annee, "code_territoire": e.code_territoire, "sous_systeme": e.sous_systeme,
             "evenement": e.evenement, "valeur": e.valeur, "motif": e.motif, "auteur": e.auteur, "le": e.le}
            for e in evts]


# --- État, versions, recalcul ------------------------------------------------------------------------------------

def _cle_instantane(p: dict) -> Optional[str]:
    """Clé d'un instantané conservé : le national et chaque région, sans autre restriction."""
    if set(p) - {"region"}:
        return None
    return p.get("region") or "national"


def _instantane(ctx: Contexte) -> Tuple[dict, dict]:
    national = tableau(ctx, {})
    tableaux = {"national": national, "regions": {}}
    indic = {"national": indicateurs_suivi(national["annees"][0]) if national["annees"] else [], "regions": {}}
    for t, r, _ in groupes(ctx.ecoles, "region"):
        tb = tableau(ctx, r)
        tableaux["regions"][t["nom"]] = tb
        indic["regions"][t["nom"]] = indicateurs_suivi(tb["annees"][0]) if tb["annees"] else []
    import json
    return json.loads(json.dumps(tableaux, default=str)), json.loads(json.dumps(indic, default=str))


def etat(jeu, ctx: Optional[Contexte] = None) -> EtatPlanification:
    e = EtatPlanification.objects.filter(jeu=jeu).first()
    if e is not None:
        return e
    with _VERROU:
        e = EtatPlanification.objects.filter(jeu=jeu).first()
        if e is not None:
            return e
        # Calcul de l'instantané hors transaction : l'écriture qui suit est brève.
        e = EtatPlanification(jeu=jeu, version=1, calcule_le=timezone.now(),
                              declencheur="Premier calcul de la planification")
        ctx = ctx or contexte(jeu, avec_etat=False)
        ctx.etat = e
        tableaux, indic = _instantane(ctx)
        with transaction.atomic():
            e.save()
            VersionPlanification.objects.create(jeu=jeu, version=1, declencheur=e.declencheur, tableaux=tableaux,
                                                indicateurs=indic)
    return e


def marquer_obsolete(jeu, declencheur: str) -> None:
    """Une décision change les effectifs ou les hypothèses : la version conservée ne les reflète plus."""
    EtatPlanification.objects.filter(jeu=jeu).update(obsolete=True, declencheur=declencheur[:200])


def base_de_calcul(jeu) -> dict:
    """Scénario dont les mouvements alimentent la planification, et pourquoi : retenu explicitement, repli
    provisoire sur le scénario par défaut, ou aucun. Une projection sans scénario retenu n'est jamais une
    décision validée."""
    if jeu.scenario_retenu_id:
        return {"type": "scenario_retenu", "scenario_id": str(jeu.scenario_retenu_id),
                "scenario_nom": jeu.scenario_retenu.nom, "provisoire": False}
    try:
        sc = sim.scenario_par_defaut(jeu)
    except RefusMetier:
        return {"type": "aucun", "scenario_id": None, "scenario_nom": None, "provisoire": True}
    return {"type": "scenario_par_defaut", "scenario_id": str(sc.pk), "scenario_nom": sc.nom, "provisoire": True}


def etat_dict(jeu, e: EtatPlanification) -> dict:
    return {"version": e.version, "calcule_le": e.calcule_le, "declencheur": e.declencheur or None,
            "obsolete": e.obsolete, "scenario_retenu_id": str(jeu.scenario_retenu_id) if jeu.scenario_retenu_id
            else None, "base_calcul": base_de_calcul(jeu)}


@transaction.atomic
def recalculer(jeu, *, request, auteur: str) -> dict:
    ctx = contexte(jeu)
    e = ctx.etat
    e.version += 1
    e.calcule_le = timezone.now()
    e.declencheur = e.declencheur if e.obsolete and e.declencheur else "Recalcul demandé"
    e.auteur, e.obsolete = auteur, False
    e.save()
    tableaux, indic = _instantane(ctx)
    VersionPlanification.objects.create(jeu=jeu, version=e.version, declencheur=e.declencheur, auteur=auteur,
                                        tableaux=tableaux, indicateurs=indic)
    journaliser(jeu, "recalcul", f"version {e.version}", f"Recalcul de la planification (version {e.version})",
                request=request, auteur=auteur, objet=None, apres={"version": e.version, "declencheur": e.declencheur})
    return etat_dict(jeu, e)


def version_dict(v: VersionPlanification) -> dict:
    return {"version": v.version, "calcule_le": v.calcule_le, "declencheur": v.declencheur, "auteur": v.auteur or None}


def versions(jeu) -> List[dict]:
    etat(jeu)
    return [version_dict(v) for v in jeu.versions_planification.all()]


def version(jeu, numero: int, p: Optional[dict] = None) -> dict:
    etat(jeu)
    v = jeu.versions_planification.filter(version=numero).first()
    if v is None:
        raise Http404("Version inconnue")
    cle = _cle_instantane(p or {}) or "national"
    tb = v.tableaux.get("national") if cle == "national" else (v.tableaux.get("regions") or {}).get(cle)
    if tb is None:
        raise Http404("Cette version ne conserve pas ce périmètre")
    return {"version": version_dict(v), "tableau": tb}


def comparer(jeu, de: int, a: int, p: Optional[dict] = None) -> dict:
    v1, v2 = version(jeu, de, p), version(jeu, a, p)
    ecarts = []
    for l1, l2 in zip(v1["tableau"]["annees"], v2["tableau"]["annees"]):
        for k in INDICATEURS:
            if l1.get(k) != l2.get(k):
                ecarts.append({"annee": l1["annee"], "indicateur": k, "de": l1.get(k) or 0, "a": l2.get(k) or 0})
    return {"de": v1["version"], "a": v2["version"], "ecarts": ecarts}
