"""Nominations et arbitrage refusent un scénario obsolète : les règles ont changé, il faut recalculer d'abord."""
from pathlib import Path

import pytest

B = "/api/v1/"
DOSSIER = Path(__file__).resolve().parents[1] / "jeux_de_test" / "nominations"
pytestmark = pytest.mark.django_db


@pytest.fixture
def jeu(drh):
    def envoyer(nom, type_fichier):
        with open(DOSSIER / nom, "rb") as f:
            r = drh.post(B + "fichiers/", {"fichier": f, "type": type_fichier})
        assert r.status_code == 201, r.content
        return r.json()["id"]
    r = drh.post(B + "jeux/", {"fichier_etablissements": envoyer("etablissements.xlsx", "etablissements"),
                               "fichier_enseignants": envoyer("enseignants.xlsx", "enseignants"), "nom": "Obsolète"})
    assert r.status_code == 201, r.content
    return r.json()["id"]


def _post(c, chemin, corps):
    return c.post(B + chemin, corps, content_type="application/json")


def _rendre_obsolete(c, jeu):
    r = c.patch(B + f"jeux/{jeu}/parametres/", {"seuils": {"age_senior_ans": 52}}, content_type="application/json")
    assert r.status_code == 200 and r.json()["scenarios_obsoletes"] > 0


def test_decisions_acceptees_tant_que_le_scenario_est_a_jour(drh, jeu):
    r = _post(drh, f"jeux/{jeu}/nominations/generer/", {"annee": "N+1", "auteur": "Agent"})
    assert r.status_code == 200, r.content
    assert drh.get(B + f"jeux/{jeu}/nominations/synthese/").json()["scenario_obsolete"] is False


def test_nominations_et_arbitrage_refuses_sur_scenario_obsolete(drh, jeu):
    noms = _post(drh, f"jeux/{jeu}/nominations/generer/", {"annee": "N+1", "auteur": "Agent"}).json()
    assert noms["proposees"] > 0
    proposees = drh.get(B + f"jeux/{jeu}/nominations/", {"statut": "proposee", "taille": 5}).json()["resultats"]
    _rendre_obsolete(drh, jeu)

    synthese = drh.get(B + f"jeux/{jeu}/nominations/synthese/").json()
    assert synthese["scenario_obsolete"] is True            # bandeau côté interface
    refus = [
        _post(drh, f"jeux/{jeu}/nominations/generer/", {"annee": "N+1", "auteur": "Agent"}),
        _post(drh, f"jeux/{jeu}/nominations/{proposees[0]['id']}/valider/", {"reference": "DEC-1", "auteur": "A"}),
        _post(drh, f"jeux/{jeu}/nominations/lot/", {"action": "valider", "nominations": [proposees[0]["id"]]}),
        _post(drh, f"jeux/{jeu}/arbitrages/", {"id_ens": "MAT00001", "id_etab": "ECO001"}),
    ]
    for r in refus:
        assert r.status_code == 422, r.content
        assert r.json()["code"] == "scenario_obsolete" and "recalculez" in str(r.json()["motifs"])
    # Rejeter ou annuler reste possible : cela ne s'appuie pas sur les chiffres périmés.
    r = _post(drh, f"jeux/{jeu}/nominations/{proposees[0]['id']}/rejeter/", {"motif": "Plus d'actualité", "auteur": "A"})
    assert r.status_code == 200, r.content


def test_recalculer_leve_le_refus(drh, jeu):
    _rendre_obsolete(drh, jeu)
    assert _post(drh, f"jeux/{jeu}/nominations/generer/", {"annee": "N+1"}).status_code == 422
    assert drh.post(B + f"jeux/{jeu}/scenarios/base/").status_code in (200, 201)
    sc = next(s for s in drh.get(B + f"jeux/{jeu}/scenarios/").json() if s["code"] == "geo_departement")
    assert _post(drh, f"jeux/{jeu}/scenarios/{sc['id']}/executer/", {}).status_code in (200, 201)
    assert _post(drh, f"jeux/{jeu}/nominations/generer/", {"annee": "N+1"}).status_code == 200
