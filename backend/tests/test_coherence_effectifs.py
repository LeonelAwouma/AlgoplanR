"""Cohérence des effectifs, des retraites et des recrutements : stock déclaré et liste nominative rapprochés école par
école, retraites jamais retirées d'un stock auquel elles n'appartiennent pas, plancher des retraites face au plafond,
année de mesure des âges, sens de l'année des jeux et origine fictive vérifiable."""
import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from domaine.donnees.annee_scolaire import annee_des_donnees
from domaine.donnees.modeles import Ecole, Enseignant
from domaine.parametrage.config import defaut
from domaine.planification.parametres import STOCK_NATIONAL_PRIMAIRE
from domaine.planification.previsionnel import (TEXTE_DONNEES_FICTIVES, construire, libelles_annees,
                                                rapprochement_effectifs)
from domaine.planification.projection import SCENARIOS, annee_depart, calculer_annees, decalage_ages, projeter_ecoles
from tests.test_delegue_regional import _importer, _national
from tests.test_domaine_planification import _hyp

B = "/api/v1/"
J = "application/json"


def _ecole(id_="E1", actuels=4, eleves=100, salles=6):
    return Ecole(id=id_, region="Centre", departement="Mfoundi", commune="Yaounde", effectif_eleves=eleves,
                 enseignants_actuels=actuels, salles_simple_flux=salles, multigrade="0")


def _agents(n, ecole="E1", age=62, prefixe="M"):
    return [Enseignant(matricule=f"{prefixe}{ecole}{k}", ecole_attache=ecole, age=age) for k in range(n)]


def _tout(ecoles, ens, hyp=None, contexte=None, annee="2024-2025", hors_ecoles=None):
    hyp = hyp or _hyp()
    p, departs = projeter_ecoles(ecoles, ens, defaut(), hyp)
    traj = {s: calculer_annees(p, hyp, scenario=s) for s in SCENARIOS}
    return p, traj, construire(p, ens, traj, traj["plafond"], hyp, annee_scolaire=annee, contexte=contexte or {},
                               departs=departs, hors_ecoles=hors_ecoles)


def _lignes(t):
    return {l["cle"]: l for g in t["groupes"] for l in g["lignes"]}


# --- Stock déclaré et liste nominative ---------------------------------------------------------------------------

def test_effectifs_concordants():
    p, _, t = _tout([_ecole(actuels=4)], _agents(1) + _agents(3, age=30, prefixe="J"))
    sy = t["rapprochement"]["synthese"]
    assert (sy["ecoles_concordantes"], sy["ecoles_ecart_positif"], sy["ecoles_ecart_negatif"]) == (1, 0, 0)
    assert sy["concordance_complete"] and sy["retraites_non_imputables"] == 0
    assert not {a["code"] for a in t["avertissements"]} & {"effectifs_discordants", "retraites_non_imputables"}


def test_ecole_de_quatre_enseignants_ne_perd_jamais_six_retraites():
    """4 personnels déclarés, 6 agents nominatifs de 62 ans : seuls 4 quittent le stock, 2 sont non imputables."""
    p, traj, t = _tout([_ecole(actuels=4)], _agents(6))
    e = p[0]
    assert e.retraites_identifiees[0] == 6 and e.retraites[0] == 4 and e.retraites_non_imputables[0] == 2
    assert all(x >= 0 for x in e.effectifs)
    for s, lignes in traj.items():
        x = lignes[0]
        assert (x["departs_retraite"], x["retraites_non_imputables"], x["retraites_identifiees"]) == (4, 2, 6)
        # S(t+1) = S − R − A + Q avec R imputées : aucun agent retiré d'un stock auquel il n'appartient pas.
        for k, y in enumerate(lignes):
            assert y["effectif_fin"] == y["effectif_debut"] - y["departs_retraite"] - y["departs_attrition"] \
                + y["recrutement"] >= 0
    l = _lignes(t)
    assert l["departs_retraite"]["valeurs"][1] == 4 and l["retraites_non_imputables"]["valeurs"][1] == 2
    ligne = t["rapprochement"]["ecoles"][0]
    assert ligne["ecart"] == -2 and set(ligne["anomalies"]) >= {"nominatif_superieur_declare",
                                                                "retraites_superieures_au_stock"}
    codes = {a["code"] for a in t["avertissements"]}
    assert {"effectifs_discordants", "retraites_non_imputables"} <= codes


