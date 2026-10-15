"""Parcours complet : démonstration -> diagnostic -> Prince -> scénarios -> arbitrage -> recrues -> rapport.

Le parcours métier est joué par le DRH sur un jeu de démonstration national (sur lequel il a tous les droits) ;
l'import de classeurs, réservé aux délégués, par le délégué du Centre.
"""
import io

import pytest

pytestmark = pytest.mark.django_db
B = "/api/v1/"


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
    assert r.status_code == 200, (url, r.status_code, r.content[:300])
    return r.json()


def test_systeme(c):
    assert get(c, "sante/")["statut"] == "ok"
    assert "seuils" in get(c, "parametres/defaut/")
    assert len(get(c, "scenarios/presets/")["geographiques"]) == 3


def test_donnees_et_diagnostic(c, jeu):
    assert len(get(c, "jeux/")) == 1
    assert get(c, f"jeux/{jeu}/qualite/")["valide"] is True
    e = get(c, f"jeux/{jeu}/etablissements/", taille=5)
    assert e["count"] == 40 and len(e["resultats"]) == 5
    ident = e["resultats"][0]["Identifiant_Ecole"]
    assert get(c, f"jeux/{jeu}/etablissements/{ident}/")["diagnostic"]
    assert get(c, f"jeux/{jeu}/enseignants/", taille=3)["count"] == 300
    mat = get(c, f"jeux/{jeu}/enseignants/", taille=1)["resultats"][0]["Matricule_Enseignant"]
    d = get(c, f"jeux/{jeu}/enseignants/{mat}/")
    assert len(d["bareme"]["composantes"]) == 5 and "eligibilite" in d
    assert get(c, f"jeux/{jeu}/recherche/etablissements/", q="eco001")["resultats"]
    dg = get(c, f"jeux/{jeu}/diagnostic/")
    assert dg["totaux"]["nb_ecoles"] == 40
    reg = get(c, f"jeux/{jeu}/territoires/options/")["regions"][0]
    assert get(c, f"jeux/{jeu}/diagnostic/", region=reg)["totaux"]["nb_ecoles"] < 40
    t = get(c, f"jeux/{jeu}/territoires/")
    assert t["niveau"] == "national" and t["enfants"]
    assert get(c, f"jeux/{jeu}/priorites/")["count"] >= 1
    assert get(c, f"jeux/{jeu}/synthese/")["points_attention"] is not None
    assert get(c, f"jeux/{jeu}/situations-familiales/")["total"] == 300


def test_parametres_rendent_obsolete(c, jeu):
    scs = get(c, f"jeux/{jeu}/scenarios/")
    assert len(scs) == 3 and not any(s["obsolete"] for s in scs)
    r = c.patch(B + f"jeux/{jeu}/parametres/", {"seuils": {"age_senior_ans": 52}}, content_type="application/json")
    assert r.status_code == 200 and r.json()["scenarios_obsoletes"] == 3
    assert all(s["obsolete"] for s in get(c, f"jeux/{jeu}/scenarios/"))
    sid = scs[0]["id"]
    assert c.post(B + f"jeux/{jeu}/scenarios/{sid}/executer/").status_code == 200
    bad = c.put(B + f"jeux/{jeu}/parametres/", {"seuils": {"age_jeune_ans": 70}}, content_type="application/json")
    assert bad.status_code == 422
    assert c.patch(B + f"jeux/{jeu}/parametres/", {"inconnu": 1}, content_type="application/json").status_code == 422


