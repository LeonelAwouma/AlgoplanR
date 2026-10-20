"""Données absentes (âge, effectif d'élèves, salles), classes ouvertes et année scolaire du jeu."""
import datetime as dt
import io
from pathlib import Path

import pandas as pd
import pytest

from domaine.donnees import colonnes as C
from domaine.donnees.annee_scolaire import annee_scolaire_courante, normaliser_annee_scolaire
from domaine.donnees.modeles import construire_ecole, construire_enseignant
from domaine.donnees.validation import controles_validation
from domaine.diagnostic.indicateurs import calculer_indicateurs
from domaine.parametrage.config import defaut
from domaine.qualite.rapport import controler

B = "/api/v1/"
DOSSIER = Path(__file__).resolve().parents[1] / "jeux_de_test" / "nominations"


# --- domaine -------------------------------------------------------------------------------------------------------

def test_une_ecole_signale_ce_que_le_fichier_ne_donne_pas():
    complete = construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_NE: 120, C.COL_ETAB_SSF: 3, C.COL_ETAB_SDF: 0})
    assert complete.effectif_connu and complete.salles_connues
    sans = construire_ecole({C.COL_ETAB_ID: "B"})
    assert not sans.effectif_connu and not sans.salles_connues
    vide = construire_ecole({C.COL_ETAB_ID: "C", C.COL_ETAB_NE: "", C.COL_ETAB_SSF: None, C.COL_ETAB_SDF: ""})
    assert not vide.effectif_connu and not vide.salles_connues
    # Zéro renseigné n'est pas une donnée absente.
    zero = construire_ecole({C.COL_ETAB_ID: "D", C.COL_ETAB_NE: 0, C.COL_ETAB_SSF: 0})
    assert zero.effectif_connu and zero.salles_connues
    # Une seule des deux colonnes de salles suffit.
    assert construire_ecole({C.COL_ETAB_ID: "E", C.COL_ETAB_SDF: 2}).salles_connues


def test_le_calcul_numerique_reste_inchange_pour_une_ecole_sans_salles():
    sans = construire_ecole({C.COL_ETAB_ID: "B", C.COL_ETAB_NE: 250, C.COL_ETAB_EE: 2})
    ind = calculer_indicateurs(sans, defaut())
    assert ind.BMAX == 0 and ind.Ke == 0 and ind.be == 0      # BMAX = 0 reste 0 : pas d'invention
    assert not sans.salles_connues                             # mais l'école est signalée « capacité inconnue »


def test_classes_ouvertes_facultatives():
    assert construire_ecole({C.COL_ETAB_ID: "A"}).classes_ouvertes is None
    assert construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_CLASSES_OUVERTES: 7}).classes_ouvertes == 7
    assert construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_CLASSES_OUVERTES: ""}).classes_ouvertes is None
    d = construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_CLASSES_OUVERTES: 7}).vers_dict()
    assert d[C.COL_ETAB_CLASSES_OUVERTES] == 7 and d["effectif_connu"] is False and d["salles_connues"] is False


def test_un_age_suppose_n_est_plus_silencieux():
    assert construire_enseignant({C.COL_ENS_ID: "M", C.COL_ENS_AGE: 41}).age_connu is True
    absent = construire_enseignant({C.COL_ENS_ID: "M"})
    assert absent.age == 35.0 and absent.age_connu is False         # colonne absente : 35 ans supposés, signalés
    vide = construire_enseignant({C.COL_ENS_ID: "M", C.COL_ENS_AGE: ""})
    assert vide.age is None and vide.age_connu is False
    assert absent.vers_dict()["age_connu"] is False


def test_le_rapport_de_qualite_nomme_les_donnees_absentes():
    etab = [{C.COL_ETAB_ID: "A", C.COL_ETAB_EE: 3}, {C.COL_ETAB_ID: "B", C.COL_ETAB_EE: 2, C.COL_ETAB_NE: 100,
                                                    C.COL_ETAB_SSF: 4}]
    ens = [{C.COL_ENS_ID: "M1", C.COL_ENS_ETAB: "A"}, {C.COL_ENS_ID: "M2", C.COL_ENS_ETAB: "B"}]
    rapport = controler(etab, ens, defaut())
    codes = {a["code"]: a for a in rapport["avertissements"]}
    assert "ENS_AGE_ABSENT" in codes and "35 ans" in codes["ENS_AGE_ABSENT"]["message"]
    assert codes["ETAB_EFFECTIF_INCONNU"]["valeurs"] == ["A"]
    assert codes["ETAB_SALLES_INCONNUES"]["valeurs"] == ["A"]
    assert rapport["valide"]       # des avertissements, jamais un blocage
    complet = controler([{C.COL_ETAB_ID: "B", C.COL_ETAB_EE: 2, C.COL_ETAB_NE: 100, C.COL_ETAB_SSF: 4}],
                        [{C.COL_ENS_ID: "M2", C.COL_ENS_ETAB: "B", C.COL_ENS_AGE: 40}], defaut())
    assert not {"ENS_AGE_ABSENT", "ETAB_EFFECTIF_INCONNU", "ETAB_SALLES_INCONNUES"} & {
        a["code"] for a in complet["avertissements"]}


