"""Cas d'usage du contexte Prince (faits du Prince / phase 0)."""
from __future__ import annotations

import datetime as dt
from typing import Dict, List, Optional, Tuple

from django.conf import settings
from django.db import transaction

from contextes.commun.erreurs import RefusMetier
from contextes.diagnostic import services as diag
from contextes.diagnostic.services import preparer
from contextes.donnees.lecteur import ecrire_excel
from contextes.simulation import services as sim
from domaine.commun.texte import cle_recherche
from domaine.diagnostic.territoires import Perimetre, filtrer_lignes
from domaine.donnees import colonnes as C
from domaine.prince import bases as pb
from domaine.prince.faits import MOTIF_DEFAUT, MOTIF_FAIT_ACTIF, analyser_fichier_prince, motifs_de_refus
from domaine.prince.projection import REJETE, ApplicationPrince, appliquer_effets_prince, totaux

from .models import FaitPrince


def _candidat(id_ens: str, id_etab: str, motif: str = "") -> dict:
    return {"id_ens": id_ens.strip(), "id_etab": id_etab.strip(), "motif": (motif or MOTIF_DEFAUT).strip()}


def _evaluer(jeu, id_ens: str, id_etab: str, motif: str = "", *, avec_base: bool = False, cfg: Optional[dict] = None):
    """Applique les faits actifs puis le fait proposé aux bases d'origine, comme le fera le prétraitement.

    Retourne (refus, alertes, application sans le fait ou None, application avec le fait ou None). Un fait du Prince
    peut créer un déficit comme un excédent : seules les impossibilités matérielles sont des refus (voir
    `motifs_de_refus`) ; le reste est une alerte, connue de la DRH avant l'enregistrement. `cfg` : configuration
    du scénario dont on veut l'aperçu (celle du jeu par défaut), pour que les alertes et les besoins des deux écoles
    soient ceux que le moteur calculera.
    """
    p = preparer(jeu).avant()
    cfg = cfg or p.cfg
    actifs = sim.faits_prince_actifs(jeu)
    candidat = _candidat(id_ens, id_etab, motif)
    if any(f["id_ens"] == candidat["id_ens"] for f in actifs):
        return [MOTIF_FAIT_ACTIF], [], None, None
    ens = list(p.enseignants.values())
    base = appliquer_effets_prince(p.ecoles, ens, actifs, cfg) if avec_base else None
    app = appliquer_effets_prince(p.ecoles, ens, actifs + [candidat], cfg)
    d = app.decisions[-1]
    return motifs_de_refus(d.rejets), list(d.alertes), base, app


def verifier(jeu, id_ens: str, id_etab: str) -> List[str]:
    """Motifs de refus d'un fait (vide = recevable)."""
    return _evaluer(jeu, id_ens, id_etab)[0]


@transaction.atomic
def ajouter(jeu, id_ens: str, id_etab: str, motif: str = "") -> Tuple[FaitPrince, List[str]]:
    """Enregistre un fait et recalcule les scénarios, en une seule transaction : si le recalcul échoue, le fait
    n'est pas enregistré. Retourne le fait et ses alertes."""
    refus, alertes, _, _ = _evaluer(jeu, id_ens, id_etab, motif)
    if refus:
        raise RefusMetier("Fait de Prince refusé", refus, code="fait_prince_refuse")
    c = _candidat(id_ens, id_etab, motif)
    f = FaitPrince.objects.create(jeu=jeu, id_ens=c["id_ens"], id_etab=c["id_etab"], motif=c["motif"])
    sim.recalculer_scenarios(jeu)
    return f, alertes


@transaction.atomic
def annuler(jeu, fait: FaitPrince) -> None:
    fait.delete()
    sim.recalculer_scenarios(jeu)


def _etat_ecole(e) -> dict:
    return {"nom": e.nom or e.id, "effectif": int(e.enseignants_actuels or 0), "besoin": int(e.ind.be),
            "excedent": int(e.ind.xe)}


def _ecart_ecole(ident: str, base, app, depart) -> dict:
    """Une école avant / après le fait : « avant » tient compte des faits déjà actifs (l'état courant du jeu)."""
    avant = base.ecoles_apres.get(ident) or depart[ident]
    return {"id": ident, "avant": _etat_ecole(avant), "apres": _etat_ecole(app.ecoles_apres.get(ident) or avant)}