def test_scenarios_et_resultats(c, jeu):
    sid = [s for s in get(c, f"jeux/{jeu}/scenarios/") if s["code"] == "geo_region"][0]["id"]
    S = f"jeux/{jeu}/scenarios/{sid}/"
    res = get(c, S + "resultat/")
    assert res["synthese"]["besoin_total"] >= res["synthese"]["affectes"]
    aff = get(c, S + "affectations/", taille=500)
    assert aff["count"] == res["synthese"]["affectes"]
    if aff["count"]:
        m = aff["resultats"][0]["id_ens"]
        ex = get(c, S + f"affectations/{m}/explication/")
        assert abs(ex["score"]["total"] - aff["resultats"][0]["score_affectation"]) < 1e-6
    for p in ("non-affectes", "vivier", "postes", "postes-non-couverts", "postes-zone-rouge", "ecoles-en-besoin",
              "ecoles-fournisseurs", "candidatures", "combinaisons", "journal", "projections"):
        get(c, S + p + "/")
    inv = get(c, S + "invariants/")
    assert inv["tous_respectes"], inv
    assert get(c, S + "flux/", niveau="region")["flux"] is not None
    assert c.get(B + S + "flux/?niveau=pays").status_code == 422
    cmp_ = get(c, f"jeux/{jeu}/comparaison/")
    assert len(cmp_["scenarios"]) == 3
    reg = get(c, f"jeux/{jeu}/territoires/options/")["regions"][0]
    loc = get(c, S + "resultat/", region=reg)
    assert loc["synthese"]["scope_title"] == reg
    x = c.get(B + S + "export/")
    assert x.status_code == 200 and x.content[:2] == b"PK"
    new = c.post(B + f"jeux/{jeu}/scenarios/", {"code": "voeux_seuls"}, content_type="application/json")
    assert new.status_code == 201
    assert c.post(B + f"jeux/{jeu}/scenarios/", {"nom": "x"}, content_type="application/json").status_code == 201
    assert c.delete(B + f"jeux/{jeu}/scenarios/{new.json()['id']}/").status_code == 204


def test_prince_arbitrage_recrues_rapport(c, jeu):
    sid = [s for s in get(c, f"jeux/{jeu}/scenarios/") if s["code"] == "geo_region"][0]["id"]
    S = f"jeux/{jeu}/scenarios/{sid}/"
    vivier = get(c, S + "vivier/", taille=50)["resultats"]
    ens = vivier[0]["Matricule_Enseignant"]
    # refus métier
    r = c.post(B + f"jeux/{jeu}/faits-prince/", {"id_ens": "NOPE", "id_etab": "ECO001"}, content_type="application/json")
    assert r.status_code == 422 and r.json()["motifs"]
    imp = c.post(B + f"jeux/{jeu}/faits-prince/impact/", {"id_ens": ens, "id_etab": "ECO001"}, content_type="application/json")
    assert imp.status_code == 200 and imp.json()["enregistre"] is False
    assert get(c, f"jeux/{jeu}/faits-prince/") == []
    ok = c.post(B + f"jeux/{jeu}/faits-prince/", {"id_ens": ens, "id_etab": "ECO001", "motif": "Test"}, content_type="application/json")
    assert ok.status_code == 201, ok.content
    assert get(c, S + "resultat/")["synthese"]["effet_de_prince"] == 1
    dup = c.post(B + f"jeux/{jeu}/faits-prince/", {"id_ens": ens, "id_etab": "ECO002"}, content_type="application/json")
    assert dup.status_code == 422
    csv = io.BytesIO(f"id_ens,id_etab,motif\n{vivier[1]['Matricule_Enseignant']},ECO003,Import\nZZZ,ECO003,x\n".encode())
    csv.name = "prince.csv"
    r = c.post(B + f"jeux/{jeu}/faits-prince/import/", {"fichier": csv})
    assert r.status_code == 200 and len(r.json()["acceptees"]) == 1 and len(r.json()["refusees"]) == 1
    assert get(c, f"jeux/{jeu}/rapport/", scenario=sid)["faits_prince"]["nombre"] == 2
    fid = get(c, f"jeux/{jeu}/faits-prince/")[0]["id"]
    assert c.delete(B + f"jeux/{jeu}/faits-prince/{fid}/").status_code == 204
    # arbitrage
    non_aff = get(c, S + "non-affectes/", taille=5)["resultats"]
    if non_aff:
        r = c.post(B + f"jeux/{jeu}/arbitrages/", {"id_ens": non_aff[0]["Matricule_Enseignant"], "id_etab": "ECO004"},
                   content_type="application/json")
        assert r.status_code == 201
        assert len(get(c, f"jeux/{jeu}/arbitrages/")) == 1
    # recrues
    f = io.BytesIO(b"id_recrue,nom,sous_systeme,region_souhaitee,rang\nR1,Ali,Francophone,Nord,1\nR1,Dup,x,x,2\n")
    f.name = "recrues.csv"
    r = c.post(B + f"jeux/{jeu}/recrues/import/", {"fichier": f})
    assert r.status_code == 201 and r.json()["acceptees"] == 1 and r.json()["refusees"]
    assert "deploiements" in get(c, S + "recrutes/")
    assert c.delete(B + f"jeux/{jeu}/recrues/").status_code == 204
    # invariants toujours respectés
    assert get(c, S + "invariants/")["tous_respectes"]


