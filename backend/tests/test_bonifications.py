"""Lot 3A : le motif saisi par l'agent (Motif_Bonification) ne change plus aucun score ni aucune affectation."""
import copy
import dataclasses

import pytest

from domaine.diagnostic.indicateurs import enrichir_ecoles
from domaine.donnees.demonstration import construire_jeu_demonstration
from domaine.donnees.modeles import construire_ecole, construire_enseignant
from domaine.mobilite import analyses as an
from domaine.donnees import colonnes as C
from domaine.mobilite.bonification import ecole_bonifiee
from domaine.mobilite.moteur import lancer_affectation
from domaine.mobilite.score import detail_score, score_enseignant_poste
from domaine.mobilite.vivier import construire_postes
from domaine.parametrage.config import ParametresInvalides, defaut, valider
from domaine.qualite.rapport import controler


def _lignes(graine: int, motif):
    e, n = construire_jeu_demonstration(graine, 80, 600)
    for l in n:
        l["Motif_Bonification"] = motif(l) if callable(motif) else motif
    return e, n


def _lancer(lignes_e, lignes_n):
    return lancer_affectation([construire_ecole(x) for x in lignes_e], [construire_enseignant(x) for x in lignes_n],
                              defaut())


def _postes(graine=3):
    e, n = construire_jeu_demonstration(graine, 40, 200)
    cfg = defaut()
    return n, construire_postes(enrichir_ecoles([construire_ecole(x) for x in e], cfg)), cfg


@pytest.mark.parametrize("graine", [1, 7])
def test_un_motif_sans_ecole_identifiee_ne_change_aucune_affectation(graine):
    e, n_sans = _lignes(graine, "")
    ref = _lancer(copy.deepcopy(e), n_sans)
    # Motifs de type reconnu mais sans école citée, ou d'un type non reconnu : aucun point.
    for motif in ("Rapprochement familial", "Raison de santé", "Convenances personnelles ECO001"):
        _, n = _lignes(graine, motif)
        res = _lancer(copy.deepcopy(e), n)
        assert res.affectations == ref.affectations, motif


def test_la_bonification_ne_va_qu_a_l_ecole_citee():
    lignes, postes, cfg = _postes()
    avec_postes = {p.id_etab for p in postes}
    ens = next(x for x in map(construire_enseignant, lignes)
               if sum(1 for v in x.voeux if v in avec_postes) >= 2)       # agent dont deux vœux ont des postes
    voeux = [v for v in ens.voeux if v]
    cible, autre = [v for v in voeux if v in avec_postes][:2]
    avec = dataclasses.replace(ens, motif_bonification=f"Rapprochement de conjoint à {cible}")
    sans = dataclasses.replace(ens, motif_bonification="")
    p_cible = next(p for p in postes if p.id_etab == cible)
    p_autre = next(p for p in postes if p.id_etab == autre)
    p_hors = next(p for p in postes if p.id_etab not in voeux)
    w4 = cfg["poids_score_appariement"]["Z4_ajustements"]
    bonus = cfg["ajustements_contextuels"]["bonification_ciblee"]
    assert score_enseignant_poste(avec, p_cible, cfg) == pytest.approx(score_enseignant_poste(sans, p_cible, cfg) + w4 * bonus)
    assert score_enseignant_poste(avec, p_autre, cfg) == score_enseignant_poste(sans, p_autre, cfg)
    assert score_enseignant_poste(avec, p_hors, cfg) == score_enseignant_poste(sans, p_hors, cfg)
    # Le détail du score nomme le point : Z4 contient la bonification.
    z4 = {c["code"]: c["valeur"] for c in detail_score(avec, p_cible, cfg)["composantes"]}["Z4_ajustements"]
    z4_sans = {c["code"]: c["valeur"] for c in detail_score(sans, p_cible, cfg)["composantes"]}["Z4_ajustements"]
    assert z4 - z4_sans == bonus


def test_la_bonification_change_l_affectation_d_un_agent_dans_le_moteur():
    e, n_sans = _lignes(5, "")
    ref = _lancer(copy.deepcopy(e), n_sans)
    # Chaque agent demande « rapprochement » vers son 3e vœu : les affectations de phase 1 doivent pouvoir changer.
    _, n_cible = _lignes(5, lambda l: f"Rapprochement de conjoint {l['Voeu_3']}" if l["Voeu_3"] else "")
    res = _lancer(copy.deepcopy(e), n_cible)
    assert res.affectations != ref.affectations


def test_reconnaissance_par_mot_entier():
    """Avec les vœux ECO1 et ECO12 et le motif « ECO12 », seule ECO12 est visée."""
    e, n = construire_jeu_demonstration(5, 30, 40)
    ens = construire_enseignant(n[0])
    ens = dataclasses.replace(ens, voeux=("ECO1", "ECO12", ""), motif_bonification="Rapprochement ECO12")
    assert ecole_bonifiee(ens) == "ECO12"
    assert ecole_bonifiee(dataclasses.replace(ens, motif_bonification="Rapprochement ECO123")) is None
    assert ecole_bonifiee(dataclasses.replace(ens, motif_bonification="Rapprochement eco1.")) == "ECO1"
    assert ecole_bonifiee(dataclasses.replace(ens, motif_bonification="ECO12")) is None          # type non reconnu
    assert ecole_bonifiee(dataclasses.replace(ens, motif_bonification="Suivi médical (ECO12)")) == "ECO12"
    assert ecole_bonifiee(dataclasses.replace(ens, motif_bonification="")) is None
    cfg = defaut()
    postes = construire_postes(enrichir_ecoles([construire_ecole(x) for x in e], cfg))
    a = dataclasses.replace(postes[0], id_etab="ECO1")
    b = dataclasses.replace(postes[1], id_etab="ECO12", commune=a.commune, departement=a.departement,
                            accessibilite=a.accessibilite, multigrade=a.multigrade, type_etab=a.type_etab, Up=a.Up)
    assert score_enseignant_poste(ens, b, cfg) > score_enseignant_poste(ens, a, cfg)


