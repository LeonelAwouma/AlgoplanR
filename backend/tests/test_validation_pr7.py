"""Validation finale de la PR #7 : calendrier des jeux (D4), plancher des retraites face au plafond (D1) et fiabilité
des retraites (fichier nominatif complet, partiel ou absent), propagée aux quatre scénarios, à l'API et aux exports."""
import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from contextes.donnees import depots
from contextes.donnees.models import JeuDeDonnees
from contextes.donnees.services import construire_ecole
from contextes.simulation.services import creer_scenarios_base
from domaine.donnees.annee_scolaire import annee_des_donnees
from domaine.donnees.demonstration import construire_jeu_demonstration
from domaine.planification.previsionnel import (MESSAGE_RETRAITES_NON_CALCULABLES, MESSAGE_SIMULATION_CONDITIONNELLE)
from domaine.planification.projection import SCENARIOS
from tests.test_coherence_effectifs import _agents, _ecole, _lignes, _plaf, _tout
from tests.test_delegue_regional import _importer, _national
from tests.test_domaine_planification import _hyp

B = "/api/v1/"
J = "application/json"
EXACT_B = ("Retraites non calculables : le fichier nominatif des enseignants est indisponible. Les scénarios de "
           "recrutement qui dépendent des retraites sont incomplets.")
EXACT_CONDITIONNEL = ("Simulation conditionnelle : aucun départ à la retraite n'a été modélisé faute de données "
                      "nominatives. Le résultat ne représente pas une prévision des retraites.")
RETRAITES = ("departs_retraite", "retraites_identifiees", "retraites_non_imputables", "recrutement_min",
             "recrutement_maintien", "plancher_retraites", "depassement_plafond", "quota_plafond_prioritaire",
             "rem_min", "rem_maintien")


def _hyp_ages(**drh):
    h = _hyp(**drh)
    h["retraite"]["annee_ages"] = "2025-2026"      # année de mesure précisée : retraites non provisoires
    return h


def _jeu_sans_fichier_nominatif(annee="2024-2025", sens="donnees", nb=30):
    """Jeu bâti comme la base nationale du MINEDUB : établissements seuls, aucun fichier nominatif."""
    etab, _ = construire_jeu_demonstration(7, nb, 150)
    jeu = JeuDeDonnees.objects.create(nom="Sans fichier nominatif", source="import", portee="national",
                                      annee_scolaire=annee, sens_annee_scolaire=sens)
    depots.enregistrer(jeu, [construire_ecole(l) for l in etab], [])
    creer_scenarios_base(jeu)
    return jeu


def _previsionnel(client, jeu):
    r = client.get(B + f"jeux/{jeu}/planification/previsionnel/")
    assert r.status_code == 200, r.content[:400]
    return r.json()


def _valeurs(p):
    """Toutes les valeurs numériques du tableau, hors libellés d'années : seul l'étiquetage du calendrier change."""
    return {l["cle"]: l["valeurs"] for g in p["groupes"] for l in g["lignes"]}, p["scenarios"]


# --- D4 : calendrier des jeux -------------------------------------------------------------------------------------

def test_les_deux_conventions_de_calendrier():
    # Jeu historique : l'année saisie est la rentrée préparée, la base est l'année précédente (N+1 = rentrée saisie).
    assert annee_des_donnees("2026-2027", "rentree_preparee") == "2025-2026"
    # Nouveau jeu : l'année saisie est celle des données.
    assert annee_des_donnees("2026-2027", "donnees") == "2026-2027"
    # Sens non confirmé : le calendrier historique est conservé, jamais une année réelle inventée.
    assert annee_des_donnees("2026-2027", "non_confirme") == "2025-2026"