def test_import_fichiers_et_suppression(centre):
    from domaine.donnees.demonstration import construire_jeu_demonstration
    import pandas as pd
    c = centre
    e, n = construire_jeu_demonstration(1, 20, 100)
    for ligne in e:                         # classeur régional : toutes les écoles dans la région du délégué
        ligne["Region"] = "Centre"
    ids = {}
    for typ, rows in (("etablissements", e), ("enseignants", n)):
        buf = io.BytesIO()
        pd.DataFrame(rows).to_excel(buf, index=False)
        buf.name = f"{typ}.xlsx"
        buf.seek(0)
        r = c.post(B + "fichiers/", {"type": typ, "fichier": buf})
        assert r.status_code == 201, r.content
        assert r.json()["colonnes_a_confirmer"] == []
        ids[typ] = r.json()["id"]
    r = c.post(B + "jeux/", {"nom": "Test", "fichier_etablissements": ids["etablissements"],
                             "fichier_enseignants": ids["enseignants"]}, content_type="application/json")
    assert r.status_code == 201, r.content
    jeu = r.json()["id"]
    assert len(get(c, f"jeux/{jeu}/scenarios/")) == 3
    assert c.delete(B + f"jeux/{jeu}/").status_code == 204
    assert get(c, "jeux/") == []


def test_import_refuse_donnees_invalides(centre):
    c = centre
    f = io.BytesIO(b"Identifiant_Ecole,Region\nA,Centre\nA,Centre\n")
    f.name = "e.csv"
    e = c.post(B + "fichiers/", {"type": "etablissements", "fichier": f}).json()
    g = io.BytesIO(b"Matricule_Enseignant,Age\nM1,30\n")
    g.name = "n.csv"
    n = c.post(B + "fichiers/", {"type": "enseignants", "fichier": g}).json()
    r = c.post(B + "jeux/", {"fichier_etablissements": e["id"], "fichier_enseignants": n["id"]}, content_type="application/json")
    assert r.status_code == 422 and any("doublon" in m for m in r.json()["motifs"])
    p = c.patch(B + f"fichiers/{e['id']}/correspondances/", {"Region": "Inconnue"}, content_type="application/json")
    assert p.status_code == 422


def test_jeton_local(settings, c):
    settings.ALGOPLANR_JETON = "secret"
    assert c.get(B + "sante/").status_code == 200
    assert c.get(B + "jeux/").status_code == 401
    assert c.get(B + "jeux/", HTTP_X_ALGOPLANR_JETON="secret").status_code == 200


def test_code_prince_optionnel(settings, c, jeu):
    settings.ALGOPLANR_CODE_PRINCE = "abc"
    r = c.post(B + f"jeux/{jeu}/faits-prince/", {"id_ens": "x", "id_etab": "y"}, content_type="application/json")
    assert r.status_code == 403


def test_openapi(c):
    r = c.get(B + "schema/")
    assert r.status_code == 200
    assert len(r.content) > 5000
