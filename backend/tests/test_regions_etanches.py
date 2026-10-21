"""Règle des régions : un enseignant n'est affecté que dans sa région, les autres restent dans le vivier."""
import copy

import pytest

from domaine.acces.regions import cle_region
from domaine.donnees.demonstration import construire_jeu_demonstration
from domaine.donnees.modeles import construire_ecole, construire_enseignant
from domaine.mobilite import moteur
from domaine.mobilite.moteur import MOTIF_HORS_REGION, choisir_meilleur_poste, lancer_affectation
from domaine.mobilite.selection import IndexPostes
from domaine.parametrage.config import defaut
from tests.test_selection import _situation

PHASES_HUMAINES = ("effet_de_prince", "arbitrage_commission")


def _jeu(graine=3, nb_e=90, nb_n=600):
    lignes_e, lignes_n = construire_jeu_demonstration(graine, nb_e, nb_n)
    return [construire_ecole(l) for l in lignes_e], [construire_enseignant(l) for l in lignes_n]


@pytest.mark.parametrize("graine", [1, 7, 2026])
def test_selection_rapide_identique_avec_regions_etanches(graine):
    cfg = defaut()
    postes, vivier, rnd = _situation(graine, cfg)
    index = IndexPostes(postes)
    for contraintes in ({"contrainte_iaeb": True}, {"contrainte_dept": True}, {}):
        for e in vivier:
            libres = [p for p in postes if not p.pourvu]
            attendu = choisir_meilleur_poste(e, libres, cfg, meme_region=True, **contraintes)
            obtenu = index.meilleur(e, cfg, meme_region=True, **contraintes)
            assert obtenu is attendu, (e.matricule, contraintes)
            if obtenu is not None:
                assert cle_region(obtenu.region) == cle_region(e.region_attache)
                if rnd.random() < 0.5:
                    obtenu.pourvu = True


def test_aucune_affectation_hors_region():
    ecoles, enseignants = _jeu()
    res = lancer_affectation(ecoles, enseignants, defaut())
    assert res.affectations
    for a in res.affectations:
        assert cle_region(a["region_poste"]) == cle_region(a["region_origine"]), a["id_ens"]


def test_hors_region_retombe_dans_le_vivier():
    """Sans la règle, des mouvements traversent les régions ; avec elle, ces enseignants restent non affectés."""
    ecoles, enseignants = _jeu()
    libre = defaut()
    libre["regles_dreb"]["regions_etanches"] = False
    sans_regle = lancer_affectation(copy.deepcopy(ecoles), copy.deepcopy(enseignants), libre)
    traverses = {a["id_ens"] for a in sans_regle.affectations
                 if cle_region(a["region_poste"]) != cle_region(a["region_origine"])}
    assert traverses, "le jeu de démonstration doit produire des mouvements interrégionaux sans la règle"

    avec_regle = lancer_affectation(copy.deepcopy(ecoles), copy.deepcopy(enseignants), defaut())
    non_affectes = {n["Matricule_Enseignant"]: n for n in avec_regle.non_affectes}
    assert all(cle_region(a["region_poste"]) == cle_region(a["region_origine"]) for a in avec_regle.affectations)
    # Au moins un enseignant écarté est signalé : un poste l'attend dans une autre région (commission).
    assert any(n.get("motif_non_affectation") == MOTIF_HORS_REGION for n in non_affectes.values())


def test_prince_et_commission_peuvent_traverser_les_regions():
    ecoles, enseignants = _jeu()
    base = lancer_affectation(copy.deepcopy(ecoles), copy.deepcopy(enseignants), defaut())
    cible = None
    for v in base.vivier:
        autre = next((e for e in ecoles if cle_region(e.region) != cle_region(v["region_attache"])), None)
        if autre is not None:
            cible = (v["Matricule_Enseignant"], autre.id)
            break
    assert cible
    res = lancer_affectation(ecoles, enseignants, defaut(),
                             faits_prince=[{"id_ens": cible[0], "id_etab": cible[1], "motif": "test"}])
    prince = [a for a in res.affectations if a["phase"] == "effet_de_prince"]
    assert prince and prince[0]["region_poste"] != prince[0]["region_origine"]


def test_selection_rapide_et_lente_identiques_dans_le_moteur():
    args = (*_jeu(11, 90, 600), defaut())
    rapide = lancer_affectation(*copy.deepcopy(args))
    moteur.SELECTION_RAPIDE = False
    try:
        lente = lancer_affectation(*copy.deepcopy(args))
    finally:
        moteur.SELECTION_RAPIDE = True
    assert rapide.affectations == lente.affectations
    assert rapide.postes_non_pourvus == lente.postes_non_pourvus


def test_invariant_region_verifie_et_signale_une_violation():
    from domaine.mobilite.analyses import verifier_invariants

    ecoles, enseignants = _jeu()
    res = lancer_affectation(ecoles, enseignants, defaut()).vers_dict()
    region = next(i for i in verifier_invariants(res) if i["code"] == "REGION")
    assert region["ok"] and res["synthese"]["regions_etanches"] is True
    # Une affectation automatique qui traverserait les régions serait signalée.
    fautive = next(a for a in res["affectations"] if a["phase"] not in ("effet_de_prince", "arbitrage_commission"))
    fautive["region_poste"] = "Ailleurs"
    region = next(i for i in verifier_invariants(res) if i["code"] == "REGION")
    assert not region["ok"] and fautive["id_ens"] in region["details"]