def test_jeu_historique_rentree_preparee_et_jeu_nouveau_donnees(drh):
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 100, "annee_scolaire": "2026-2027",
                                              "sens_annee_scolaire": "rentree_preparee"}, content_type=J)
    assert r.status_code == 201, r.content
    p = _previsionnel(drh, r.json()["id"])
    assert p["annees"] == ["Base (2025-2026)", "N+1 (2026-2027)", "N+2 (2027-2028)", "N+3 (2028-2029)",
                           "N+4 (2029-2030)", "N+5 (2030-2031)"]
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 100, "annee_scolaire": "2026-2027",
                                              "sens_annee_scolaire": "donnees"}, content_type=J)
    j = r.json()
    assert (j["annee_scolaire"], j["sens_annee_scolaire"], j["sens_annee_origine"]) == ("2026-2027", "donnees",
                                                                                         "creation")
    p = _previsionnel(drh, j["id"])
    assert p["annees"] == ["Base (2026-2027)", "N+1 (2027-2028)", "N+2 (2028-2029)", "N+3 (2029-2030)",
                           "N+4 (2030-2031)", "N+5 (2031-2032)"]
    assert p["contexte"]["sens_annee_scolaire"] == "donnees" and p["contexte"]["annee_donnees"] == "2026-2027"


def test_jeu_ambigu_reste_non_confirme_avec_demande_de_confirmation(drh):
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 100, "annee_scolaire": "2026-2027",
                                              "sens_annee_scolaire": "non_confirme"}, content_type=J)
    j = r.json()
    p = _previsionnel(drh, j["id"])
    assert j["annee_scolaire"] == "2026-2027" and j["sens_annee_scolaire"] == "non_confirme"
    assert p["annees"][0] == "Base (2025-2026)"                  # calendrier historique, avec avertissement
    a = [x for x in p["avertissements"] if x["code"] == "sens_annee_non_confirme"]
    assert a and a[0]["gravite"] == "important" and "Confirmez" in a[0]["message"]
    assert j["annee_donnees"] == "2025-2026"                      # jamais présentée comme l'année réelle des données


def test_etiquette_seule_ne_change_ni_quotas_ni_retraites_ni_resultats(drh):
    """Même jeu, même année saisie, trois étiquettes : la base décalée d'un an ne modifie aucun résultat chiffré
    (l'année de mesure des âges n'est pas précisée), seules les années affichées changent."""
    jeux = {}
    for sens, annee in (("rentree_preparee", "2026-2027"), ("non_confirme", "2026-2027"), ("donnees", "2025-2026")):
        r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 25, "nb_enseignants": 150, "graine": 11,
                                                  "annee_scolaire": annee, "sens_annee_scolaire": sens},
                     content_type=J)
        jeux[sens] = _previsionnel(drh, r.json()["id"])
    ref = jeux["rentree_preparee"]
    for sens in ("non_confirme", "donnees"):
        assert jeux[sens]["annees"] == ref["annees"], sens
        assert _valeurs(jeux[sens]) == _valeurs(ref), sens


def test_correction_du_sens_journalisee_et_invalide_les_projections(drh):
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 100, "annee_scolaire": "2026-2027",
                                              "sens_annee_scolaire": "non_confirme"}, content_type=J)
    jeu = r.json()["id"]
    avant = _previsionnel(drh, jeu)
    r = drh.patch(B + f"jeux/{jeu}/", {"sens_annee_scolaire": "donnees"}, content_type=J)
    assert r.status_code == 200 and r.json()["sens_annee_origine"] == "confirmation"
    assert r.json()["annee_scolaire"] == "2026-2027"              # l'année brute n'est jamais réécrite
    # La projection enregistrée sur l'ancienne base est signalée périmée (jamais recalée silencieusement).
    assert drh.get(B + f"jeux/{jeu}/planification/etat/").json()["obsolete"] is True
    apres = _previsionnel(drh, jeu)
    assert avant["annees"][0] == "Base (2025-2026)" and apres["annees"][0] == "Base (2026-2027)"
    assert "sens_annee_non_confirme" not in {a["code"] for a in apres["avertissements"]}
    journal = drh.get(B + f"jeux/{jeu}/journal-audit/").json()
    evenements = journal["resultats"] if isinstance(journal, dict) else journal
    assert any(e["action"] == "modification du jeu" for e in evenements)


