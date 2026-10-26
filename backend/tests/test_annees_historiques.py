"""Vérification finale de D4 : les anciens jeux gardent leur calendrier historique, les nouveaux portent l'année de
leurs données, un sens non confirmé n'est jamais présenté comme l'année réelle, et rien n'est décalé sans raison."""
import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from contextes.donnees.models import JeuDeDonnees
from domaine.donnees.annee_scolaire import (SENS_DONNEES, SENS_NON_CONFIRME, SENS_RENTREE, annee_des_donnees,
                                            normaliser_annee_scolaire)
from domaine.planification.projection import decalage_ages
from tests.outils_acces import B

J = "application/json"
pytestmark = pytest.mark.django_db


def _demo(client, annee, sens, **extra):
    r = client.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 120, "graine": 3,
                                                "annee_scolaire": annee, "sens_annee_scolaire": sens, **extra},
                    content_type=J)
    assert r.status_code == 201, r.content
    return r.json()


def _annees(client, jeu):
    return client.get(B + f"jeux/{jeu}/planification/previsionnel/").json()["annees"]


def test_cas_1_ancien_jeu_rentree_preparee_2026_2027(drh):
    j = _demo(drh, "2026-2027", SENS_RENTREE)
    assert _annees(drh, j["id"]) == ["Base (2025-2026)", "N+1 (2026-2027)", "N+2 (2027-2028)", "N+3 (2028-2029)",
                                     "N+4 (2029-2030)", "N+5 (2030-2031)"]
    assert j["annee_donnees"] == "2025-2026" and j["annee_scolaire"] == "2026-2027"


def test_cas_2_nouveau_jeu_donnees_2026_2027(drh):
    j = _demo(drh, "2026-2027", SENS_DONNEES)
    assert _annees(drh, j["id"]) == ["Base (2026-2027)", "N+1 (2027-2028)", "N+2 (2028-2029)", "N+3 (2029-2030)",
                                     "N+4 (2030-2031)", "N+5 (2031-2032)"]
    assert j["sens_annee_origine"] == "creation" and j["annee_donnees"] == "2026-2027"


def test_cas_3_sens_non_confirme_lecture_historique_et_avertissement(drh):
    j = _demo(drh, "2026-2027", SENS_NON_CONFIRME)
    p = drh.get(B + f"jeux/{j['id']}/planification/previsionnel/").json()
    assert p["annees"][0] == "Base (2025-2026)"
    a = next(x for x in p["avertissements"] if x["code"] == "sens_annee_non_confirme")
    assert "Confirmez" in a["message"]
    assert p["contexte"]["sens_annee_scolaire"] == "non_confirme"
    # Le libellé brut saisi n'est jamais présenté comme l'année réelle : l'année des données est celle de la lecture
    # historique, et le jeu reste signalé « non confirmé ».
    assert j["annee_scolaire"] == "2026-2027" and j["sens_annee_scolaire"] == "non_confirme"


def test_annee_des_donnees_et_formes_illisibles():
    assert [annee_des_donnees("2026-2027", s) for s in (SENS_DONNEES, SENS_RENTREE, SENS_NON_CONFIRME)] == [
        "2026-2027", "2025-2026", "2025-2026"]
    assert annee_des_donnees("n'importe quoi", SENS_RENTREE) == "n'importe quoi"      # aucune année inventée
    assert annee_des_donnees("", SENS_DONNEES) == ""
    assert normaliser_annee_scolaire("2026/2027") == "2026-2027"
    with pytest.raises(ValueError):
        normaliser_annee_scolaire("2026-2028")


def test_nouveau_jeu_sans_sens_precise_est_donnees(drh):
    """L'import d'une version antérieure de l'interface (sans sens) enregistre « donnees »."""
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 10, "nb_enseignants": 50, "annee_scolaire": "2026-2027"},
                 content_type=J)
    assert (r.json()["sens_annee_scolaire"], r.json()["sens_annee_origine"]) == ("donnees", "creation")
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 10, "nb_enseignants": 50, "sens_annee_scolaire": "autre"},
                 content_type=J)
    assert r.status_code == 422 and r.json()["code"] == "sens_annee_invalide"


def test_modification_du_sens_est_journalisee_et_invalide_les_projections(drh):
    j = _demo(drh, "2026-2027", SENS_NON_CONFIRME)
    jid = j["id"]
    drh.get(B + f"jeux/{jid}/planification/previsionnel/")
    assert drh.get(B + f"jeux/{jid}/planification/etat/").json()["obsolete"] is False
    r = drh.patch(B + f"jeux/{jid}/", {"sens_annee_scolaire": SENS_RENTREE}, content_type=J)
    assert r.status_code == 200 and r.json()["sens_annee_origine"] == "confirmation"
    # Lecture inchangée (même base 2025-2026) : rien à recalculer, mais le choix est tracé.
    assert drh.get(B + f"jeux/{jid}/planification/etat/").json()["obsolete"] is False
    r = drh.patch(B + f"jeux/{jid}/", {"sens_annee_scolaire": SENS_DONNEES}, content_type=J)
    assert r.json()["annee_donnees"] == "2026-2027" and r.json()["annee_scolaire"] == "2026-2027"
    assert drh.get(B + f"jeux/{jid}/planification/etat/").json()["obsolete"] is True        # base changée
    lst = drh.get(B + f"jeux/{jid}/journal-audit/", {"type": "import"}).json()["resultats"]
    assert sum(1 for e in lst if e["action"] == "modification du jeu") == 2
    detail = drh.get(B + f"jeux/{jid}/journal-audit/{next(e for e in lst if e['action'] == 'modification du jeu')['id']}/"
                     ).json()
    assert detail["avant"]["sens_annee_scolaire"] == SENS_RENTREE and detail["apres"]["sens_annee_scolaire"] == SENS_DONNEES