def test_retraites_sur_plusieurs_annees_bornees_au_stock_restant():
    ens = _agents(2, age=62) + _agents(3, age=59, prefixe="N")
    p, _, _ = _tout([_ecole(actuels=3)], ens)
    e = p[0]
    assert e.retraites_identifiees[:2] == [2, 3]
    assert e.retraites[:2] == [2, 1] and e.retraites_non_imputables[:2] == [0, 2] and e.effectifs[:2] == [1, 0]


def test_ecart_positif_sans_retraite_inventee():
    """8 déclarés, 2 nominatifs : l'écart est signalé, aucune retraite n'est déduite pour les 6 agents inconnus."""
    p, traj, t = _tout([_ecole(actuels=8)], _agents(2, age=30))
    sy = t["rapprochement"]["synthese"]
    assert (sy["ecoles_ecart_positif"], sy["ecart_positif"]) == (1, 6)
    assert all(x["departs_retraite"] == 0 for x in traj["plafond"])
    assert "effectifs_discordants" in {a["code"] for a in t["avertissements"]}


def test_matricules_en_double_et_agents_sans_age():
    ens = _agents(2, age=30) + [Enseignant(matricule="MDUP", ecole_attache="E1", age=62),
                                Enseignant(matricule="MDUP", ecole_attache="E1", age=62),
                                Enseignant(matricule="MX", ecole_attache="E1", age=35, age_connu=False)]
    _, _, t = _tout([_ecole(actuels=4)], ens)
    ligne = t["rapprochement"]["ecoles"][0]
    assert ligne["agents_nominatifs"] == 4 and ligne["doublons"] == 1 and ligne["agents_sans_age"] == 1
    assert ligne["retraites_n1"] == 1
    assert {"matricules_en_double", "agents_sans_age"} <= set(ligne["anomalies"])
    l = _lignes(t)
    # Données incomplètes : retraites qualifiées de provisoires, avec la raison.
    assert l["departs_retraite"]["natures"][1] == "provisoire" and "sans âge" in l["departs_retraite"]["detail"]


def test_agents_rattaches_a_aucune_ecole():
    _, _, t = _tout([_ecole(actuels=1)], _agents(1, age=30), hors_ecoles=3)
    assert t["rapprochement"]["synthese"]["agents_hors_ecoles"] == 3
    assert "agents_hors_ecoles" in {a["code"] for a in t["avertissements"]}


def test_rapprochement_anomalies_en_tete():
    ecoles = [_ecole("A", actuels=2), _ecole("B", actuels=5)]
    ens = _agents(2, "A", age=30) + _agents(7, "B", age=30)
    p, _ = projeter_ecoles(ecoles, ens, defaut(), _hyp())
    r = rapprochement_effectifs(p, ens)
    assert [l["id_ecole"] for l in r["ecoles"]] == ["B", "A"]
    assert r["synthese"]["ecart_negatif"] == -2 and r["synthese"]["ecoles_concordantes"] == 1


# --- Retraites et autres départs : pas de double comptage -------------------------------------------------------

def test_retraites_non_recomptees_dans_l_attrition():
    h = _hyp()
    h["attrition"]["taux_unique"] = 10
    p, traj, _ = _tout([_ecole(actuels=20, eleves=400, salles=10)], _agents(4) + _agents(16, age=30, prefixe="J"),
                       hyp=h)
    for x in traj["min"]:
        # A = taux × S de début, indépendant des retraites ; R = agents nominatifs seulement.
        assert x["departs_attrition"] == int(x["effectif_debut"] * 10 / 100 + 0.5)
    assert sum(x["retraites_identifiees"] for x in traj["min"]) == 4