@pytest.mark.django_db(transaction=True)
def test_migration_classe_les_jeux_sans_changer_l_annee_enregistree():
    executor = MigrationExecutor(connection)
    executor.migrate([("donnees", "0008_suivi_double_flux")])
    with connection.cursor() as c:
        for ident, nom, cree in (("00112233445566778899aabbccddee01", "Avant", "2000-01-01 08:00:00"),
                                 ("00112233445566778899aabbccddee02", "Apres", "2099-01-01 08:00:00")):
            c.execute("INSERT INTO donnees_jeudedonnees (id, nom, source, cree_le, portee, region, consolide_depuis, "
                      "statut, valide_le, valide_par, annee_scolaire) VALUES (%s, %s, 'import', %s, 'national', NULL, "
                      "'[]', 'brouillon', NULL, '', '2026-2027')", [ident, nom, cree])
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate([("donnees", "0010_sens_annee_historique")])
    with connection.cursor() as c:
        c.execute("SELECT nom, annee_scolaire, sens_annee_scolaire, sens_annee_origine FROM donnees_jeudedonnees "
                  "ORDER BY nom")
        rows = c.fetchall()
    # Jeu antérieur à l'ajout du champ : année de migration, sens impossible à établir. Jeu postérieur : saisi sous la
    # convention « rentrée préparée ». Dans les deux cas l'année brute est intacte et l'origine est tracée.
    assert rows == [("Apres", "2026-2027", "rentree_preparee", "migration"),
                    ("Avant", "2026-2027", "non_confirme", "migration")]
    assert annee_des_donnees("2026-2027", "rentree_preparee") == annee_des_donnees("2026-2027", "non_confirme")
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate([("donnees", "0008_suivi_double_flux")])
    with connection.cursor() as c:
        c.execute("SELECT annee_scolaire FROM donnees_jeudedonnees")
        assert {r[0] for r in c.fetchall()} == {"2026-2027"}
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(executor.loader.graph.leaf_nodes())


# --- D1 : plancher des retraites et plafond ---------------------------------------------------------------------

def test_exemple_de_la_mission_retraites_84_plafond_64():
    """84 retraites en N+1, plafond de 64 : quota proposé 84 (plancher), quota à plafond strict 64, dépassement 20."""
    h = _hyp_ages(PLAF_PRI=_plaf(64, 100))
    p, traj, t = _tout([_ecole(actuels=100, eleves=100, salles=6)], _agents(84, age=62) + _agents(16, age=30, prefixe="J"),
                       hyp=h)
    x = traj["plafond"][0]
    assert (x["departs_retraite"], x["plafond"], x["quota_calcule"], x["quota_plafond_prioritaire"],
            x["depassement_plafond"]) == (84, 64, 84, 64, 20)
    l = _lignes(t)
    assert [l[c]["valeurs"][1] for c in ("quota_calcule", "plafond", "depassement_plafond",
                                        "quota_plafond_prioritaire", "departs_retraite")] == [84, 64, 20, 64, 84]
    message = next(a["message"] for a in t["avertissements"] if a["code"] == "depassement_plafond")
    assert "dépasse le plafond de recrutement de 20 postes" in message and "quota serait de 64" in message
    assert message.endswith("Ce dépassement nécessite une validation administrative ou budgétaire.")
    # Besoin calculé, quota proposé, quota retenu et recrutement réalisé restent quatre notions distinctes.
    assert l["quota_avant_plafond"]["valeurs"][1] != l["quota_calcule"]["valeurs"][1]
    assert l["quota_retenu"]["valeurs"][1] is None and l["nominations_realisees"]["valeurs"][1] is None