def impact(jeu, id_ens: str, id_etab: str, motif: str = "") -> dict:
    """Aperçu d'un fait unique : les deux écoles avant / après, calculées par le même prétraitement que l'import, et
    l'effet sur le scénario de référence. Rien n'est enregistré."""
    sc = sim.scenario_par_defaut(jeu)
    cfg = sim.config_scenario(jeu, sc)
    refus, alertes, base, app = _evaluer(jeu, id_ens, id_etab, motif, avec_base=True, cfg=cfg)
    if refus:
        raise RefusMetier("Fait de Prince refusé", refus, code="fait_prince_refuse")
    depart = preparer(jeu).avant().ecoles_par_id
    d = app.decisions[-1]
    actifs = sim.faits_prince_actifs(jeu)
    avant = sim.executer_moteur(jeu, cfg, faits=actifs, arbitrages=sim.arbitrages_jeu(jeu))
    apres = sim.executer_moteur(jeu, cfg, faits=actifs + [_candidat(id_ens, id_etab, motif)],
                                arbitrages=sim.arbitrages_jeu(jeu))
    deplaces = []
    ancien = {a["id_ens"]: a for a in avant.affectations}
    nouveau = {a["id_ens"]: a for a in apres.affectations}
    for a in apres.affectations:
        o = ancien.get(a["id_ens"])
        if o is None or o["id_poste"] != a["id_poste"]:
            deplaces.append({"id_ens": a["id_ens"], "avant": o["id_etab"] if o else None, "apres": a["id_etab"]})
    # Les enseignants qui perdent leur affectation (poste pris par l'agent déplacé, ou poste disparu) comptent aussi.
    for m, o in ancien.items():
        if m not in nouveau:
            deplaces.append({"id_ens": m, "avant": o["id_etab"], "apres": None})
    cles = ("besoin_total", "affectes", "non_affectes", "postes_non_pourvus", "effet_de_prince")
    return {"enregistre": False, "scenario": sc.nom, "alertes": alertes,
            "origine": _ecart_ecole(d.id_origine, base, app, depart),
            "destination": _ecart_ecole(d.id_destination, base, app, depart),
            "avant": {k: avant.synthese[k] for k in cles}, "apres": {k: apres.synthese[k] for k in cles},
            "ecart": {k: apres.synthese[k] - avant.synthese[k] for k in cles}, "affectations_modifiees": deplaces}


def _classer_import(jeu, lignes: List[dict]) -> Tuple[List[dict], List[dict], List[str]]:
    """Classe les lignes d'un fichier en acceptées / refusées, sans rien enregistrer.

    Le prétraitement juge les lignes d'un même passage ensemble : une ligne rejetée ne modifie rien, donc le résultat est
    le même qu'en les essayant une à une. Un matricule cité plusieurs fois dans le fichier : la première ligne valable
    est retenue, les suivantes sont refusées comme doublons ; si la première est rejetée (école inconnue…), la suivante
    est essayée à son tour, comme le ferait une saisie ligne par ligne. Chaque ligne acceptée porte ses alertes.
    """
    analyse = analyser_fichier_prince(lignes)
    refusees = list(analyse["refusees"])
    actifs = sim.faits_prince_actifs(jeu)
    deja_actifs = {f["id_ens"] for f in actifs}
    p = preparer(jeu)
    avant = p.avant()
    ens = list(avant.enseignants.values())

    # Lignes de chaque matricule, dans l'ordre du fichier. Un matricule déjà actif n'est plus à examiner.
    par_matricule: Dict[str, List[dict]] = {}
    for l in analyse["acceptees"]:
        if l["id_ens"] in deja_actifs:
            refusees.append({**l, "motifs": [MOTIF_FAIT_ACTIF]})
        else:
            par_matricule.setdefault(l["id_ens"], []).append(l)

    retenues: Dict[str, dict] = {}                 # matricule -> ligne retenue
    rejets: Dict[str, List[str]] = {}              # matricule -> motifs de la dernière ligne essayée
    rang = {m: 0 for m in par_matricule}           # prochaine ligne à essayer pour chaque matricule
    a_essayer = list(par_matricule)
    while a_essayer:
        essais = [(m, par_matricule[m][rang[m]]) for m in a_essayer]
        app = appliquer_effets_prince(avant.ecoles, ens, actifs + [
            _candidat(l["id_ens"], l["id_etab"], l["motif"]) for _, l in essais], avant.cfg)
        suivants = []
        for (m, l), d in zip(essais, app.decisions[len(actifs):]):
            if not d.rejets:
                retenues[m] = l
                continue
            rejets[m] = motifs_de_refus(d.rejets)
            rang[m] += 1
            if rang[m] < len(par_matricule[m]):
                suivants.append(m)
            else:
                refusees.append({**l, "motifs": rejets[m]})
        a_essayer = suivants
    for m, lignes_m in par_matricule.items():
        gardee = retenues.get(m)
        for l in lignes_m:
            if l is gardee:
                continue
            if gardee is not None and l["ligne"] > gardee["ligne"]:
                refusees.append({**l, "motifs": [f"Doublon dans le fichier : ce matricule est déjà retenu à la ligne "
                                                 f"{gardee['ligne']}"]})
            elif gardee is not None or l is not lignes_m[-1]:
                # Ligne essayée puis rejetée avant la ligne retenue (ou avant une autre tentative) : motif propre.
                refusees.append({**l, "motifs": rejets.get(m, [MOTIF_FAIT_ACTIF])})
    # Dernier passage, dans l'ordre du fichier : les alertes tiennent compte des décisions retenues avant chaque ligne.
    ordre = sorted(retenues.values(), key=lambda l: l["ligne"])
    final = appliquer_effets_prince(avant.ecoles, ens, actifs + [
        _candidat(l["id_ens"], l["id_etab"], l["motif"]) for l in ordre], avant.cfg)
    acceptees = []
    for l, d in zip(ordre, final.decisions[len(actifs):]):
        if d.rejets:                                # ne peut arriver que si l'ordre change l'issue : on refuse par prudence
            refusees.append({**l, "motifs": motifs_de_refus(d.rejets)})
        else:
            acceptees.append({**l, "alertes": list(d.alertes)})
    refusees.sort(key=lambda l: l.get("ligne", 0))
    manquantes = sorted({l["id_etab"] for l in analyse["acceptees"] if l["id_etab"] not in p.ecoles_par_id}
                        | {l["id_ens"] for l in analyse["acceptees"] if l["id_ens"] not in p.enseignants})
    return acceptees, refusees, manquantes