def test_scenarios_chaines_independamment():
    p, traj, _ = _tout([_ecole(actuels=4)], _agents(3))
    s0 = traj["min"][0]["effectif_debut"]
    for s, lignes in traj.items():
        assert lignes[0]["effectif_debut"] == s0
        for k in range(1, len(lignes)):
            assert lignes[k]["effectif_debut"] == lignes[k - 1]["effectif_fin"], s
    # Un scénario ne modifie jamais les entrées d'un autre.
    assert calculer_annees(p, _hyp(), scenario="besoin") == traj["besoin"]


# --- Plancher des retraites et plafond : Q = max(min(B ; P) ; R) -------------------------------------------------

def _plaf(p, stock):
    return round(p * STOCK_NATIONAL_PRIMAIRE / stock)


@pytest.mark.parametrize("cas,actuels,ens,plafond,attendu", [
    ("R < P", 4, lambda: _agents(1), 10, lambda B, P, R: R < P),
    ("R > P", 4, lambda: _agents(3), 1, lambda B, P, R: R > P),
    ("B = 0 et R > 0", 10, lambda: _agents(3), 10, lambda B, P, R: B == 0 and R > 0),
    ("B > P", 2, lambda: _agents(1, age=30), 1, lambda B, P, R: B > P),
    ("R = 0", 4, lambda: _agents(4, age=30), 10, lambda B, P, R: R == 0),
])
@pytest.mark.parametrize("plancher", [True, False])
def test_plancher_et_plafond(cas, actuels, ens, plafond, attendu, plancher):
    h = _hyp(PLAF_PRI=_plaf(plafond, actuels), PLANCHER_RET=plancher)
    p, traj, t = _tout([_ecole(actuels=actuels)], ens(), hyp=h)
    x = traj["plafond"][0]
    B, P, R = x["quota_avant_plafond"], x["plafond"], x["departs_retraite"]
    assert P == plafond and attendu(B, P, R), (cas, B, P, R)
    q = max(min(B, P), R) if plancher else min(B, P)
    assert x["quota_calcule"] == q
    assert x["depassement_plafond"] == max(0, q - P)
    assert x["quota_plafond_prioritaire"] == min(max(B, R), P) <= P
    assert x["plancher_applique"] == (plancher and R > min(B, P))
    l = _lignes(t)
    for cle in ("quota_avant_plafond", "plafond", "quota_calcule", "depassement_plafond", "quota_plafond_prioritaire",
                "quota_retenu", "nominations_realisees"):
        assert cle in l, cle
    assert l["quota_retenu"]["valeurs"][1] is None and l["nominations_realisees"]["valeurs"][1] is None
    messages = [a["message"] for a in t["avertissements"] if a["code"] == "depassement_plafond"]
    if x["depassement_plafond"]:
        n = x["depassement_plafond"]
        assert messages[0] == (f"Le quota proposé dépasse le plafond de recrutement de {n} poste{'s' if n > 1 else ''} "
                               "en N+1 (2025-2026) en raison du remplacement des départs à la retraite "
                               f"({R} retraites pour un plafond de {P}). Avec un plafond strict, le quota serait de "
                               f"{x['quota_plafond_prioritaire']}. Ce dépassement nécessite une validation "
                               "administrative ou budgétaire.")
    else:
        assert not [m for m in messages if "N+1 " in m]


def test_sans_plafond_aucun_depassement():
    _, traj, t = _tout([_ecole(actuels=4)], _agents(3))
    x = traj["plafond"][0]
    assert x["plafond"] is None and x["depassement_plafond"] == 0
    assert x["quota_plafond_prioritaire"] == max(x["quota_avant_plafond"], x["departs_retraite"])
    assert _lignes(t)["depassement_plafond"]["natures"][1] == "non_disponible"


# --- Année de mesure des âges -------------------------------------------------------------------------------------