def test_la_regle_active_n_est_pas_remplacee_par_l_alternative():
    h = _hyp_ages(PLAF_PRI=_plaf(2, 10))
    _, traj, _ = _tout([_ecole(actuels=10)], _agents(5, age=62) + _agents(5, age=30, prefixe="J"), hyp=h)
    x = traj["plafond"][0]
    assert x["quota_calcule"] == max(min(x["quota_avant_plafond"], x["plafond"]), x["departs_retraite"])
    assert x["quota_plafond_prioritaire"] == min(max(x["quota_avant_plafond"], x["departs_retraite"]), x["plafond"])
    assert x["quota_calcule"] > x["quota_plafond_prioritaire"]


def test_retraites_non_imputables_jamais_remplacees_par_le_plancher():
    """Une école de 4 personnels avec 6 agents de 62 ans : 4 retraites imputées, 2 non imputables non remplacées."""
    h = _hyp_ages(PLAF_PRI=_plaf(1, 4))
    p, traj, _ = _tout([_ecole(actuels=4)], _agents(6), hyp=h)
    x = traj["plafond"][0]
    assert (x["departs_retraite"], x["retraites_non_imputables"], x["retraites_identifiees"]) == (4, 2, 6)
    assert x["quota_calcule"] == 4 and all(y >= 0 for y in p[0].effectifs)


# --- Fiabilité des retraites : fichier nominatif complet, partiel, absent -----------------------------------------

def test_situation_a_fichier_complet_zero_retraite_etabli():
    p, traj, t = _tout([_ecole(actuels=4)], _agents(4, age=30), hyp=_hyp_ages())
    f = t["retraites_fiabilite"]
    assert (f["statut"], f["zero_etabli"]) == ("complet", True)
    assert f["message"].startswith("0 retraite identifiée sur une population exploitable")
    codes = {a["code"] for a in t["avertissements"]}
    assert "zero_retraite_etabli" in codes and not codes & {"retraites_non_calculables", "retraites_partielles"}
    l = _lignes(t)
    assert l["departs_retraite"]["valeurs"][1:] == [0] * 5
    assert set(l["departs_retraite"]["natures"][1:]) == {"projete"}
    assert {s["fiabilite"] for s in t["scenarios"]} == {"complet"}


def test_situation_b_fichier_absent_aucun_zero_silencieux():
    p, traj, t = _tout([_ecole(actuels=4)], [], hyp=_hyp_ages())
    f = t["retraites_fiabilite"]
    assert f["statut"] == "non_calculable" and f["message"] == EXACT_B == MESSAGE_RETRAITES_NON_CALCULABLES
    assert f["message_conditionnel"] == EXACT_CONDITIONNEL == MESSAGE_SIMULATION_CONDITIONNELLE
    l = _lignes(t)
    for cle in RETRAITES:
        ligne = l[cle]
        assert all(v is None for v in ligne["valeurs"][1:]), cle           # jamais 0
        assert set(ligne["natures"][1:]) == {"non_disponible"}, cle
        assert ligne["raisons"][1] == f["raison"], cle
    codes = {a["code"] for a in t["avertissements"]}
    assert {"retraites_non_calculables", "simulation_conditionnelle"} <= codes
    assert "zero_retraite_etabli" not in codes
    # Aucun taux de 1,08 % n'est substitué aux retraites inconnues.
    assert all("1,08" not in (l[c].get("detail") or "") or "jamais" in l[c]["detail"] for c in RETRAITES)


def test_situation_c_fichier_partiel_retraites_provisoires():
    ens = _agents(2, age=62) + [Enseignant_sans_age("MX")]
    p, traj, t = _tout([_ecole(actuels=8)], ens, hyp=_hyp_ages())
    f = t["retraites_fiabilite"]
    assert f["statut"] == "partiel" and f["population"]["stock_declare"] == 8
    assert f["population"]["agents_nominatifs"] == 3 and f["population"]["agents_avec_age"] == 2
    assert "n'est pas un total exhaustif" in f["message"]
    l = _lignes(t)
    assert l["departs_retraite"]["valeurs"][1] == 2                  # ce qui est identifiable est calculé
    assert l["departs_retraite"]["natures"][1] == "provisoire"
    assert {s["fiabilite"] for s in t["scenarios"]} == {"provisoire"}
    assert "retraites_partielles" in {a["code"] for a in t["avertissements"]}


