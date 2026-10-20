"""Routes reliées depuis codeSource : scénario retenu, planification sur cinq ans, quotas, versions, journal d'audit.

Parcours joué par le DRH sur un jeu de démonstration national, comme tests/test_api.py.
"""
import pytest

pytestmark = pytest.mark.django_db
B = "/api/v1/"
ANNEES = ["N+1", "N+2", "N+3", "N+4", "N+5"]


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


def envoyer(c, methode, url, corps=None, attendu=200):
    r = getattr(c, methode)(B + url, corps or {}, content_type="application/json")
    assert r.status_code == attendu, (url, r.status_code, r.content[:500])
    return r.json() if r.content else None


def retenir(c, jeu):
    sc = next(s for s in get(c, f"jeux/{jeu}/scenarios/") if s["code"] == "geo_departement")
    j = envoyer(c, "put", f"jeux/{jeu}/scenario-retenu/", {"scenario": str(sc["id"])})
    assert j["scenario_retenu_id"] == str(sc["id"])
    return sc["id"]


def test_scenario_retenu_et_sante(c, jeu):
    assert get(c, f"jeux/{jeu}/")["scenario_retenu_id"] is None
    envoyer(c, "put", f"jeux/{jeu}/scenario-retenu/", {"scenario": "999"}, attendu=422)
    sid = retenir(c, jeu)
    assert get(c, f"jeux/{jeu}/planification/etat/")["scenario_retenu_id"] == str(sid)
    evts = get(c, f"jeux/{jeu}/journal-audit/", type="scenario_retenu")["resultats"]
    assert evts and evts[0]["objet"] == {"type": "scenario", "id": str(sid)}
    detail = get(c, f"jeux/{jeu}/journal-audit/{evts[0]['id']}/")
    assert detail["apres"] == {"scenario": str(sid)}


def test_hypotheses_versionnees(c, jeu):
    defaut = get(c, "hypotheses/defaut/")
    assert defaut["horizon"] == 5 and defaut["attrition"]["taux_unique"] == 2.25
    assert defaut["drh"]["REM_REF_PRI"] == 74.4 and defaut["attrition"]["par_region"]["Adamaoua"] == 3.32
    h = get(c, f"jeux/{jeu}/hypotheses/")
    assert h["version"] == 1
    assert get(c, f"jeux/{jeu}/planification/etat/")["obsolete"] is False   # version 1, calculée à la 1re lecture
    corps = {k: v for k, v in h.items() if k not in ("version", "modifiees_le", "modifiees_par")}
    envoyer(c, "put", f"jeux/{jeu}/hypotheses/", {**corps, "motif": "", "auteur": "Test"}, attendu=422)
    mauvais = {**corps, "attrition": {**corps["attrition"], "taux_unique": -1}, "motif": "x", "auteur": "Test"}
    assert "attrition.taux_unique" in " ".join(envoyer(c, "put", f"jeux/{jeu}/hypotheses/", mauvais, 422)["motifs"])
    corps["attrition"] = {**corps["attrition"], "taux_unique": 4.0}
    corps.pop("drh")    # l'interface n'envoie pas le bloc DRH : il est conservé
    nouv = envoyer(c, "put", f"jeux/{jeu}/hypotheses/", {**corps, "motif": "Taux observé", "auteur": "Analyste"})
    assert nouv["version"] == 2 and nouv["attrition"]["taux_unique"] == 4.0 and nouv["drh"]["ETAL_N"] == 5
    assert [v["version"] for v in get(c, f"jeux/{jeu}/hypotheses/historique/")] == [2, 1]
    assert get(c, f"jeux/{jeu}/planification/etat/")["obsolete"] is True
    doc = get(c, f"jeux/{jeu}/hypotheses/documentation/")
    assert any(s["titre"] == "Départs à la retraite" for s in doc["sections"])
    est = envoyer(c, "post", f"jeux/{jeu}/hypotheses/attrition/estimer/")
    assert est["taux_propose"] is None and est["avertissements"]