@transaction.atomic
def importer(jeu, lignes: List[dict]) -> dict:
    """Enregistre les faits acceptés et recalcule une seule fois les scénarios, en une seule transaction : si le
    recalcul échoue, aucun fait n'est enregistré."""
    acceptees, refusees, manquantes = _classer_import(jeu, lignes)
    for l in acceptees:
        FaitPrince.objects.create(jeu=jeu, id_ens=l["id_ens"], id_etab=l["id_etab"], motif=l["motif"] or MOTIF_DEFAUT)
    if acceptees:
        sim.recalculer_scenarios(jeu)
    return {"acceptees": acceptees, "refusees": refusees, "manquantes": manquantes}


# --- Application aux bases : résumé, aperçu, bases consultables -----------------------------------------------------

def _resume(app: Optional[ApplicationPrince]) -> dict:
    decisions = app.decisions if app else []
    appliquees = [d for d in decisions if d.statut != REJETE]
    return {"identifiees": len(decisions), "appliquees": len(appliquees),
            "avec_alerte": sum(1 for d in appliquees if d.alertes), "rejetees": len(decisions) - len(appliquees)}


def _description(prep: diag.Preparation, app: Optional[ApplicationPrince], *, depuis: int = 0) -> dict:
    """Résumé, totaux avant / après et décisions ; `depuis` : ordre à partir duquel les décisions sont neuves."""
    avant = prep.avant()
    if app is None:
        t = totaux(prep.ecoles, prep.cfg)
        t_avant = t_apres = t
    else:
        t_avant, t_apres = app.totaux_avant, app.totaux_apres
    lignes = pb.lignes_journal(app, avant.ecoles_par_id, avant.enseignants)
    for l in lignes:
        l["Nouvelle"] = bool(depuis) and l["Ordre"] >= depuis
    return {"resume": _resume(app), "avant": t_avant, "apres": t_apres, "decisions": lignes,
            "ecarts_effectifs": app.ecarts_effectifs if app else []}


def application(jeu) -> dict:
    """État actuel : les faits actifs appliqués aux bases importées."""
    prep = preparer(jeu)
    return {**_description(prep, prep.application), "empreinte": diag.empreinte_jeu(jeu)}


def apercu_import(jeu, lignes: List[dict]) -> dict:
    """Essai à blanc d'un fichier : ce que l'import enregistrerait et l'état des bases qui en résulterait."""
    acceptees, refusees, manquantes = _classer_import(jeu, lignes)
    prep = preparer(jeu)
    avant = prep.avant()
    actifs = sim.faits_prince_actifs(jeu)
    candidats = actifs + [{"id_ens": l["id_ens"], "id_etab": l["id_etab"], "motif": l["motif"] or MOTIF_DEFAUT}
                          for l in acceptees]
    app = appliquer_effets_prince(avant.ecoles, list(avant.enseignants.values()), candidats, avant.cfg)
    return {"bilan": {"acceptees": acceptees, "refusees": refusees, "manquantes": manquantes},
            "application": _description(prep, app, depuis=len(actifs) + 1 if acceptees else 0)}