def Enseignant_sans_age(matricule):
    from domaine.donnees.modeles import Enseignant
    return Enseignant(matricule=matricule, ecole_attache="E1", age=35, age_connu=False)


def test_inconnu_n_est_pas_zero_et_se_propage_aux_quatre_scenarios():
    _, _, absent = _tout([_ecole(actuels=4)], [], hyp=_hyp_ages())
    _, _, zero = _tout([_ecole(actuels=4)], _agents(4, age=30), hyp=_hyp_ages())
    par_scenario = {s["scenario"]: s for s in absent["scenarios"]}
    assert set(par_scenario) == set(SCENARIOS)
    for s in ("min", "maintien"):        # définis par les retraites : inconnus, jamais un recrutement nul
        assert par_scenario[s]["fiabilite"] == "non_calculable"
        assert par_scenario[s]["recrutements"] == [None] * 5 and par_scenario[s]["recrutements_total"] is None
        assert par_scenario[s]["fiabilite_raison"] == EXACT_B.split(" Les scénarios")[0]
    for s in ("besoin", "plafond"):      # indépendants des retraites : calculés, mais explicitement conditionnels
        assert par_scenario[s]["fiabilite"] == "conditionnel"
        assert par_scenario[s]["fiabilite_raison"] == EXACT_CONDITIONNEL
        assert all(v is not None for v in par_scenario[s]["recrutements"])
    zeros = {s["scenario"]: s for s in zero["scenarios"]}
    assert zeros["min"]["recrutements_total"] is not None            # avec un fichier exploitable : calculé (≠ inconnu)
    # Les lignes indépendantes des retraites ne sont pas annulées.
    a, z = _lignes(absent), _lignes(zero)
    for cle in ("eleves", "croissance", "ecoles_eleves_inconnus"):
        assert a[cle]["depend_retraites"] is False and a[cle]["valeurs"] == z[cle]["valeurs"], cle
    assert all(v is not None for v in a["eleves"]["valeurs"])


# --- API : jeu bâti sans fichier nominatif (base nationale) et périmètres --------------------------------------------

@pytest.mark.django_db
def test_jeu_sans_fichier_nominatif_via_l_api(drh):
    jeu = _jeu_sans_fichier_nominatif()
    p = _previsionnel(drh, jeu.id)
    f = p["retraites_fiabilite"]
    assert f["statut"] == "non_calculable" and f["message"] == EXACT_B
    lignes = _valeurs(p)[0]
    assert all(v is None for v in lignes["departs_retraite"][1:])
    assert {s["scenario"]: s["fiabilite"] for s in p["scenarios"]} == {
        "min": "non_calculable", "maintien": "non_calculable", "besoin": "conditionnel", "plafond": "conditionnel"}
    assert {"retraites_non_calculables", "simulation_conditionnelle"} <= {a["code"] for a in p["avertissements"]}
    # Sans fichier nominatif, le rapprochement n'a rien à rapprocher : pas d'écart artificiel dans chaque école.
    assert p["rapprochement"]["ecoles"] == [] and p["rapprochement"]["synthese"]["ecoles_ecart_positif"] is None
    assert p["rapprochement"]["synthese"]["stock_declare"] > 0
    assert "effectifs_discordants" not in {a["code"] for a in p["avertissements"]}
    # Le suivi principal et le rapport DRH portent le même état que le prévisionnel.
    assert drh.get(B + f"jeux/{jeu.id}/planification/").json()["retraites_fiabilite"]["statut"] == "non_calculable"
    assert drh.get(B + f"jeux/{jeu.id}/planification/rapport/").json()["retraites_fiabilite"]["statut"] == \
        "non_calculable"