def test_ponctuation_francaise_et_identifiants_composes():
    """La revue de code a relevé des motifs bien formés mais non reconnus : guillemets, ! ? …, tiret final, barre."""
    e, n = construire_jeu_demonstration(5, 30, 40)
    base = dataclasses.replace(construire_enseignant(n[0]), voeux=("ECO001", "DRC/12", ""))
    for motif, attendu in (
        ("Rapprochement conjoint «ECO001»", "ECO001"),
        ("Rapprochement conjoint « ECO001 »", "ECO001"),
        ("conjoint ECO001!", "ECO001"),
        ("conjoint ECO001?", "ECO001"),
        ("conjoint ECO001…", "ECO001"),
        ("conjoint ECO001-", "ECO001"),
        ("conjoint ECO001.", "ECO001"),
        ("Rapprochement de conjoint à DRC/12", "DRC/12"),
        ("Rapprochement de conjoint DRC/13", None),
        ("Rapprochement de conjoint ECO0011", None),
    ):
        assert ecole_bonifiee(dataclasses.replace(base, motif_bonification=motif)) == attendu, motif


def test_le_rapport_de_qualite_signale_les_motifs_sans_ecole():
    etab = [{C.COL_ETAB_ID: "A"}, {C.COL_ETAB_ID: "B"}]
    ens = [{C.COL_ENS_ID: "M1", C.COL_ENS_ETAB: "A", C.COL_ENS_V1: "B", C.COL_ENS_MOTIF: "Rapprochement de conjoint B"},
           {C.COL_ENS_ID: "M2", C.COL_ENS_ETAB: "A", C.COL_ENS_V1: "B", C.COL_ENS_MOTIF: "Rapprochement familial"},
           {C.COL_ENS_ID: "M3", C.COL_ENS_ETAB: "A", C.COL_ENS_V1: "B", C.COL_ENS_MOTIF: ""}]
    rapport = controler(etab, ens, defaut())
    avert = {a["code"]: a for a in rapport["avertissements"]}
    assert avert["MOTIF_SANS_ECOLE"]["valeurs"] == ["M2"]


def test_la_configuration_garde_la_bonification():
    assert defaut()["ajustements_contextuels"]["bonification_ciblee"] == 20
    cfg, _ = valider({"ajustements_contextuels": {"bonification_ciblee": 25}})
    assert cfg["ajustements_contextuels"]["bonification_ciblee"] == 25
    with pytest.raises(ParametresInvalides):                       # les clés inconnues restent refusées
        valider({"ajustements_contextuels": {"inexistant": 1}})


def test_candidatures_portent_le_score_complet():
    e, n = construire_jeu_demonstration(2, 60, 400)
    cfg = defaut()
    res = lancer_affectation([construire_ecole(x) for x in e], [construire_enseignant(x) for x in n], cfg)
    lignes = an.candidatures(res.vers_dict(), cfg)
    assert lignes
    avec_detail = [l for l in lignes if l["detail_score"]]
    assert avec_detail and len(avec_detail) < len(lignes) + 1
    for l in avec_detail:
        d = l["detail_score"]
        assert set(d["composantes"]) == {"Z1_bareme_individu", "Z2_poids_poste_Up", "Z3_proximite", "Z4_ajustements"}
        w = cfg["poids_score_appariement"]
        assert d["total"] == pytest.approx(sum(w[k] * v for k, v in d["composantes"].items()), abs=1e-3)
        assert d["composantes"]["Z1_bareme_individu"] == pytest.approx(float(l["bareme"] or 0))
        assert d["ajustements_contextuels"] == pytest.approx(w["Z4_ajustements"] * d["composantes"]["Z4_ajustements"],
                                                             abs=1e-3)
    # Sans configuration, le calcul d'appariement est omis.
    assert all(l["detail_score"] is None for l in an.candidatures(res.vers_dict()))
    # École sans poste ouvert : pas de score.
    fermees = {e["id_etab"] if "id_etab" in e else e.get("ID_Etablissement") for e in res.etab_enrichi
               if not int(e.get("nb_postes_ouverts", 0) or 0)}
    assert all(l["detail_score"] is None for l in lignes if l["id_etab"] in fermees)


def test_tableau_explicatif_des_scores_somme_les_contributions():
    e, n = construire_jeu_demonstration(4, 60, 500)
    cfg = defaut()
    res = lancer_affectation([construire_ecole(x) for x in e], [construire_enseignant(x) for x in n], cfg)
    lignes = an.tableau_explicatif_scores(res.vers_dict(), cfg)
    assert lignes
    for l in lignes:
        assert l["score_final"] == pytest.approx(sum(l["contributions"].values()), abs=1e-3)
        w = l["poids"]
        assert l["contributions"]["Z4_ajustements"] == pytest.approx(w["Z4_ajustements"] * l["ajustements_contextuels"],
                                                                     abs=1e-3)
    # Cohérent avec l'explication d'une proposition isolée.
    une = next(a for a in res.affectations if a["id_ens"] == lignes[0]["id_ens"])
    expl = an.expliquer_proposition(res.vers_dict(), une["id_ens"], cfg)
    assert expl["score"]["total"] == lignes[0]["score_final"]