def test_la_validation_compte_les_donnees_vraiment_connues():
    ecoles = [construire_ecole({C.COL_ETAB_ID: "A"}), construire_ecole({C.COL_ETAB_ID: "B", C.COL_ETAB_NE: 90,
                                                                       C.COL_ETAB_SSF: 3})]
    ens = [construire_enseignant({C.COL_ENS_ID: f"M{i}", C.COL_ENS_ETAB: "B"}) for i in range(10)]   # âge absent
    controles = {c["code"]: c for c in controles_validation(ecoles, ens)}
    assert not controles["date_naissance"]["ok"] and "0 %" in controles["date_naissance"]["detail"]
    assert not controles["eleves"]["ok"] and "1 école" in controles["eleves"]["detail"]
    assert not controles["salles"]["ok"] and "1 école" in controles["salles"]["detail"]


def test_annee_scolaire():
    assert annee_scolaire_courante(dt.date(2026, 10, 20)) == "2026-2027"
    assert annee_scolaire_courante(dt.date(2027, 3, 1)) == "2026-2027"
    assert annee_scolaire_courante(dt.date(2027, 8, 15)) == "2027-2028"
    assert normaliser_annee_scolaire("2027/2028") == "2027-2028"
    assert normaliser_annee_scolaire(" 2027 - 2028 ") == "2027-2028"
    assert normaliser_annee_scolaire("") == annee_scolaire_courante()
    for mauvaise in ("2027", "2027-2029", "2028-2027", "abcd-efgh", "2027-28"):
        with pytest.raises(ValueError):
            normaliser_annee_scolaire(mauvaise)


# --- API -----------------------------------------------------------------------------------------------------------

def _classeur(nom, retirer=()):
    df = pd.read_excel(DOSSIER / nom).drop(columns=list(retirer))
    tampon = io.BytesIO()
    df.to_excel(tampon, index=False)
    tampon.seek(0)
    tampon.name = nom
    return tampon


def _envoyer(c, fichier, type_fichier):
    r = c.post(B + "fichiers/", {"fichier": fichier, "type": type_fichier})
    assert r.status_code == 201, r.content
    return r.json()["id"]


def _creer(c, retirer_etab=(), retirer_ens=(), **extra):
    e = _envoyer(c, _classeur("etablissements.xlsx", retirer_etab), "etablissements")
    n = _envoyer(c, _classeur("enseignants.xlsx", retirer_ens), "enseignants")
    return c.post(B + "jeux/", {"fichier_etablissements": e, "fichier_enseignants": n, "nom": "Manquantes", **extra})


@pytest.mark.django_db
def test_annee_scolaire_saisie_a_la_creation(drh):
    r = _creer(drh, annee_scolaire="2027-2028")
    assert r.status_code == 201, r.content
    jeu = r.json()
    assert jeu["annee_scolaire"] == "2027-2028"
    assert drh.get(B + f"jeux/{jeu['id']}/parametres/").json()["annee_scolaire"] == "2027-2028"
    assert any(j["annee_scolaire"] == "2027-2028" for j in drh.get(B + "jeux/").json())
    defaut_ = _creer(drh)
    assert defaut_.json()["annee_scolaire"] == annee_scolaire_courante()
    refus = _creer(drh, annee_scolaire="2027-2030")
    assert refus.status_code == 422 and refus.json()["code"] == "annee_scolaire_invalide"


@pytest.mark.django_db
def test_donnees_absentes_signalees_jusqu_a_l_api(drh):
    r = _creer(drh, retirer_etab=[C.COL_ETAB_NE, C.COL_ETAB_SSF, C.COL_ETAB_SDF], retirer_ens=[C.COL_ENS_AGE])
    assert r.status_code == 201, r.content
    jeu = r.json()
    codes = {a["code"] for a in jeu["qualite"]["avertissements"]}
    assert {"ENS_AGE_ABSENT", "ETAB_EFFECTIF_INCONNU", "ETAB_SALLES_INCONNUES"} <= codes
    from contextes.donnees import depots
    from contextes.donnees.models import JeuDeDonnees
    j = JeuDeDonnees.objects.get(id=jeu["id"])
    assert all(not e.effectif_connu and not e.salles_connues for e in depots.charger_ecoles(j))
    assert all(not t.age_connu and t.age == 35.0 for t in depots.charger_enseignants(j))
    # Les contrôles de validation ne les comptent plus comme « connus ».
    controles = {c["code"]: c for c in drh.get(B + f"jeux/{jeu['id']}/validation/").json()["controles"]}
    assert not controles["date_naissance"]["ok"] and not controles["eleves"]["ok"] and not controles["salles"]["ok"]


@pytest.mark.django_db
def test_classes_ouvertes_importees(drh):
    df = pd.read_excel(DOSSIER / "etablissements.xlsx")
    df["Classes_Ouvertes"] = [(i % 7) + 1 for i in range(len(df))]
    tampon = io.BytesIO()
    df.to_excel(tampon, index=False)
    tampon.seek(0)
    tampon.name = "etablissements.xlsx"
    e = _envoyer(drh, tampon, "etablissements")
    n = _envoyer(drh, _classeur("enseignants.xlsx"), "enseignants")
    r = drh.post(B + "jeux/", {"fichier_etablissements": e, "fichier_enseignants": n, "nom": "Classes"})
    assert r.status_code == 201, r.content
    from contextes.donnees import depots
    from contextes.donnees.models import JeuDeDonnees
    ecoles = depots.charger_ecoles(JeuDeDonnees.objects.get(id=r.json()["id"]))
    assert [e.classes_ouvertes for e in ecoles[:3]] == [1, 2, 3]
