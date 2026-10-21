"""API de la synthèse territoriale (sous-lot 4.6) : GET jeux/{jeu}/rapports/territorial/."""
import pytest

pytestmark = pytest.mark.django_db
B = "/api/v1/"
CODES_REGISTRE = {"encadrement", "couverture_globale", "couverture_operationnelle", "couverture_parec",
                  "attrition", "alea"}


@pytest.fixture
def c(drh):
    return drh


@pytest.fixture
def jeu(c):
    r = c.post(B + "jeux/demonstration/", {"nb_ecoles": 40, "nb_enseignants": 300}, content_type="application/json")
    assert r.status_code == 201, r.content
    return r.json()["id"]


def get(c, url, **kw):
    r = c.get(B + url, kw)
    assert r.status_code == 200, (url, r.status_code, r.content[:500])
    return r.json()


def _verifier_forme_indicateurs(bloc: dict):
    assert set(bloc["encadrement"]) >= {"import", "apres_prince", "apres_simulation", "n1", "n5", "ecart_n5_import"}
    assert set(bloc["couverture_globale"]) >= {"import", "apres_prince", "apres_simulation", "n1", "n5"}
    assert set(bloc["couverture_operationnelle"]) == {"apres_simulation"}      # jamais de N+k (E10, par construction)
    assert set(bloc["couverture_parec"]) >= {"import", "apres_prince", "apres_simulation", "n1", "n5"}
    assert set(bloc["alea"]) == {"import", "apres_prince", "apres_simulation"}
    for situation in ("import", "apres_prince", "apres_simulation"):
        a = bloc["alea"][situation]
        assert set(a) == {"valeur", "statut", "raison"}
        assert a["statut"] in ("non_calculable", "indicatif", "normal")
        if a["statut"] == "non_calculable":
            assert a["valeur"] is None and a["raison"]
    for cle in ("encadrement", "couverture_globale", "couverture_parec"):
        for situation, v in bloc[cle].items():
            if situation == "ecart_n5_import":
                continue
            assert set(v) == {"numerateur", "denominateur", "taux", "statut", "raison"}
            if v["statut"] == "sans_objet":
                assert v["taux"] is None and v["raison"]
            elif v["taux"] is not None:
                assert v["taux"] >= 0


def test_national_forme_et_registre(c, jeu):
    r = get(c, f"jeux/{jeu}/rapports/territorial/")
    assert r["niveau"] == "national" and r["niveau_enfants"] == "region"
    assert {x["code"] for x in r["registre_indicateurs"]} == CODES_REGISTRE
    _verifier_forme_indicateurs(r["noeud"])
    assert r["enfants"], "le national doit lister des régions"
    noms = [e["territoire"]["nom"] for e in r["enfants"]]
    assert noms == sorted(set(noms), key=lambda n: n)  # trié (vérifié plus précisément ci-dessous avec cle_tri_fr
    for e in r["enfants"]:
        assert e["libelle_niveau"] == "Région"
        _verifier_forme_indicateurs(e)
    # Le national et la somme de ses régions doivent porter sur le même total d'écoles.
    assert r["noeud"]["nb_ecoles"] == sum(e["nb_ecoles"] for e in r["enfants"])


def test_somme_sur_somme_jamais_moyenne_des_enfants(c, jeu):
    """Le nœud national n'est pas une moyenne des taux régionaux : reconstruit à la main depuis les enfants, le
    numérateur et le dénominateur du national doivent être la somme exacte de ceux des régions."""
    r = get(c, f"jeux/{jeu}/rapports/territorial/")
    for cle, situations in (("couverture_globale", ("apres_simulation",)),
                            ("couverture_operationnelle", ("apres_simulation",)),
                            ("couverture_parec", ("apres_simulation",))):
        for s in situations:
            total_num = sum(e[cle][s]["numerateur"] for e in r["enfants"])
            total_den = sum(e[cle][s]["denominateur"] for e in r["enfants"])
            assert r["noeud"][cle][s]["numerateur"] == pytest.approx(total_num, abs=0.01)
            assert r["noeud"][cle][s]["denominateur"] == pytest.approx(total_den, abs=0.01)


def test_drill_region_puis_departement_puis_arrondissement_puis_ecole(c, jeu):
    national = get(c, f"jeux/{jeu}/rapports/territorial/")
    region = national["enfants"][0]["territoire"]["region"]
    r = get(c, f"jeux/{jeu}/rapports/territorial/", region=region)
    assert r["niveau"] == "region" and r["niveau_enfants"] == "departement"
    assert all(e["libelle_niveau"] == "Département" for e in r["enfants"])
    assert r["enfants"], "la région doit lister des départements"

    departement = r["enfants"][0]["territoire"]["departement"]
    r = get(c, f"jeux/{jeu}/rapports/territorial/", region=region, departement=departement)
    assert r["niveau"] == "departement" and r["niveau_enfants"] == "commune"
    assert all(e["libelle_niveau"] == "Arrondissement" for e in r["enfants"])  # décision « Arrondissement » = commune

    commune = r["enfants"][0]["territoire"]["commune"]
    r = get(c, f"jeux/{jeu}/rapports/territorial/", region=region, departement=departement, commune=commune)
    assert r["niveau"] == "commune" and r["niveau_enfants"] == "ecole"
    assert r["libelle_niveau"] == "Arrondissement"
    assert all(e["libelle_niveau"] == "École" for e in r["enfants"])
    _verifier_forme_indicateurs(r["noeud"])

    ecole = r["enfants"][0]
    # Une école isolée : son propre degré d'aléa est non calculable (moins de 3 écoles).
    assert ecole["alea"]["apres_simulation"]["statut"] == "non_calculable"
    assert ecole["alea"]["apres_simulation"]["valeur"] is None


def test_attrition_reference_m1_national_et_regional_seulement(c, jeu):
    national = get(c, f"jeux/{jeu}/rapports/territorial/")
    assert national["noeud"]["attrition"]["reference_m1"]["attrition_totale_pct"] == pytest.approx(3.33)
    region = national["enfants"][0]
    assert region["attrition"]["reference_m1"] is not None
    for annee in region["attrition"]["annees"].values():
        assert annee["origine"] in ("hypothese_nationale", "hypothese_regionale", "hypothese_sous_systeme")

    departement = get(c, f"jeux/{jeu}/rapports/territorial/", region=region["territoire"]["region"])["enfants"][0]
    assert departement["attrition"]["reference_m1"] is None
    assert "héritée" in departement["attrition"]["note"]


def test_delegue_restreint_a_sa_region(centre):
    jeu = centre.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 150},
                      content_type="application/json").json()["id"]
    r = get(centre, f"jeux/{jeu}/rapports/territorial/", region="Littoral")  # ignoré : région imposée au compte
    assert r["niveau"] == "region" and r["titre"] == "Centre"
    assert r["niveau_enfants"] == "departement"
    assert all(e["territoire"]["region"] == "Centre" for e in r["enfants"])


def test_sans_session_refuse(jeu):
    from django.test import Client

    r = Client().get(B + f"jeux/{jeu}/rapports/territorial/")
    assert r.status_code == 401