NOMS_BASES = ("etablissements", "enseignants", "journal")
FICHIERS = {"etablissements": ("Etablissements", "etablissements_apres_prince.xlsx"),
            "enseignants": ("Enseignants", "enseignants_apres_prince.xlsx"),
            "journal": ("Decisions_Prince", "rapport_application_prince.xlsx")}


def lignes_bases(jeu, nom: str, perimetre: Perimetre, *, concernes: bool = False, q: str = "") -> List[dict]:
    """Lignes d'une base après Prince, restreintes au périmètre, aux éléments touchés et à une recherche."""
    if nom not in NOMS_BASES:
        raise RefusMetier("Base inconnue", [f"Bases disponibles : {', '.join(NOMS_BASES)}"])
    prep = preparer(jeu)
    avant, app = prep.avant(), prep.application
    cache = prep.bases
    if nom not in cache:
        if nom == "etablissements":
            cache[nom] = pb.lignes_etablissements(avant.ecoles, prep.ecoles, app.ecoles_apres if app else ())
        elif nom == "enseignants":
            cache[nom] = pb.lignes_enseignants(list(avant.enseignants.values()), list(prep.enseignants.values()),
                                               app.decisions if app else [],
                                               {e.id: e.region for e in avant.ecoles})
        else:
            cache[nom] = pb.lignes_journal(app, avant.ecoles_par_id, avant.enseignants)
    lignes = cache[nom]

    if not perimetre.national:
        ids = {l[C.COL_ETAB_ID] for l in filtrer_lignes(prep.ecoles_dicts, perimetre, C.COL_ETAB_REGION,
                                                         C.COL_ETAB_DEPT, C.COL_ETAB_COMMUNE)}
        # Un agent déplacé hors du périmètre reste visible dans le périmètre où il était (école initiale), à côté de celui
        # où il arrive (école après décision) : la région initiale et la région après décision figurent en colonnes.
        colonnes = {"etablissements": (C.COL_ETAB_ID,), "enseignants": (C.COL_ENS_ETAB, "Ecole_Initiale"),
                    "journal": ("Ecole_Origine", "Ecole_Destination")}[nom]
        lignes = [l for l in lignes if any(l.get(c) in ids for c in colonnes)]
    if concernes:
        if nom == "etablissements":
            lignes = [l for l in lignes if l["Touche_Par_Prince"] == "OUI"]
        elif nom == "enseignants":
            lignes = [l for l in lignes if l["Statut_Prince"]]
    if q:
        cle = cle_recherche(q)
        champs = {"etablissements": (C.COL_ETAB_ID, "nom_etab", C.COL_ETAB_COMMUNE),
                  "enseignants": (C.COL_ENS_ID, "nom", "prenom", C.COL_ENS_ETAB),
                  "journal": ("Matricule_Enseignant", "Nom_Enseignant", "Ecole_Origine", "Ecole_Destination")}[nom]
        lignes = [l for l in lignes if any(cle in cle_recherche(l.get(c)) for c in champs)]
    return lignes


def classeur(jeu, nom: str, perimetre: Perimetre, *, concernes: bool = False) -> Tuple[bytes, str]:
    """Classeur Excel d'une base après Prince : les lignes, une feuille « Information » et, pour le journal, les écarts."""
    lignes = lignes_bases(jeu, nom, perimetre, concernes=concernes)
    prep = preparer(jeu)
    feuille, fichier = FICHIERS[nom]
    info = pb.feuille_information(fichier.removesuffix(".xlsx"), diag.empreinte_jeu(jeu),
                                  dt.datetime.now().strftime("%d/%m/%Y %H:%M"), _resume(prep.application))
    feuilles: Dict[str, List[dict]] = {feuille: lignes, "Information": info}
    if nom == "journal" and prep.application and prep.application.ecarts_effectifs:
        feuilles["Ecarts_Effectifs"] = prep.application.ecarts_effectifs
    return ecrire_excel(feuilles), fichier


def code_requis_ok(request) -> bool:
    code = settings.ALGOPLANR_CODE_PRINCE
    return not code or request.headers.get("X-AlgoPlanR-Code-Prince", "") == code