@pytest.mark.django_db
def test_rapport_drh_sans_fichier_nominatif_retraites_inconnues_pas_zero(drh):
    jeu = _jeu_sans_fichier_nominatif()
    r = drh.get(B + f"jeux/{jeu.id}/planification/rapport/").json()
    assert r["retraites_fiabilite"]["statut"] == "non_calculable"
    ret = r["retraites_regions"]
    assert ret["national"]["total"] is None and all(v is None for v in ret["national"]["annees"])
    assert all(l["total"] is None for l in ret["lignes"])
    sr = r["scenarios_regions"]
    assert sr["national"]["min"] is None and sr["national"]["maintien"] is None
    assert sr["national"]["rem_final"]["min"] is None
    assert sr["national"]["besoin"] is not None and sr["national"]["plafond"] is not None
    assert sr["fiabilite"] == {"min": "non_calculable", "maintien": "non_calculable", "besoin": "conditionnel",
                               "plafond": "conditionnel"}
    lignes = {l["libelle"]: l for l in r["national"]["lignes"]}
    assert all(v is None for v in lignes["Retraites (quota incompressible)"]["valeurs"])
    assert lignes["Recrutement S-min"]["valeurs"] == [None] * len(lignes["Recrutement S-min"]["valeurs"])
    assert lignes["Recrutement S-besoin"]["fiabilite"] == "conditionnel"
    assert lignes["Taux d'encadrement obtenu – S-min"]["valeurs"][0] is not None   # base observée conservée
    assert all(v is None for v in lignes["Taux d'encadrement obtenu – S-min"]["valeurs"][1:])
    assert r["national"]["rem_final"]["min"] is None and r["national"]["rem_final"]["maintien"] is None
    assert lignes["Élèves projetés"].get("fiabilite") is None
    assert r["redeploiement"]["national"]["retraites"] is None
    assert r["limites"][:2] == [EXACT_B, EXACT_CONDITIONNEL]
    assert all(f["priorite_provisoire"] and f["part_retraites"] is None for f in r["priorites"])
    assert all(f["recrutements"]["min"] is None and f["recrutements"]["besoin"] is not None for f in r["priorites"])


@pytest.mark.django_db
def test_jeu_complet_de_demonstration_retraites_identifiees(drh):
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 30, "nb_enseignants": 250}, content_type=J)
    p = _previsionnel(drh, r.json()["id"])
    assert p["retraites_fiabilite"]["statut"] in ("complet", "partiel")
    assert "retraites_non_calculables" not in {a["code"] for a in p["avertissements"]}
    assert any(v is not None for v in _valeurs(p)[0]["departs_retraite"][1:])


@pytest.mark.django_db
def test_perimetres_drh_et_delegue(drh, centre, littoral):
    etab, ens = _national(40, 200)
    regional = _importer(centre, etab, ens).json()
    pc = _previsionnel(centre, regional["id"])
    assert pc["retraites_fiabilite"]["population"]["stock_declare"] == pc["rapprochement"]["synthese"]["stock_declare"]
    assert pc["contexte"]["jeu_region"] == "Centre"
    # Un autre délégué ne voit pas le jeu ; le DRH lit sans pouvoir en changer le marqueur (permissions inchangées).
    assert littoral.get(B + f"jeux/{regional['id']}/planification/previsionnel/").status_code == 404
    assert drh.patch(B + f"jeux/{regional['id']}/", {"sens_annee_scolaire": "donnees"}, content_type=J).status_code \
        == 403
    assert _previsionnel(drh, regional["id"])["retraites_fiabilite"]["statut"] == pc["retraites_fiabilite"]["statut"]


# --- Paramètres pédagogiques préservés ---------------------------------------------------------------------------

def test_parametres_pedagogiques_et_modele_excel_preserves():
    from domaine.donnees import colonnes as C
    from domaine.parametrage.config import defaut
    d = defaut()
    assert d["besoin"]["norme_eleves_par_maitre"] == 74.4 and _hyp()["drh"]["REM_REF_PRI"] == 74.4
    assert d["besoin"]["plancher_pedagogique"] == 3
    assert "Nombre_Groupes_Pedagogiques" not in " ".join(C.COLONNES_ATTENDUES_ETAB + C.COLONNES_OPTIONNELLES_ETAB)
