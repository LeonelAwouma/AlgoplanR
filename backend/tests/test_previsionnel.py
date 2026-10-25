"""Tableau prévisionnel complet (`planification/previsionnel/`) : cohérence avec le tableau principal, scénarios
indépendants, retraites et attrition sans double comptage, données indisponibles, périmètre des délégués."""
import math

import pytest

from tests.test_delegue_regional import _attendu, _importer, _national

pytestmark = pytest.mark.django_db
B = "/api/v1/"
J = "application/json"


def get(c, url, **kw):
    r = c.get(B + url, kw)
    assert r.status_code == 200, (url, r.status_code, r.content[:500])
    return r.json()


@pytest.fixture
def jeu(drh):
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 40, "nb_enseignants": 300}, content_type=J)
    assert r.status_code == 201, r.content
    return r.json()["id"]


def _lignes(p):
    return {l["cle"]: l for g in p["groupes"] for l in g["lignes"]}


def test_cinq_groupes_et_annees_sans_annee_codee_en_dur(drh, jeu):
    p = get(drh, f"jeux/{jeu}/planification/previsionnel/")
    assert [g["code"] for g in p["groupes"]] == ["A", "B", "C", "D", "E"]
    annee = get(drh, f"jeux/{jeu}/")["annee_scolaire"]
    debut = int(annee[:4])
    assert p["annees"] == ["Base"] + [f"N+{k + 1} ({debut + k}-{debut + k + 1})" for k in range(5)]
    for l in _lignes(p).values():
        assert len(l["valeurs"]) == 6 and l["nature"] in ("observe", "estime", "hypothese", "provisoire")


def test_coherence_avec_le_tableau_principal(drh, jeu):
    t = get(drh, f"jeux/{jeu}/planification/")["annees"]
    l = _lignes(get(drh, f"jeux/{jeu}/planification/previsionnel/"))
    for cle in ("effectif_debut", "departs_retraite", "departs_attrition", "directeurs_decharges", "quota_calcule",
                "quota_retenu", "ressources_vivier"):
        assert l[cle]["valeurs"][1:] == [a[cle] for a in t], cle
    assert l["eleves"]["valeurs"][1:] == [round(a["eleves"]) for a in t]
    assert l["rem_reel"]["valeurs"][1:] == [a["rem"] for a in t]


def test_projection_des_eleves_et_besoin_selon_le_rem(drh, jeu):
    p = get(drh, f"jeux/{jeu}/planification/previsionnel/")
    l = _lignes(p)
    eleves = l["eleves"]["valeurs"]
    croissance = l["croissance"]["valeurs"][1] / 100
    assert croissance == pytest.approx(0.027)
    for k in range(1, 6):
        assert eleves[k] == pytest.approx(eleves[0] * (1 + croissance) ** k, abs=1)
    ref = p["rem_reference"]
    assert ref == 74.4
    assert l["besoin_rem"]["valeurs"][0] == math.ceil(eleves[0] / ref)
    # Le ratio C est distinct de la somme des besoins pédagogiques école par école.
    assert l["besoin_rem"]["valeurs"] != l["somme_de"]["valeurs"]
    for k in range(6):
        assert l["somme_de"]["valeurs"][k] >= l["somme_pe"]["valeurs"][k]
        assert l["somme_de"]["valeurs"][k] >= l["somme_ke"]["valeurs"][k]


def test_retraites_et_attrition_sans_double_comptage(drh, jeu):
    p = get(drh, f"jeux/{jeu}/planification/previsionnel/")
    l = _lignes(p)
    h = get(drh, f"jeux/{jeu}/hypotheses/")
    taux = h["attrition"]["taux_unique"]
    assert taux == pytest.approx(3.33 - 1.08)
    for k in range(1, 6):
        debut = l["effectif_debut"]["valeurs"][k]
        assert l["departs_attrition"]["valeurs"][k] == math.floor(taux * debut / 100 + 0.5 + 1e-9)


def test_directeurs_decharges_comptes_une_seule_fois(drh, jeu):
    l = _lignes(get(drh, f"jeux/{jeu}/planification/previsionnel/"))
    cumul = 0
    for k in range(1, 6):
        cumul += l["directeurs_decharges"]["valeurs"][k]
        assert l["decharges_cumulees"]["valeurs"][k] == cumul
        assert l["disponibles_fin"]["valeurs"][k] == l["effectif_fin"]["valeurs"][k] - cumul


def test_quatre_scenarios_independants(drh, jeu):
    p = get(drh, f"jeux/{jeu}/planification/previsionnel/")
    s = {x["scenario"]: x for x in p["scenarios"]}
    l = _lignes(p)
    assert set(s) == {"min", "maintien", "besoin", "plafond"}
    # S-min remplace exactement les retraites (nominatives : les mêmes dans chaque trajectoire).
    assert s["min"]["recrutements"] == l["departs_retraite"]["valeurs"][1:]
    for x in s.values():
        assert len(x["recrutements"]) == 5 and len(x["rem"]) == 5
        # Chaque scénario enchaîne son propre stock : U(t) suit ses propres recrutements.
        for k in range(1, 5):
            assert x["disponibles_fin"][k] - x["disponibles_fin"][k - 1] <= x["recrutements"][k]
        if x["rem_final"] is not None:
            assert x["ecart_final"] == pytest.approx(x["rem_final"] - p["rem_reference"], abs=0.11)
    assert s["besoin"]["recrutements_total"] >= s["min"]["recrutements_total"]
    assert l["recrutement_plafond"]["valeurs"][1:] == s["plafond"]["recrutements"]


def test_donnees_sige_non_disponibles(drh, jeu):
    p = get(drh, f"jeux/{jeu}/planification/previsionnel/")
    noms = {x["indicateur"]: x for x in p["non_disponibles"]}
    for i in ("Chargés de classe déclarés au SIGE", "Agents hors cartographie",
              "Écart de couverture SIGE − cartographie"):
        assert noms[i]["valeur"] is None and noms[i]["source_manquante"]
    assert any(h["code"] == "groupes_secours" and h["a_valider"] for h in p["hypotheses"])


def test_minimum_provisoire_signale_sur_une_base_sans_multigrades(centre):
    etab, ens = _national()
    for x in etab:
        x["Classes_Multigrades"] = None
    jeu = _importer(centre, etab, ens).json()["id"]
    p = get(centre, f"jeux/{jeu}/planification/previsionnel/")
    assert p["ecoles_minimum_provisoire"] == p["ecoles"] > 0
    assert p["message_minimum_provisoire"].startswith("Le nombre de classes multigrades n'est pas renseigné.")
    assert _lignes(p)["part_provisoire"]["valeurs"][0] == 100.0
    assert p["minimum_pedagogique"]["secours"] == p["ecoles"]


def test_perimetre_du_delegue(centre):
    etab, ens = _national()
    jeu = _importer(centre, etab, ens).json()["id"]
    ecoles_centre, _ = _attendu(etab, ens, "Centre")
    p = get(centre, f"jeux/{jeu}/planification/previsionnel/", region="Littoral")
    assert p["perimetre"] == "Centre" and p["ecoles"] == len(ecoles_centre)


def test_route_refusee_sans_session(client, jeu):
    assert client.get(B + f"jeux/{jeu}/planification/previsionnel/").status_code in (401, 403)
