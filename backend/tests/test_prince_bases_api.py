"""API du prétraitement du Prince : application aux bases, essai à blanc, bases consultables et classeurs Excel."""
import io
from pathlib import Path

import pandas as pd
import pytest

from contextes.donnees.lecteur import lire_classeur_numerote

pytestmark = pytest.mark.django_db
B = "/api/v1/"
DOSSIER = Path(__file__).resolve().parents[1] / "jeux_de_test" / "nominations"


def _envoyer(c, nom, type_fichier):
    with open(DOSSIER / nom, "rb") as f:
        r = c.post(B + "fichiers/", {"fichier": f, "type": type_fichier})
    assert r.status_code == 201, (nom, r.content[:300])
    return r.json()


def _creer_jeu(c, avec_prince):
    e = _envoyer(c, "etablissements.xlsx", "etablissements")
    n = _envoyer(c, "enseignants.xlsx", "enseignants")
    extra = {"fichier_prince": _envoyer(c, "faits_prince.xlsx", "prince")["id"]} if avec_prince else {}
    r = c.post(B + "jeux/", {"fichier_etablissements": e["id"], "fichier_enseignants": n["id"], "nom": "Prince", **extra})
    assert r.status_code == 201, r.content
    return r.json()["id"]


@pytest.fixture
def jeu_avec(drh):
    return _creer_jeu(drh, True)


@pytest.fixture
def jeu_sans(drh):
    return _creer_jeu(drh, False)


def _get(c, url, **q):
    r = c.get(B + url, q)
    assert r.status_code == 200, (url, r.status_code, r.content[:400])
    return r


def test_application_resume_et_decisions(drh, jeu_avec):
    a = _get(drh, f"jeux/{jeu_avec}/faits-prince/application/").json()
    assert a["resume"]["appliquees"] == 2 and a["resume"]["rejetees"] == 0
    assert {d["Matricule_Enseignant"]: d["Ecole_Destination"] for d in a["decisions"]} == {
        "MAT00229": "ECO011", "MAT00094": "ECO014"}
    assert a["avant"]["enseignants"] == a["apres"]["enseignants"]                 # on déplace, on ne crée personne
    d = a["decisions"][0]
    assert d["Enseignants_Origine_Apres"] == d["Enseignants_Origine_Avant"] - 1
    assert d["Enseignants_Destination_Apres"] == d["Enseignants_Destination_Avant"] + 1


def test_sans_fait_les_bases_sont_celles_de_l_import(drh, jeu_sans):
    a = _get(drh, f"jeux/{jeu_sans}/faits-prince/application/").json()
    assert a["resume"] == {"identifiees": 0, "appliquees": 0, "avec_alerte": 0, "rejetees": 0}
    assert a["avant"] == a["apres"] and a["decisions"] == []
    tout = _get(drh, f"jeux/{jeu_sans}/faits-prince/bases/etablissements/", taille=1000).json()
    assert tout["count"] > 0
    assert all(l["Enseignants_Avant_Prince"] == l["Enseignants_Apres_Prince"] for l in tout["resultats"])
    assert _get(drh, f"jeux/{jeu_sans}/faits-prince/bases/etablissements/", concernes=1).json()["count"] == 0


def test_bases_consultables_filtre_concernes(drh, jeu_avec):
    ecoles = _get(drh, f"jeux/{jeu_avec}/faits-prince/bases/etablissements/", concernes=1, taille=50).json()
    par_id = {l["Identifiant_Ecole"]: l for l in ecoles["resultats"]}
    assert ecoles["count"] == len(par_id) <= 4 and {"ECO011", "ECO014"} <= set(par_id)
    assert par_id["ECO011"]["Enseignants_Apres_Prince"] == par_id["ECO011"]["Enseignants_Avant_Prince"] + 1
    assert par_id["ECO011"]["Touche_Par_Prince"] == "OUI"
    assert par_id["ECO011"]["Enseignants_Actuels"] == par_id["ECO011"]["Enseignants_Apres_Prince"]

    ens = _get(drh, f"jeux/{jeu_avec}/faits-prince/bases/enseignants/", concernes=1).json()
    lignes = {l["Matricule_Enseignant"]: l for l in ens["resultats"]}
    assert set(lignes) == {"MAT00229", "MAT00094"}
    assert lignes["MAT00229"]["Ecole_Attache_Actuelle"] == "ECO011"             # base réimportable : école après
    assert lignes["MAT00229"]["Ecole_Affectation_Prince"] == "ECO011"
    assert lignes["MAT00229"]["Ecole_Origine_Prince"] not in ("", "ECO011")
    assert lignes["MAT00229"]["Statut_Prince"].startswith("Appliquée")

    toute = _get(drh, f"jeux/{jeu_avec}/faits-prince/bases/enseignants/", taille=500).json()
    assert toute["count"] > 2
    chercher = _get(drh, f"jeux/{jeu_avec}/faits-prince/bases/enseignants/", q="MAT00094").json()
    assert [l["Matricule_Enseignant"] for l in chercher["resultats"]] == ["MAT00094"]


