"""Cas d'usage du contexte Prince (faits du Prince / phase 0)."""
from __future__ import annotations

from typing import List

from django.conf import settings

from contextes.commun.erreurs import RefusMetier
from contextes.diagnostic.services import preparer
from contextes.simulation import services as sim
from domaine.prince.faits import MOTIF_DEFAUT, analyser_fichier_prince, verifier_fait_prince

from .models import FaitPrince


def verifier(jeu, id_ens: str, id_etab: str) -> List[str]:
    p = preparer(jeu)
    return verifier_fait_prince(id_ens, id_etab, enseignants=p.enseignants, ecoles=p.ecoles_par_id,
                                vivier_ids={e.matricule for e in p.vivier}, cfg=p.cfg,
                                faits_actifs=sim.faits_prince_actifs(jeu))


def ajouter(jeu, id_ens: str, id_etab: str, motif: str = "") -> FaitPrince:
    motifs = verifier(jeu, id_ens, id_etab)
    if motifs:
        raise RefusMetier("Fait de Prince refusé", motifs, code="fait_prince_refuse")
    f = FaitPrince.objects.create(jeu=jeu, id_ens=id_ens.strip(), id_etab=id_etab.strip(),
                                  motif=(motif or MOTIF_DEFAUT).strip())
    sim.recalculer_scenarios(jeu)
    return f


def annuler(jeu, fait: FaitPrince) -> None:
    fait.delete()
    sim.recalculer_scenarios(jeu)


def impact(jeu, id_ens: str, id_etab: str, motif: str = "") -> dict:
    """Aperçu : compare le scénario de référence avec et sans le fait. Rien n'est enregistré."""
    motifs = verifier(jeu, id_ens, id_etab)
    if motifs:
        raise RefusMetier("Fait de Prince refusé", motifs, code="fait_prince_refuse")
    sc = sim.scenario_par_defaut(jeu)
    cfg = sim.config_scenario(jeu, sc)
    base = sim.faits_prince_actifs(jeu)
    avant = sim.executer_moteur(jeu, cfg, faits=base, arbitrages=sim.arbitrages_jeu(jeu))
    apres = sim.executer_moteur(jeu, cfg, faits=base + [{"id_ens": id_ens, "id_etab": id_etab,
                                                          "motif": motif or MOTIF_DEFAUT}],
                                arbitrages=sim.arbitrages_jeu(jeu))
    deplaces = []
    ancien = {a["id_ens"]: a for a in avant.affectations}
    for a in apres.affectations:
        o = ancien.get(a["id_ens"])
        if o is None or o["id_poste"] != a["id_poste"]:
            deplaces.append({"id_ens": a["id_ens"], "avant": o["id_etab"] if o else None, "apres": a["id_etab"]})
    cles = ("besoin_total", "affectes", "non_affectes", "postes_non_pourvus", "effet_de_prince")
    return {"enregistre": False, "scenario": sc.nom,
            "avant": {k: avant.synthese[k] for k in cles}, "apres": {k: apres.synthese[k] for k in cles},
            "ecart": {k: apres.synthese[k] - avant.synthese[k] for k in cles}, "affectations_modifiees": deplaces}


def importer(jeu, lignes: List[dict]) -> dict:
    analyse = analyser_fichier_prince(lignes)
    acceptees, refusees = [], list(analyse["refusees"])
    vus = {f["id_ens"] for f in sim.faits_prince_actifs(jeu)}
    for l in analyse["acceptees"]:
        motifs = []
        if l["id_ens"] in vus:
            motifs.append("Un fait de Prince existe déjà pour cet enseignant")
        else:
            motifs = [m for m in verifier(jeu, l["id_ens"], l["id_etab"]) if "existe déjà" not in m]
        if motifs:
            refusees.append({**l, "motifs": motifs})
        else:
            FaitPrince.objects.create(jeu=jeu, id_ens=l["id_ens"], id_etab=l["id_etab"],
                                      motif=l["motif"] or MOTIF_DEFAUT)
            vus.add(l["id_ens"])
            acceptees.append(l)
    p = preparer(jeu)
    manquantes = sorted({l["id_etab"] for l in analyse["acceptees"] if l["id_etab"] not in p.ecoles_par_id}
                        | {l["id_ens"] for l in analyse["acceptees"] if l["id_ens"] not in p.enseignants})
    if acceptees:
        sim.recalculer_scenarios(jeu)
    return {"acceptees": acceptees, "refusees": refusees, "manquantes": manquantes}


def code_requis_ok(request) -> bool:
    code = settings.ALGOPLANR_CODE_PRINCE
    return not code or request.headers.get("X-AlgoPlanR-Code-Prince", "") == code
