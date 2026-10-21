"""Le texte de méthodologie affiché par l'application décrit ce que le moteur calcule (config.py, indicateurs.py, bareme.py)."""
from pathlib import Path

import pytest

from domaine.diagnostic.indicateurs import _niveau
from domaine.donnees.modeles import Enseignant
from domaine.mobilite.bareme import calculer_bareme, composantes_bareme
from domaine.parametrage.config import DEFAULT_CONFIG

TEXTE = (Path(__file__).resolve().parents[2] / "frontend" / "components" / "methodologie" / "domain"
         / "methodologie.ts").read_text(encoding="utf-8")


def _fr(x: float) -> str:
    """0.3 -> « 0,30 » ; 15 -> « 15 »."""
    return f"{x:.2f}".replace(".", ",") if x != int(x) else str(int(x))


def test_coefficients_du_poids_de_vulnerabilite():
    v = DEFAULT_CONFIG["vulnerabilite"]
    assert f"wp = {_fr(v['t1'])} × α + {_fr(v['t2'])} × σ" in TEXTE


def test_seuils_de_niveau_de_difficulte():
    assert _niveau(30) == 1 and _niveau(29.99) == 2 and _niveau(15) == 2 and _niveau(14.99) == 3
    assert "niveau 1 si wp ≥ 30, 2 si wp ≥ 15, sinon 3" in TEXTE


def test_poids_du_bareme_et_du_score():
    p = DEFAULT_CONFIG["poids_bareme_individuel"]
    assert ("barème = " + " + ".join(f"{_fr(p[k])} × C{i}" for i, k in enumerate(p, 1))) in TEXTE
    assert "Z1 = Z2 = Z3 = Z4 = 0,25" in TEXTE and set(DEFAULT_CONFIG["poids_score_appariement"].values()) == {0.25}


def test_proximite_et_ajustements():
    prox, adj = DEFAULT_CONFIG["points_proximite"], DEFAULT_CONFIG["ajustements_contextuels"]
    assert f"même commune {prox['meme_commune']} points, même département {prox['meme_departement']}" in TEXTE
    assert f"à classes multigrades + {adj['appui_multigrades_jeune']}" in TEXTE
    assert f"(IAEB, DREB, délégation) + {adj['senior_vers_encadrement']}" in TEXTE
    assert f"non multigrade + {adj['allegement_senior_standard']}" in TEXTE
    assert f"après 5 ans au poste + {adj['transition_rural_urbain']}" in TEXTE
    assert f"+ {adj['bonification_ciblee']} uniquement sur l'école visée" in TEXTE


def test_exemple_chiffre_du_bareme():
    """Marié de 42 ans, trois enfants, 18 ans de service dont 4 en zone 1, 9 ans au poste en zone 2, deux stages."""
    e = Enseignant(matricule="X", age=42, situation="Marié", enfants=3, anciennete_carriere=18, annees_zone_1=4,
                   annees_zone_2=9, anciennete_poste=9, formations=2)
    comp = composantes_bareme(e, DEFAULT_CONFIG)
    assert comp == {"C1_carriere_zone": 306, "C2_anciennete_poste": 9, "C3_charges_familiales": -1,
                    "C4_formation_continue": 4, "C5_cohorte_age": 8}
    assert calculer_bareme(e, DEFAULT_CONFIG) == pytest.approx(95.25)
    assert "barème de 95,25" in TEXTE
    assert "C2 = 5 dès 5 ans au poste + 1 par année au-delà de 5" in TEXTE


def test_le_texte_ne_promet_plus_ce_que_le_moteur_ne_fait_pas():
    assert "S = A + Z + B" not in TEXTE
    assert "raison de santé" not in TEXTE
