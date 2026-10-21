"""Taux d'encadrement et turnover, avant l'algorithme et après."""
import pytest

from domaine.donnees.demonstration import construire_jeu_demonstration
from domaine.donnees.modeles import construire_ecole, construire_enseignant
from domaine.mobilite.analyses import comparer_encadrement_turnover
from domaine.mobilite.moteur import lancer_affectation
from domaine.parametrage.config import defaut

pytestmark = pytest.mark.django_db
B = "/api/v1/"


def _calcul(graine=3):
    lignes_e, lignes_n = construire_jeu_demonstration(graine, 90, 600)
    ecoles = [construire_ecole(l) for l in lignes_e]
    enseignants = [construire_enseignant(l) for l in lignes_n]
    cfg = defaut()
    res = lancer_affectation(ecoles, enseignants, cfg).vers_dict()
    return res, enseignants, cfg


def test_les_mouvements_ne_changent_pas_l_effectif_total():
    res, enseignants, cfg = _calcul()
    out = comparer_encadrement_turnover(res, enseignants, cfg)
    n = out["national"]
    assert res["affectations"], "le jeu doit produire des mouvements"
    assert n["enseignants_avant"] == n["enseignants_apres"]
    assert n["deplaces"] == len(res["affectations"])
    assert sum(r["enseignants_apres"] for r in out["par_region"]) == n["enseignants_apres"]
    assert sum(r["deplaces"] for r in out["par_region"]) == n["deplaces"]


def test_encadrement_s_ameliore_ou_reste_equilibre_region_par_region():
    res, enseignants, cfg = _calcul()
    out = comparer_encadrement_turnover(res, enseignants, cfg)
    n = out["national"]
    assert n["rem_avant"] == round(n["eleves"] / n["enseignants_avant"], 2)
    assert n["rem_apres"] == round(n["eleves"] / n["enseignants_apres"], 2)
    # Un mouvement interne à une région laisse le REM régional inchangé.
    internes = {r["territoire"]: r for r in out["par_region"]}
    assert all(r["enseignants_apres"] >= 0 for r in internes.values())


def test_turnover_avant_et_apres():
    res, enseignants, cfg = _calcul()
    n = comparer_encadrement_turnover(res, enseignants, cfg)["national"]
    seuil = cfg["seuils"]["anciennete_poste_recevabilite_ans"]
    recents = sum(1 for t in enseignants if (t.anciennete_poste or 0) < seuil)
    assert n["recents"] == recents and n["effectif"] == len(enseignants)
    assert n["turnover_avant"] == round(recents / len(enseignants), 4)
    assert n["turnover_apres"] == round((recents + n["deplaces"]) / len(enseignants), 4)
    assert n["turnover_apres"] >= n["turnover_avant"]


def test_sans_donnees_pas_de_division_par_zero():
    res = {"etab_enrichi": [], "affectations": [], "vivier": []}
    out = comparer_encadrement_turnover(res, [], defaut())
    assert out["national"]["rem_avant"] == 0.0 and out["national"]["turnover_apres"] == 0.0


def test_population_commune_effectif_connu():
    """Décision « Encadrement » (lot 4) : une école à l'effectif d'élèves inconnu est hors de l'agrégat, élèves
    et enseignants ensemble — mêmes écoles A/B/C et même résultat (50,0) que `rem_base` sur le même jeu, preuve
    que les deux fonctions, désormais branchées sur la même formule, s'accordent."""
    res = {"etab_enrichi": [
        {"Identifiant_Ecole": "A", "Region": "Centre", "Effectif_Eleves_Attendus": 200, "Enseignants_Actuels": 4,
         "effectif_connu": True},
        {"Identifiant_Ecole": "B", "Region": "Centre", "Effectif_Eleves_Attendus": 100, "Enseignants_Actuels": 2,
         "effectif_connu": True},
        {"Identifiant_Ecole": "C", "Region": "Centre", "Effectif_Eleves_Attendus": 0, "Enseignants_Actuels": 3,
         "effectif_connu": False},
    ], "affectations": [], "vivier": []}
    out = comparer_encadrement_turnover(res, [], defaut())
    n = out["national"]
    assert (n["eleves"], n["enseignants_avant"]) == (300, 6)        # C exclue des deux côtés, pas seulement élèves
    assert n["rem_avant"] == pytest.approx(50.0) and n["rem_apres"] == pytest.approx(50.0)


def test_route_encadrement(drh):
    c = drh
    r = c.post(B + "jeux/demonstration/", {}, content_type="application/json")
    assert r.status_code == 201, r.content
    jeu = r.json()["id"]
    sc = c.get(B + f"jeux/{jeu}/scenarios/").json()[0]
    r = c.get(B + f"jeux/{jeu}/scenarios/{sc['id']}/encadrement/")
    assert r.status_code == 200, r.content
    corps = r.json()
    assert corps["national"]["rem_avant"] > 0 and corps["par_region"]
