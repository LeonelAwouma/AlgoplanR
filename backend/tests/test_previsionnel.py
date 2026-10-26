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
    # La base est l'année du jeu ; N+1 est l'année scolaire suivante, sans saut ni doublon.
    assert p["annees"] == [f"Base ({debut}-{debut + 1})"] + [f"N+{k + 1} ({debut + 1 + k}-{debut + 2 + k})"
                                                             for k in range(5)]
    assert p["annee_base"] == annee and p["annee_scolaire_plan"] == annee
    assert any(h["code"] == "annee_base" and h["a_valider"] for h in p["hypotheses"])
    for l in _lignes(p).values():
        assert len(l["valeurs"]) == 6 and len(l["natures"]) == 6
        assert set(l["natures"]) <= {"observe", "projete", "estime", "hypothese", "provisoire", "non_disponible",
                                    "sans_objet"}
        # Une valeur future n'est jamais qualifiée d'observée ; seuls les actes enregistrés (quota retenu,
        # nominations mises en œuvre) le sont, parce qu'ils ne sont pas calculés.
        if l["cle"] not in ("quota_retenu", "nominations_realisees"):
            assert "observe" not in l["natures"][1:], l["cle"]


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


def test_correspondance_des_annees_scolaires():
    from domaine.planification.previsionnel import annee_base, libelles_annees
    assert libelles_annees("2024-2025", 5) == ["Base (2024-2025)", "N+1 (2025-2026)", "N+2 (2026-2027)",
                                               "N+3 (2027-2028)", "N+4 (2028-2029)", "N+5 (2029-2030)"]
    assert annee_base("2024-2025") == "2024-2025"
    assert annee_base("") is None and libelles_annees("", 2) == ["Base", "N+1", "N+2"]


def test_raisons_des_rem_indisponibles_visibles(centre):
    etab, ens = _national()
    centre_ = next(x for x in etab if x["Region"] == "Centre")
    centre_["Effectif_Eleves_Attendus"] = None              # une école du Centre à effectif inconnu
    jeu = _importer(centre, etab, ens).json()["id"]
    l = _lignes(get(centre, f"jeux/{jeu}/planification/previsionnel/"))
    for cle in ("rem_reel", "rem_min", "rem_maintien", "rem_besoin", "rem_plafond", "ecart_reference"):
        valeurs, raisons = l[cle]["valeurs"], l[cle]["raisons"]
        assert len(raisons) == len(valeurs)
        for v, r in zip(valeurs, raisons):
            # Une valeur absente porte toujours sa raison ; une valeur présente n'en porte aucune.
            assert (v is None) == (r is not None), (cle, v, r)
        assert any(r and "effectif d'élèves inconnu" in r for r in raisons), cle


def test_fiabilite_minimum_provisoire_distinct_du_besoin_incertain(centre):
    etab, ens = _national()
    for x in etab:
        x["Classes_Multigrades"] = None
    jeu = _importer(centre, etab, ens).json()["id"]
    p = get(centre, f"jeux/{jeu}/planification/previsionnel/")
    f = p["fiabilite"]
    assert f["minimum_provisoire"] == p["ecoles"]
    assert f["besoin_provisoire"] + f["besoin_estime"] + f["besoin_confirme"] == p["ecoles"]
    assert f["minimum_provisoire_sans_effet"] == f["besoin_confirme"]
    assert f["besoin_provisoire"] <= f["minimum_provisoire"]
    l = _lignes(p)
    assert l["part_besoin_incertain"]["valeurs"][0] == round(100 * (f["besoin_provisoire"] + f["besoin_estime"])
                                                            / p["ecoles"], 1)


def test_avertissement_sur_les_personnels_de_la_cartographie(drh, jeu):
    p = get(drh, f"jeux/{jeu}/planification/previsionnel/")
    assert "pas nécessairement tous des maîtres chargés de classe" in p["avertissement_personnels"]
    assert any(h["code"] == "personnels" and h["a_valider"] for h in p["hypotheses"])
    assert "pas nécessairement tous" in _lignes(p)["effectif_debut"]["detail"]


