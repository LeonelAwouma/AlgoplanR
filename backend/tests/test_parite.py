"""Parité stricte avec le moteur d'origine (tests/reference/app_algoplanr_origine.py)."""
import copy
import importlib.util
import os
from pathlib import Path

import pytest

pd = pytest.importorskip("pandas")
from domaine.donnees.demonstration import construire_jeu_demonstration
from domaine.donnees.modeles import construire_ecole, construire_enseignant
from domaine.mobilite.moteur import lancer_affectation
from domaine.parametrage.config import defaut

REF = Path(__file__).parent / "reference" / "app_algoplanr_origine.py"


@pytest.fixture(scope="module")
def legacy():
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    spec = importlib.util.spec_from_file_location("legacy_algoplanr", REF)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _comparer(legacy, graine, nb_e, nb_n, prince=None, cfg=None):
    cfg = cfg or defaut()
    e, n = construire_jeu_demonstration(graine, nb_e, nb_n)
    mien = lancer_affectation([construire_ecole(x) for x in e], [construire_enseignant(x) for x in n],
                              copy.deepcopy(cfg), faits_prince=prince)
    ref = legacy.run_affectation(pd.DataFrame(e), pd.DataFrame(n), copy.deepcopy(cfg), affectations_prince=prince)
    la = ref["affectations"]
    a_ref = [(a.id_ens, a.id_poste, a.phase, a.score_affectation) for a in la.itertuples()] if len(la) else []
    a_moi = [(a["id_ens"], a["id_poste"], a["phase"], a["score_affectation"]) for a in mien.affectations]
    assert a_moi == a_ref
    for k, v in ref["synthese"].items():
        assert mien.synthese[k] == v, k
    assert mien.projections_n3 == ref["projections_n3"].to_dict("records")
    assert [r["id_poste"] for r in mien.postes_non_pourvus] == list(ref["postes_non_pourvus"]["id_poste"])
    assert [r["Matricule_Enseignant"] for r in mien.non_affectes] == list(ref["non_affectes"]["Matricule_Enseignant"])
    return mien


@pytest.mark.parametrize("graine", [1, 2, 3, 2026, 77])
def test_parite_sans_prince(legacy, graine):
    _comparer(legacy, graine, 80, 900)


def test_parite_avec_faits_du_prince(legacy):
    e, n = construire_jeu_demonstration(5, 80, 900)
    cfg = defaut()
    base = lancer_affectation([construire_ecole(x) for x in e], [construire_enseignant(x) for x in n], cfg)
    vivier = [v["Matricule_Enseignant"] for v in base.vivier][:4]
    prince = [{"id_ens": vivier[0], "id_etab": "ECO001", "motif": "Test"},
              {"id_ens": vivier[1], "id_etab": "ECO002", "motif": "Test"},
              {"id_ens": "INCONNU", "id_etab": "ECO003", "motif": "x"}]
    res = _comparer(legacy, 5, 80, 900, prince=prince)
    assert res.synthese["effet_de_prince"] >= 1


def test_parite_phases_desactivees(legacy):
    cfg = defaut()
    cfg["regles_dreb"]["phase3_extension_regionale"] = False
    cfg["regles_dreb"]["phase2_proximite_iaeb"] = False
    _comparer(legacy, 9, 60, 700, cfg=cfg)
