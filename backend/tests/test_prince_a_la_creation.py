"""Fichier des faits du Prince joint à la création du jeu : appliqué avant l'algorithme, en un seul calcul."""
from pathlib import Path

import pytest

pytestmark = pytest.mark.django_db
B = "/api/v1/"
DOSSIER = Path(__file__).resolve().parents[1] / "jeux_de_test" / "nominations"


def envoyer(c, nom, type_fichier, attendu=201):
    with open(DOSSIER / nom, "rb") as f:
        r = c.post(B + "fichiers/", {"fichier": f, "type": type_fichier})
    assert r.status_code == attendu, (nom, r.status_code, r.content[:500])
    return r.json()


def creer(c, **extra):
    e = envoyer(c, "etablissements.xlsx", "etablissements")
    n = envoyer(c, "enseignants.xlsx", "enseignants")
    return c.post(B + "jeux/", {"fichier_etablissements": e["id"], "fichier_enseignants": n["id"],
                                "nom": "Prince", **extra})


def test_colonnes_du_fichier_prince_reconnues(drh):
    p = envoyer(drh, "faits_prince.xlsx", "prince")
    assert p["correspondance"] == {"Matricule_Enseignant": "id_ens", "Identifiant_Ecole": "id_etab", "Motif": "motif"}
    assert p["colonnes_a_confirmer"] == []


def test_les_faits_du_prince_passent_avant_l_algorithme(drh):
    p = envoyer(drh, "faits_prince.xlsx", "prince")
    r = creer(drh, fichier_prince=p["id"])
    assert r.status_code == 201, r.content
    corps = r.json()
    assert [x["id_ens"] for x in corps["prince"]["acceptees"]] == ["MAT00229", "MAT00094"]
    assert len(corps["prince"]["refusees"]) == 3
    assert corps["nb_faits_prince"] == 2
    scenarios = drh.get(B + f"jeux/{corps['id']}/scenarios/").json()
    sc = next(s for s in scenarios if s["code"] == "geo_departement")
    aff = drh.get(B + f"jeux/{corps['id']}/scenarios/{sc['id']}/affectations/", {"phase": "effet_de_prince", "taille": 50})
    assert aff.status_code == 200, aff.content
    placements = {a["id_ens"]: a["id_etab"] for a in aff.json()["resultats"]}
    assert placements == {"MAT00229": "ECO011", "MAT00094": "ECO014"}


def test_sans_fichier_prince_aucun_fait(drh):
    r = creer(drh)
    assert r.status_code == 201, r.content
    assert "prince" not in r.json() and r.json()["nb_faits_prince"] == 0


def test_fichier_prince_d_un_mauvais_type_refuse(drh):
    e = envoyer(drh, "etablissements.xlsx", "etablissements")
    r = creer(drh, fichier_prince=e["id"])
    assert r.status_code == 422, r.content


def test_fichier_prince_reserve_au_drh(centre):
    p = envoyer(centre, "faits_prince.xlsx", "prince")
    r = creer(centre, fichier_prince=p["id"])
    assert r.status_code == 422, r.content
    assert r.json().get("code") == "prince_reserve_drh" or "DRH" in str(r.json())