def test_contexte_du_jeu_et_du_perimetre(drh, jeu):
    p = get(drh, f"jeux/{jeu}/planification/previsionnel/")
    c = p["contexte"]
    j = get(drh, f"jeux/{jeu}/")
    assert c["jeu_nom"] == j["nom"] and c["annee_scolaire"] == j["annee_scolaire"] == p["annee_base"]
    assert c["ecoles_perimetre"] == p["ecoles"] and c["ecoles_jeu"] >= c["ecoles_perimetre"]
    assert c["personnels_stock_declare"] == _lignes(p)["effectif_debut"]["valeurs"][0]
    assert c["ecoles_donnees_incompletes"] >= c["ecoles_eleves_inconnus"]
    assert c["calcule_le"] and c["edite_le"] and p["hypothese_transition"]


def test_audit_des_retraites_coherent_avec_le_tableau(drh, jeu):
    p = get(drh, f"jeux/{jeu}/planification/previsionnel/")
    a = p["audit_retraites"]
    l = _lignes(p)
    retraites = l["retraites_identifiees"]["valeurs"][1:]
    assert [x["departs"] for x in a["lignes"]] == retraites
    # Identifiées = retirées du stock + non imputables (au-delà du stock déclaré de l'école).
    assert retraites == [r + n for r, n in zip(l["departs_retraite"]["valeurs"][1:],
                                               l["retraites_non_imputables"]["valeurs"][1:])]
    for x in a["lignes"]:
        assert x["deja_eligibles"] + x["atteignant_age_legal"] == x["departs"]
    # Les agents ayant déjà l'âge légal partent tous en N+1 (CORR_60) ; aucun n'est recompté ensuite.
    assert a["lignes"][0]["deja_eligibles"] == a["deja_eligibles_debut"]
    assert all(x["deja_eligibles"] == 0 for x in a["lignes"][1:])
    assert sum(retraites) <= a["personnels_nominatifs"] and a["doublons"] == 0


def test_chronologie_identique_dans_les_deux_tableaux(drh, jeu):
    p = get(drh, f"jeux/{jeu}/planification/previsionnel/")
    t = get(drh, f"jeux/{jeu}/planification/")
    debut = int(p["annee_base"][:4])
    assert [a["annee"] for a in t["annees"]] == [f"N+{k + 1}" for k in range(5)]
    assert p["annees"][1:] == [f"N+{k + 1} ({debut + 1 + k}-{debut + 2 + k})" for k in range(5)]


def test_annee_de_mesure_des_ages_rajeunit_les_departs(drh, jeu):
    """Des âges mesurés un an après la base sont ramenés au début de N+1 : les départs ne peuvent que reculer, et la
    méthode le dit. Les données sources ne sont pas modifiées."""
    from tests.test_planification import envoyer
    avant = get(drh, f"jeux/{jeu}/planification/previsionnel/")["audit_retraites"]
    h = get(drh, f"jeux/{jeu}/hypotheses/")
    corps = {k: v for k, v in h.items() if k not in ("version", "modifiees_le", "modifiees_par", "drh")}
    debut = int(get(drh, f"jeux/{jeu}/")["annee_scolaire"][:4])
    corps["retraite"] = {**corps["retraite"], "annee_ages": f"{debut + 2}-{debut + 3}"}
    nouv = envoyer(drh, "put", f"jeux/{jeu}/hypotheses/", {**corps, "motif": "Âges de 2026", "auteur": "Analyste"})
    assert nouv["retraite"]["annee_ages"] == f"{debut + 2}-{debut + 3}"
    apres = get(drh, f"jeux/{jeu}/planification/previsionnel/")["audit_retraites"]
    assert apres["decalage_ages"] == 1 and "ramenés de 1 an" in apres["methode"]
    assert apres["deja_eligibles_debut"] <= avant["deja_eligibles_debut"]
    assert sum(x["departs"] for x in apres["lignes"]) <= sum(x["departs"] for x in avant["lignes"])
