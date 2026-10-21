"""Une consultation ne crée jamais de scénario métier : connexion, rafraîchissement, tableau de bord, rapports,
comparaison — seuls la création du jeu et une demande explicite (`scenarios/base/`, `POST scenarios/`) en créent."""
import pytest

from contextes.simulation.models import Scenario

pytestmark = pytest.mark.django_db
B = "/api/v1/"

CONSULTATIONS = (
    "jeux/{j}/", "jeux/{j}/scenarios/", "jeux/{j}/diagnostic/", "jeux/{j}/territoires/arbre/", "jeux/{j}/synthese/",
    "jeux/{j}/rapport/", "jeux/{j}/rapports/territorial/", "jeux/{j}/comparaison/", "jeux/{j}/hypotheses/",
    "jeux/{j}/planification/", "jeux/{j}/priorites/",
)


def _jeu(drh):
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 120}, content_type="application/json")
    assert r.status_code == 201, r.content
    return r.json()["id"]


def test_consulter_ne_cree_aucun_scenario(drh):
    jeu = _jeu(drh)
    avant = sorted(Scenario.objects.values_list("pk", flat=True))
    assert len(avant) == 3                                  # les trois scénarios de base, créés avec le jeu
    for _ in range(2):                                      # deux « rafraîchissements »
        for chemin in CONSULTATIONS:
            r = drh.get(B + chemin.format(j=jeu))
            assert r.status_code in (200, 404), (chemin, r.status_code)
    assert sorted(Scenario.objects.values_list("pk", flat=True)) == avant


def test_lister_les_jeux_ne_cree_aucun_scenario(drh):
    _jeu(drh)
    avant = Scenario.objects.count()
    for _ in range(3):
        r = drh.get(B + "jeux/")
        assert r.status_code == 200
    assert Scenario.objects.count() == avant


def test_un_jeu_sans_scenario_est_signale_sans_en_creer(drh):
    jeu = _jeu(drh)
    Scenario.objects.filter(jeu_id=jeu).delete()            # le DRH a supprimé tous les scénarios
    for chemin in ("jeux/{j}/synthese/", "jeux/{j}/rapport/", "jeux/{j}/comparaison/"):
        r = drh.get(B + chemin.format(j=jeu))
        assert r.status_code in (200, 422), (chemin, r.status_code)
        assert Scenario.objects.filter(jeu_id=jeu).count() == 0, chemin
    r = drh.get(B + f"jeux/{jeu}/synthese/")
    assert r.status_code == 422 and r.json().get("code") == "aucun_scenario"
    # La création reste possible, sur demande explicite.
    assert drh.post(B + f"jeux/{jeu}/scenarios/base/").status_code == 201
    assert Scenario.objects.filter(jeu_id=jeu).count() == 3