def test_tableau_et_ventilations(c, jeu):
    retenir(c, jeu)
    t = get(c, f"jeux/{jeu}/planification/")
    assert t["niveau"] == "national" and [a["annee"] for a in t["annees"]] == ANNEES
    n1 = t["annees"][0]
    assert n1["effectif_debut"] > 0 and n1["quota_retenu"] is None
    assert n1["besoin_restant"] == max(0, n1["besoin"] - n1["ressources_vivier"])
    assert len(t["fiabilite"]) == 12
    # Effectifs suivants : départs retranchés, quotas supposés recrutés.
    a0, a1 = t["annees"][0], t["annees"][1]
    assert a1["effectif_debut"] == max(0, a0["effectif_debut"] - a0["departs_retraite"] - a0["departs_attrition"]
                                       - a0["directeurs_decharges"] + a0["quota_calcule"])
    ventil = get(c, f"jeux/{jeu}/planification/territoires/")
    assert ventil["niveau"] == "region" and ventil["lignes"]
    region = ventil["lignes"][0]["territoire"]["nom"]
    assert get(c, f"jeux/{jeu}/planification/territoires/", region=region)["niveau"] == "departement"
    assert sum(l["annees"][0]["departs_retraite"] for l in ventil["lignes"]) == n1["departs_retraite"]
    ss = get(c, f"jeux/{jeu}/planification/sous-systemes/")
    assert {l["sous_systeme"] for l in ss["lignes"]} <= {"francophone", "anglophone", "non_renseigne"}
    ecoles = get(c, f"jeux/{jeu}/planification/ecoles/", taille=5)
    assert ecoles["count"] > 0 and len(ecoles["resultats"][0]["annees"]) == 5
    dep = get(c, f"jeux/{jeu}/planification/departs/")
    assert len(dep["retraites"]) == sum(a["departs_retraite"] for a in t["annees"])
    fia = get(c, f"jeux/{jeu}/planification/fiabilite/")
    assert fia["global"]["ecoles"] == ecoles["count"] and fia["par_territoire"]
    ind = get(c, f"jeux/{jeu}/indicateurs/")
    assert {i["code"] for i in ind["indicateurs"]} == {"couverture_besoin", "mobilisation_vivier",
                                                       "realisation_nominations", "ecart_prevu_realise",
                                                       "besoin_residuel"}
    assert get(c, f"jeux/{jeu}/indicateurs/evolution/")["points"]


def test_quotas_versions(c, jeu):
    retenir(c, jeu)
    quotas = get(c, f"jeux/{jeu}/quotas/", annee="N+1")
    assert quotas and all(q["statut"] == "calcule" for q in quotas)
    q = quotas[0]
    url = f"jeux/{jeu}/quotas/N%2B1/{q['code_territoire']}/"
    envoyer(c, "put", url, {"sous_systeme": q["sous_systeme"], "retenu": q["calcule"] + 3, "motif": ""}, 422)
    aj = envoyer(c, "put", url, {"sous_systeme": q["sous_systeme"], "retenu": q["calcule"] + 3, "motif": "Budget",
                                 "auteur": "DRH"})
    assert aj["statut"] == "ajuste" and aj["retenu"] == q["calcule"] + 3
    t = get(c, f"jeux/{jeu}/planification/", region=q["territoire"], sous_systeme=q["sous_systeme"])
    assert t["annees"][0]["quota_retenu"] == q["calcule"] + 3
    valides = envoyer(c, "post", f"jeux/{jeu}/quotas/valider/", {"annee": "N+1", "auteur": "DRH"})
    assert valides and all(x["statut"] == "valide" for x in valides)
    envoyer(c, "put", url, {"sous_systeme": q["sous_systeme"], "retenu": 0, "motif": "x"}, 409)
    hist = get(c, f"jeux/{jeu}/quotas/historique/", annee="N+1")
    assert {"calcul", "ajustement", "validation"} <= {h["evenement"] for h in hist}

    assert [v["version"] for v in get(c, f"jeux/{jeu}/planification/versions/")] == [1]
    e = envoyer(c, "post", f"jeux/{jeu}/planification/recalculer/")
    assert e["version"] == 2 and e["obsolete"] is False
    assert get(c, f"jeux/{jeu}/planification/versions/2/")["tableau"]["version"] == 2
    comp = get(c, f"jeux/{jeu}/planification/versions/comparer/", de=1, a=2)
    assert comp["de"]["version"] == 1 and isinstance(comp["ecarts"], list)
    assert get(c, f"jeux/{jeu}/planification/", version=1)["version"] == 1
    types = {e["type"] for e in get(c, f"jeux/{jeu}/journal-audit/", taille=200)["resultats"]}
    assert {"quota", "recalcul", "scenario_retenu"} <= types


