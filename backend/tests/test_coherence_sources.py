"""Une seule source : le même indicateur, pour le même jeu, le même périmètre et la même situation, a la même
valeur dans l'arbre territorial, le diagnostic plat et la synthèse territoriale (tableau de bord et exports)."""
import pytest

pytestmark = pytest.mark.django_db
B = "/api/v1/"


@pytest.fixture
def jeu(drh):
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 60, "nb_enseignants": 400}, content_type="application/json")
    assert r.status_code == 201, r.content
    return r.json()["id"]


def _noeuds(arbre, niveau):
    sortie = [arbre] if arbre["niveau"] == niveau else []
    for e in arbre["enfants"]:
        sortie += _noeuds(e, niveau)
    return sortie


def test_encadrement_identique_dans_l_arbre_le_diagnostic_et_la_synthese(drh, jeu):
    arbre = drh.get(B + f"jeux/{jeu}/territoires/arbre/").json()
    plat = drh.get(B + f"jeux/{jeu}/diagnostic/").json()["totaux"]
    synthese = drh.get(B + f"jeux/{jeu}/rapports/territorial/").json()
    national = synthese["noeud"]["encadrement"]
    assert arbre["totaux"]["eleves_par_enseignant_etat"] == plat["eleves_par_enseignant_etat"]
    # Après Prince : mêmes écoles, même population, même fonction -> même taux.
    assert national["apres_prince"]["taux"] == arbre["totaux"]["eleves_par_enseignant_etat"]
    for enfant in synthese["enfants"]:
        noeud = next(n for n in arbre["enfants"] if n["libelle"] == enfant["territoire"]["nom"])
        assert enfant["encadrement"]["apres_prince"]["taux"] == noeud["totaux"]["eleves_par_enseignant_etat"], \
            enfant["territoire"]["nom"]


def test_un_noeud_est_recalcule_sur_ses_ecoles_et_non_moyenne_de_ses_enfants(drh, jeu):
    arbre = drh.get(B + f"jeux/{jeu}/territoires/arbre/").json()
    regions = arbre["enfants"]
    assert regions
    assert sum(r["totaux"]["nb_ecoles"] for r in regions) == arbre["totaux"]["nb_ecoles"]
    assert sum(r["totaux"]["enseignants_en_poste"] for r in regions) == arbre["totaux"]["enseignants_en_poste"]
    assert sum(r["totaux"]["effectif_total_eleves"] or 0 for r in regions) == arbre["totaux"]["effectif_total_eleves"]
