"""`domaine/mobilite/projection.py` est obsolète : plus aucune fonctionnalité de production ne dépend de ses constantes.

Le module est conservé tel quel (parité avec le moteur d'origine, `test_parite.py`) ; ses résultats appliquent un taux
d'attrition fixe de 2 %, alors que la planification lit le taux des hypothèses versionnées du jeu.
"""
import io
import zipfile
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parent.parent
pytestmark = pytest.mark.django_db
B = "/api/v1/"


def test_seul_le_moteur_d_affectation_importe_la_projection_obsolete():
    importeurs = []
    for chemin in RACINE.rglob("*.py"):
        relatif = chemin.relative_to(RACINE).as_posix()
        if relatif.startswith(("tests/", ".venv/", "staticfiles/")) or relatif.endswith("mobilite/projection.py"):
            continue
        source = chemin.read_text(encoding="utf-8")
        if "generer_projections_n3" in source or "mobilite.projection" in source or "TAUX_ATTRITION" in source:
            importeurs.append(relatif)
    assert importeurs == ["domaine/mobilite/moteur.py"]


def test_les_sorties_de_production_ne_portent_plus_les_constantes_obsoletes(drh):
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 30, "nb_enseignants": 200}, content_type="application/json")
    jeu = r.json()["id"]
    sid = [s for s in drh.get(B + f"jeux/{jeu}/scenarios/").json() if s["code"] == "geo_region"][0]["id"]
    rapport = drh.get(B + f"jeux/{jeu}/rapport/", {"scenario": sid}).json()
    assert "projections" not in rapport
    x = drh.get(B + f"jeux/{jeu}/scenarios/{sid}/export/")
    assert x.status_code == 200
    with zipfile.ZipFile(io.BytesIO(x.content)) as z:
        classeur = z.read("xl/workbook.xml").decode("utf-8")
    assert "Projections_N_a_N3" not in classeur