def test_delegue_restreint_a_sa_region(centre):
    r = centre.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 150},
                    content_type="application/json")
    jeu = r.json()["id"]
    t = get(centre, f"jeux/{jeu}/planification/territoires/", region="Littoral")
    assert all(l["territoire"]["region"] == "Centre" for l in t["lignes"])
    assert all(q["territoire"] == "Centre" for q in get(centre, f"jeux/{jeu}/quotas/"))


def test_rapport_drh(c, jeu):
    retenir(c, jeu)
    r = get(c, f"jeux/{jeu}/planification/rapport/", horizon=3)
    assert r["horizon"] == 3 and r["annees"] == ANNEES[:3]
    assert len(r["national"]["annees"]) == 4 and r["national"]["lignes"]
    regions = [l["region"] for l in r["retraites_regions"]["lignes"]]
    assert regions and {f["region"] for f in r["priorites"]} == set(regions)
    assert r["scenarios_regions"]["national"]["min"] == r["retraites_regions"]["national"]["total"]
    assert sum(l["min"] for l in r["scenarios_regions"]["lignes"]) == r["scenarios_regions"]["national"]["min"]
    assert all(f["priorite"] in (1, 2, 3) and f["problemes"] for f in r["priorites"])
    assert r["limites"]
    listes = get(c, f"jeux/{jeu}/planification/rapport/listes/", seuil_cohorte=2)
    assert listes["ecoles"] and len(listes["cohorte"]) == get(
        c, f"jeux/{jeu}/planification/rapport/", seuil_cohorte=2)["redeploiement"]["national"]["cohorte"]
    r = c.get(B + f"jeux/{jeu}/planification/rapport/", {"horizon": 9})
    assert r.status_code == 422


def test_degre_alea_national_et_par_region(c, jeu):
    """Aléa = 1 − R² (enseignants ~ élèves) : mêmes valeurs que le rapport, avec le motif quand il est incalculable."""
    retenir(c, jeu)
    alea = get(c, f"jeux/{jeu}/planification/alea/")
    rapport = get(c, f"jeux/{jeu}/planification/rapport/")
    assert alea["national"]["alea"] == rapport["scenarios_regions"]["national"]["alea"]
    assert {l["region"]: l["alea"] for l in alea["regions"]} == {
        l["region"]: l["alea"] for l in rapport["scenarios_regions"]["lignes"]}
    assert alea["regions"]
    for ligne in alea["regions"]:
        assert ligne["ecoles_avec_eleves"] <= ligne["ecoles"]
        if ligne["alea"] is None:
            assert ligne["raison"] and ligne["ecart_national"] is None
        else:
            assert 0 <= ligne["alea"] <= 1 and ligne["raison"] is None
            if alea["national"]["alea"] is not None:
                assert ligne["ecart_national"] == round(ligne["alea"] - alea["national"]["alea"], 2)


def test_degre_alea_delegue_limite_a_sa_region(centre):
    jeu = centre.post(B + "jeux/demonstration/", {"nb_ecoles": 40, "nb_enseignants": 300},
                      content_type="application/json").json()["id"]
    alea = get(centre, f"jeux/{jeu}/planification/alea/")
    assert [l["region"] for l in alea["regions"]] == ["Centre"]