@pytest.mark.parametrize("annee_ages,decalage", [
    ("2024-2025", -1),   # mesurés pendant l'année de base : un an de moins qu'au début de N+1
    ("2025-2026", 0),    # mesurés à N+1
    ("2026-2027", 1),    # deux ans après la base (cas de la base nationale 2024-2025 calculée en 2026)
    ("2023-2024", -2),   # avant la base
    (None, 0),           # non précisée : supposés au début de N+1, retraites provisoires
])
def test_decalage_des_ages(annee_ages, decalage):
    h = _hyp()
    h["retraite"]["annee_ages"] = annee_ages
    assert decalage_ages(h, "2024-2025") == decalage
    # Un agent de 59 ans dans le fichier : il a 59 − décalage ans au début de N+1.
    assert annee_depart(59, h, decalage) == annee_depart(59 - decalage, h)
    ens = [Enseignant(matricule="A", ecole_attache="E1", age=59)]
    p, departs = projeter_ecoles([_ecole(actuels=1)], ens, defaut(), h, decalage=decalage)
    assert ens[0].age == 59                     # l'âge importé n'est jamais modifié
    assert [d.annee for d in departs] == [annee_depart(59 - decalage, h)]
    t = construire(p, ens, {s: calculer_annees(p, h, scenario=s) for s in SCENARIOS}, calculer_annees(p, h), h,
                   annee_scolaire="2024-2025", departs=departs, decalage=decalage)
    nature = _lignes(t)["departs_retraite"]["natures"][1]
    assert nature == ("provisoire" if annee_ages is None else "projete")
    assert ("annee_ages_absente" in {a["code"] for a in t["avertissements"]}) is (annee_ages is None)


def test_age_legal_atteint_entre_deux_rentrees():
    h = _hyp()
    assert annee_depart(59, h) == 1                 # 60 ans à la rentrée de N+2
    h["retraite"]["date_reference"] = "fin_annee_civile"
    assert annee_depart(59, h) == 0                 # 60 ans au 31 décembre de N+1
    assert annee_depart(None, h) is None            # âge absent : jamais supposé


def test_chronologie_base_n1_n5_et_sens_de_l_annee():
    assert libelles_annees("2024-2025", 5) == ["Base (2024-2025)", "N+1 (2025-2026)", "N+2 (2026-2027)",
                                               "N+3 (2027-2028)", "N+4 (2028-2029)", "N+5 (2029-2030)"]
    # D4 : le calendrier historique (année = rentrée préparée) est conservé tant que le sens n'est pas confirmé.
    assert annee_des_donnees("2026-2027", "rentree_preparee") == annee_des_donnees("2026-2027", "non_confirme") == "2025-2026"
    assert annee_des_donnees("2026-2027", "donnees") == "2026-2027"
    assert annee_des_donnees("illisible", "rentree_preparee") == "illisible"


def test_bandeau_donnees_fictives_texte_exact():
    _, _, t = _tout([_ecole()], _agents(1), contexte={"donnees_fictives": True})
    assert t["texte_donnees_fictives"] == TEXTE_DONNEES_FICTIVES == (
        "Données fictives — simulation de démonstration. Ces résultats ne représentent pas la situation réelle du "
        "Cameroun.")
    assert t["avertissements"][0] == {"code": "donnees_fictives", "gravite": "important",
                                      "message": TEXTE_DONNEES_FICTIVES}
    _, _, t = _tout([_ecole()], _agents(1), contexte={"donnees_fictives": False})
    assert t["texte_donnees_fictives"] is None


# --- API : origine fictive, sens de l'année, permissions, anciens jeux ------------------------------------------

@pytest.mark.django_db
def test_demonstration_toujours_fictive_import_jamais_deduit_du_nom(drh):
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 120}, content_type=J)
    demo = r.json()
    assert demo["donnees_fictives"] is True and demo["sens_annee_scolaire"] == "donnees"
    p = drh.get(B + f"jeux/{demo['id']}/planification/previsionnel/").json()
    assert p["contexte"]["donnees_fictives"] and p["texte_donnees_fictives"] == TEXTE_DONNEES_FICTIVES
    r = drh.patch(B + f"jeux/{demo['id']}/", {"donnees_fictives": False}, content_type=J)
    assert r.status_code == 422
    etab, ens = _national(30, 150)
    imp = _importer(drh, etab, ens, nom="Jeu de démonstration fictif").json()
    # Le nom ne suffit pas : seule une origine vérifiable (source ou marqueur déclaré) compte.
    assert imp["donnees_fictives"] is False
    p = drh.get(B + f"jeux/{imp['id']}/planification/previsionnel/").json()
    assert p["texte_donnees_fictives"] is None
    assert "donnees_fictives" not in {a["code"] for a in p["avertissements"]}