def test_un_delegue_confirme_le_sens_de_son_jeu_et_pas_celui_d_un_autre(centre, littoral):
    j = _demo(centre, "2026-2027", SENS_NON_CONFIRME)
    assert littoral.patch(B + f"jeux/{j['id']}/", {"sens_annee_scolaire": SENS_DONNEES}, content_type=J
                          ).status_code in (403, 404)
    assert centre.patch(B + f"jeux/{j['id']}/", {"sens_annee_scolaire": SENS_DONNEES}, content_type=J
                        ).status_code == 200


def test_modification_du_sens_ne_change_ni_quotas_ni_besoin_par_elle_seule(drh):
    """Libellé seul : les chiffres sont identiques tant que la base n'est pas décalée (aucune année de mesure des âges)."""
    a = _demo(drh, "2026-2027", SENS_RENTREE)
    b = _demo(drh, "2026-2027", SENS_NON_CONFIRME)
    pa = drh.get(B + f"jeux/{a['id']}/planification/previsionnel/").json()
    pb = drh.get(B + f"jeux/{b['id']}/planification/previsionnel/").json()
    val = lambda p: ({l["cle"]: l["valeurs"] for g in p["groupes"] for l in g["lignes"]}, p["scenarios"])  # noqa: E731
    assert val(pa) == val(pb)


def test_aucun_decalage_injustifie_des_retraites():
    """Deux jeux qui ont la même année de base reçoivent le même décalage des âges, quelle que soit l'étiquette ;
    seul un changement réel de la base (un an) décale les retraites, d'exactement un an."""
    hyp = {"retraite": {"annee_ages": "2025-2026"}}
    base_hist = annee_des_donnees("2026-2027", SENS_RENTREE)           # 2025-2026
    base_equiv = annee_des_donnees("2025-2026", SENS_DONNEES)          # 2025-2026
    base_non_conf = annee_des_donnees("2026-2027", SENS_NON_CONFIRME)  # 2025-2026
    assert decalage_ages(hyp, base_hist) == decalage_ages(hyp, base_equiv) == decalage_ages(hyp, base_non_conf) == -1
    assert decalage_ages(hyp, annee_des_donnees("2026-2027", SENS_DONNEES)) == decalage_ages(hyp, base_hist) - 1
    assert decalage_ages({"retraite": {}}, base_hist) == 0              # année de mesure inconnue : aucun décalage


# --- Migrations 0009 et 0010 -----------------------------------------------------------------------------------

def _inserer(c, ident, nom, cree, annee="2026-2027"):
    c.execute("INSERT INTO donnees_jeudedonnees (id, nom, source, cree_le, portee, region, consolide_depuis, statut, "
              "valide_le, valide_par, annee_scolaire) VALUES (%s, %s, 'import', %s, 'national', NULL, '[]', "
              "'brouillon', NULL, '', %s)", [ident, nom, cree, annee])


def _migrer(cible):
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate([("donnees", cible)])


@pytest.mark.django_db(transaction=True)
def test_migration_0009_les_jeux_existants_deviennent_non_confirmes_sans_toucher_l_annee():
    _migrer("0008_suivi_double_flux")
    with connection.cursor() as c:
        _inserer(c, "00112233445566778899aabbccddee11", "Ancien", "2000-01-01 08:00:00", "2024-2025")
    _migrer("0009_sens_annee_et_donnees_fictives")
    with connection.cursor() as c:
        c.execute("SELECT annee_scolaire, sens_annee_scolaire, donnees_fictives FROM donnees_jeudedonnees")
        assert c.fetchall() == [("2024-2025", "non_confirme", 0)]
        # Une insertion qui ignore les nouveaux champs (version antérieure de l'application) reçoit « donnees ».
        _inserer(c, "00112233445566778899aabbccddee12", "Ecrit par l'ancienne version", "2000-01-02 08:00:00")
        c.execute("SELECT sens_annee_scolaire FROM donnees_jeudedonnees WHERE nom LIKE 'Ecrit%'")
        assert c.fetchall() == [("donnees",)]
    _migrer("0008_suivi_double_flux")
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(executor.loader.graph.leaf_nodes())


@pytest.mark.django_db(transaction=True)
def test_migration_0010_trace_l_origine_et_ne_modifie_jamais_l_annee():
    _migrer("0009_sens_annee_et_donnees_fictives")
    with connection.cursor() as c:
        _inserer(c, "00112233445566778899aabbccddee21", "Avant", "2000-01-01 08:00:00", "2023-2024")
        c.execute("UPDATE donnees_jeudedonnees SET sens_annee_scolaire = 'non_confirme'")
    _migrer("0010_sens_annee_historique")
    with connection.cursor() as c:
        c.execute("SELECT annee_scolaire, sens_annee_scolaire, sens_annee_origine FROM donnees_jeudedonnees")
        assert c.fetchall() == [("2023-2024", "non_confirme", "migration")]
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(executor.loader.graph.leaf_nodes())


@pytest.mark.django_db(transaction=True)
def test_migration_0011_aucun_jeu_existant_n_est_reclasse_d_apres_son_nombre_d_enseignants():
    _migrer("0010_sens_annee_historique")
    with connection.cursor() as c:
        _inserer(c, "00112233445566778899aabbccddee31", "Sans enseignant enregistré", "2000-01-01 08:00:00")
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(executor.loader.graph.leaf_nodes())
    assert [j.nominatif_disponible for j in JeuDeDonnees.objects.all()] == [True]