def test_base_inconnue_refusee(drh, jeu_avec):
    assert drh.get(B + f"jeux/{jeu_avec}/faits-prince/bases/autre/").status_code == 422


def test_apercu_ne_modifie_rien(drh, jeu_sans):
    avant = _get(drh, f"jeux/{jeu_sans}/faits-prince/application/").json()
    with open(DOSSIER / "faits_prince.xlsx", "rb") as f:
        r = drh.post(B + f"jeux/{jeu_sans}/faits-prince/import/?apercu=1", {"fichier": f})
    assert r.status_code == 200, r.content
    corps = r.json()
    assert [x["id_ens"] for x in corps["bilan"]["acceptees"]] == ["MAT00229", "MAT00094"]
    assert len(corps["bilan"]["refusees"]) == 3
    assert corps["application"]["resume"]["appliquees"] == 2
    assert all(d["Nouvelle"] for d in corps["application"]["decisions"])
    # Rien n'a été enregistré.
    assert _get(drh, f"jeux/{jeu_sans}/faits-prince/").json() == []
    assert _get(drh, f"jeux/{jeu_sans}/faits-prince/application/").json() == avant
    # La validation, elle, enregistre les mêmes faits.
    with open(DOSSIER / "faits_prince.xlsx", "rb") as f:
        r = drh.post(B + f"jeux/{jeu_sans}/faits-prince/import/", {"fichier": f})
    assert r.status_code == 200 and len(r.json()["acceptees"]) == 2
    assert _get(drh, f"jeux/{jeu_sans}/faits-prince/application/").json()["resume"]["appliquees"] == 2


def test_annuler_un_fait_restitue_la_base(drh, jeu_avec):
    faits = _get(drh, f"jeux/{jeu_avec}/faits-prince/").json()
    for f in faits:
        assert drh.delete(B + f"jeux/{jeu_avec}/faits-prince/{f['id']}/").status_code == 204
    a = _get(drh, f"jeux/{jeu_avec}/faits-prince/application/").json()
    assert a["resume"]["identifiees"] == 0
    assert _get(drh, f"jeux/{jeu_avec}/faits-prince/bases/enseignants/", concernes=1).json()["count"] == 0


@pytest.mark.parametrize("nom, fichier, feuille, cle", [
    ("etablissements", "etablissements_apres_prince.xlsx", "Etablissements", "Identifiant_Ecole"),
    ("enseignants", "enseignants_apres_prince.xlsx", "Enseignants", "Matricule_Enseignant"),
    ("journal", "rapport_application_prince.xlsx", "Decisions_Prince", "Matricule_Enseignant"),
])
def test_classeurs_exportes(drh, jeu_avec, nom, fichier, feuille, cle):
    r = _get(drh, f"jeux/{jeu_avec}/faits-prince/bases/{nom}/export/")
    assert fichier in r["Content-Disposition"] and r.content[:2] == b"PK"
    feuilles = pd.read_excel(io.BytesIO(r.content), sheet_name=None, dtype=str)
    assert list(feuilles)[:2] == [feuille, "Information"]
    assert "n'est pas une décision administrative" in " ".join(feuilles["Information"]["Valeur"].astype(str)).replace("’", "'")
    assert not feuilles[feuille].empty
    # Les identifiants restent des textes, tels quels.
    assert feuilles[feuille][cle].str.len().min() > 0


def test_les_deux_bases_se_reimportent(drh, jeu_avec):
    """Les colonnes officielles sont conservées en tête : la base après Prince se relit comme une base importée."""
    attendues = {"etablissements": ("Identifiant_Ecole", "Enseignants_Actuels", "Effectif_Eleves_Attendus"),
                 "enseignants": ("Matricule_Enseignant", "Ecole_Attache_Actuelle", "Anciennete_Poste_Actuel")}
    for nom, colonnes in attendues.items():
        octets = drh.get(B + f"jeux/{jeu_avec}/faits-prince/bases/{nom}/export/").content
        _, _, entetes, lignes, _ = lire_classeur_numerote(octets, f"{nom}.xlsx", None)
        assert lignes and set(colonnes) <= set(entetes)