@pytest.mark.django_db
def test_modification_du_jeu_journalisee_et_reversible(drh):
    etab, ens = _national(30, 150)
    imp = _importer(drh, etab, ens).json()
    url = B + f"jeux/{imp['id']}/"
    avant = drh.get(B + f"jeux/{imp['id']}/planification/previsionnel/").json()
    r = drh.patch(url, {"sens_annee_scolaire": "rentree_preparee", "donnees_fictives": True}, content_type=J)
    assert r.status_code == 200, r.content
    j = r.json()
    assert j["annee_scolaire"] == imp["annee_scolaire"]          # l'année saisie n'est jamais réécrite
    debut = int(imp["annee_scolaire"][:4])
    assert j["annee_donnees"] == f"{debut - 1}-{debut}" and j["donnees_fictives"]
    apres = drh.get(B + f"jeux/{imp['id']}/planification/previsionnel/").json()
    assert apres["annee_base"] == f"{debut - 1}-{debut}" != avant["annee_base"]
    assert apres["annees"][1] == f"N+1 ({debut}-{debut + 1})"
    journal = drh.get(B + f"jeux/{imp['id']}/journal-audit/").json()
    evts = journal["resultats"] if isinstance(journal, dict) else journal
    assert any(e["action"] == "modification du jeu" for e in evts)
    r = drh.patch(url, {"sens_annee_scolaire": "donnees", "donnees_fictives": False}, content_type=J)
    assert r.status_code == 200 and r.json()["annee_donnees"] == imp["annee_scolaire"]
    assert drh.patch(url, {"sens_annee_scolaire": "demain"}, content_type=J).status_code == 422


@pytest.mark.django_db
def test_permissions_de_modification_du_jeu(drh, centre, littoral):
    etab, ens = _national(40, 200)
    regional = _importer(centre, etab, ens).json()
    url = B + f"jeux/{regional['id']}/"
    assert littoral.patch(url, {"donnees_fictives": True}, content_type=J).status_code == 404
    assert drh.patch(url, {"donnees_fictives": True}, content_type=J).status_code == 403
    r = centre.patch(url, {"donnees_fictives": True}, content_type=J)
    assert r.status_code == 200 and r.json()["donnees_fictives"] is True
    # Le DRH lit le marqueur d'un jeu régional sans pouvoir le changer.
    assert drh.get(url).json()["donnees_fictives"] is True


@pytest.mark.django_db(transaction=True)
def test_anciens_jeux_non_confirmes_migration_reversible():
    executor = MigrationExecutor(connection)
    executor.migrate([("donnees", "0008_suivi_double_flux")])
    with connection.cursor() as c:
        c.execute("INSERT INTO donnees_jeudedonnees (id, nom, source, cree_le, portee, region, consolide_depuis, "
                  "statut, valide_le, valide_par, annee_scolaire) VALUES ('00112233445566778899aabbccddeeff', "
                  "'Ancien', 'import', '2026-10-01 08:00:00', 'national', NULL, '[]', 'brouillon', NULL, '', "
                  "'2026-2027')")
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate([("donnees", "0009_sens_annee_et_donnees_fictives")])
    with connection.cursor() as c:
        c.execute("SELECT annee_scolaire, sens_annee_scolaire, donnees_fictives FROM donnees_jeudedonnees "
                  "WHERE nom = 'Ancien'")
        assert c.fetchone() == ("2026-2027", "non_confirme", 0)
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate([("donnees", "0008_suivi_double_flux")])
    with connection.cursor() as c:
        c.execute("SELECT annee_scolaire FROM donnees_jeudedonnees WHERE nom = 'Ancien'")
        assert c.fetchone() == ("2026-2027",)
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(executor.loader.graph.leaf_nodes())
