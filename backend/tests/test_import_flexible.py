"""D7 : import des établissements seuls (fichier nominatif facultatif), actualisation vers un jeu complet, refus
explicites des fonctions nominatives, permissions et fiabilité des résultats sans fichier nominatif.

Chaque test passe par l'API HTTP, comme l'interface."""
import io

import pandas as pd
import pytest

from contextes.donnees.models import Actualisation, Enseignant, Etablissement, JeuDeDonnees
from domaine.donnees.demonstration import construire_jeu_demonstration
from domaine.planification.previsionnel import MESSAGE_RETRAITES_NON_CALCULABLES, MESSAGE_SIMULATION_CONDITIONNELLE
from tests.outils_acces import B
from tests.test_delegue_regional import _national

pytestmark = pytest.mark.django_db

J = "application/json"
MESSAGE_UTILISATEUR = ("Vous pouvez poursuivre avec les établissements seuls.")


def _fichier(client, type_fichier, lignes, nom=None):
    buf = io.BytesIO()
    pd.DataFrame(lignes).to_excel(buf, index=False)
    buf.name = nom or f"{type_fichier}.xlsx"
    buf.seek(0)
    r = client.post(B + "fichiers/", {"type": type_fichier, "fichier": buf})
    assert r.status_code == 201, r.content
    return r.json()["id"]


def _etab_seuls(client, etab, **extra):
    return client.post(B + "jeux/", {"fichier_etablissements": _fichier(client, "etablissements", etab), **extra},
                       content_type=J)


def _jeu_seul(client, nb=30, graine=5, **extra):
    etab, ens = construire_jeu_demonstration(graine, nb, nb * 6)
    r = _etab_seuls(client, etab, **extra)
    assert r.status_code == 201, r.content
    return r.json(), etab, ens


def _previsionnel(client, jeu):
    r = client.get(B + f"jeux/{jeu}/planification/previsionnel/")
    assert r.status_code == 200, r.content[:500]
    return r.json()


# --- 1. Création -------------------------------------------------------------------------------------------------

def test_import_complet_reste_inchange(drh):
    etab, ens = construire_jeu_demonstration(5, 20, 120)
    r = drh.post(B + "jeux/", {"fichier_etablissements": _fichier(drh, "etablissements", etab),
                               "fichier_enseignants": _fichier(drh, "enseignants", ens)}, content_type=J)
    assert r.status_code == 201, r.content
    j = r.json()
    assert j["nominatif_disponible"] is True and j["mode_import"] == "complet" and j["message_mode_import"] is None
    assert j["nb_enseignants"] == 120 and j["nb_etablissements"] == 20
    assert set(j["fichiers_source"]) == {"etablissements", "enseignants"}


@pytest.mark.parametrize("corps", [{}, {"fichier_enseignants": None}, {"fichier_enseignants": ""}])
def test_import_etablissements_seuls_sans_identifiant_enseignant(drh, corps):
    """Aucun identifiant de fichier enseignant n'est exigé, ni inventé : absent, nul ou vide = établissements seuls."""
    j, etab, _ = _jeu_seul(drh, **corps)
    assert j["nominatif_disponible"] is False and j["mode_import"] == "etablissements_seuls"
    assert "établissements seuls" in j["message_mode_import"]
    assert j["nb_etablissements"] == len(etab)
    assert j["fichiers_source"].keys() == {"etablissements"}


def test_l_absence_est_enregistree_et_aucun_enseignant_n_est_cree(drh):
    j, etab, _ = _jeu_seul(drh)
    jeu = JeuDeDonnees.objects.get(pk=j["id"])
    assert jeu.nominatif_disponible is False
    assert Enseignant.objects.filter(jeu=jeu).count() == 0              # aucun faux enseignant ni matricule fictif
    assert j["nb_enseignants"] is None                                  # inconnu, pas « 0 enseignant »
    assert j["donnees_manquantes"]["enseignants_sans_age"] is None
    qualite = drh.get(B + f"jeux/{j['id']}/qualite/").json()
    assert qualite["statistiques"]["nb_enseignants"] is None
    assert qualite["nominatif_disponible"] is False
    assert any(a["code"] == "NOMINATIF_ABSENT" for a in qualite["avertissements"])
    assert not qualite["erreurs"]


def test_refus_sans_fichier_d_etablissements(drh):
    etab, ens = construire_jeu_demonstration(5, 10, 40)
    for corps in ({}, {"fichier_enseignants": _fichier(drh, "enseignants", ens)}):
        r = drh.post(B + "jeux/", corps, content_type=J)
        assert r.status_code == 422 and r.json()["code"] == "etablissements_requis", r.content
    assert JeuDeDonnees.objects.count() == 0


def test_un_fichier_d_enseignants_ne_peut_pas_tenir_lieu_d_etablissements(drh):
    etab, ens = construire_jeu_demonstration(5, 10, 40)
    r = drh.post(B + "jeux/", {"fichier_etablissements": _fichier(drh, "enseignants", ens)}, content_type=J)
    assert r.status_code == 422
    r = drh.post(B + "jeux/", {"fichier_etablissements": _fichier(drh, "etablissements", etab),
                               "fichier_enseignants": _fichier(drh, "etablissements", etab, "bis.xlsx")},
                 content_type=J)
    assert r.status_code == 422


def test_colonnes_en_mode_etablissements_seuls(drh):
    """Les colonnes obligatoires des établissements restent contrôlées ; aucune colonne d'enseignant n'est exigée."""
    etab, _ = construire_jeu_demonstration(5, 10, 40)
    sans_id = [{k: v for k, v in l.items() if k != "Identifiant_Ecole"} for l in etab]
    r = _etab_seuls(drh, sans_id)
    assert r.status_code == 422 and r.json()["code"] == "correspondance_incomplete"
    r = _etab_seuls(drh, etab)
    assert r.status_code == 201


def test_stock_administratif_declare_conserve_sans_etre_confondu_avec_une_liste(drh):
    j, etab, _ = _jeu_seul(drh)
    declare = sum(float(l["Enseignants_Actuels"]) for l in etab)
    assert declare > 0
    assert sum(e.enseignants_actuels for e in Etablissement.objects.filter(jeu_id=j["id"])) == declare
    p = _previsionnel(drh, j["id"])
    assert p["contexte"]["personnels_stock_declare"] == declare
    assert p["contexte"]["personnels_nominatifs"] is None                # liste inconnue, stock connu
    assert p["contexte"]["mode_import"] == "etablissements_seuls"


# --- 2. Fiabilité des résultats ----------------------------------------------------------------------------------

def test_retraites_non_calculables_et_scenarios_qualifies(drh):
    j, _, _ = _jeu_seul(drh)
    p = _previsionnel(drh, j["id"])
    f = p["retraites_fiabilite"]
    assert f["statut"] == "non_calculable" and f["zero_etabli"] is False
    assert f["message"] == MESSAGE_RETRAITES_NON_CALCULABLES
    assert f["message_conditionnel"] == MESSAGE_SIMULATION_CONDITIONNELLE
    lignes = {l["cle"]: l for g in p["groupes"] for l in g["lignes"]}
    assert lignes["departs_retraite"]["valeurs"][1:] == [None] * 5       # inconnues, jamais 0
    assert set(lignes["departs_retraite"]["natures"][1:]) == {"non_disponible"}
    par = {s["scenario"]: s for s in p["scenarios"]}
    assert par["min"]["fiabilite"] == "non_calculable" and par["min"]["recrutements_total"] is None
    assert par["maintien"]["fiabilite"] == "non_calculable" and par["maintien"]["recrutements_total"] is None
    assert par["besoin"]["fiabilite"] == "conditionnel" and par["besoin"]["recrutements_total"] is not None
    assert par["plafond"]["fiabilite"] == "conditionnel"
    codes = {a["code"] for a in p["avertissements"]}
    assert {"retraites_non_calculables", "simulation_conditionnelle"} <= codes


def test_aucun_stock_declare_ne_donne_pas_un_zero_de_retraite_etabli(drh):
    """Même sans colonne d'effectif déclaré, l'absence du fichier nominatif reste « non calculable »."""
    etab, _ = construire_jeu_demonstration(5, 15, 90)
    for l in etab:
        l["Enseignants_Actuels"] = None
    j = _etab_seuls(drh, etab).json()
    f = _previsionnel(drh, j["id"])["retraites_fiabilite"]
    assert f["statut"] == "non_calculable" and f["zero_etabli"] is False


def test_indicateurs_scolaires_calcules_sans_fichier_nominatif(drh):
    j, etab, _ = _jeu_seul(drh)
    jid = j["id"]
    assert drh.get(B + f"jeux/{jid}/etablissements/").status_code == 200
    ecole = etab[0]["Identifiant_Ecole"]
    d = drh.get(B + f"jeux/{jid}/etablissements/{ecole}/")
    assert d.status_code == 200
    assert d.json()["enseignants_en_poste"] is None and d.json()["enseignants_du_vivier"] is None
    assert drh.get(B + f"jeux/{jid}/planification/").status_code == 200
    assert drh.get(B + f"jeux/{jid}/planification/rapport/").status_code == 200
    synthese = drh.get(B + f"jeux/{jid}/synthese/").json()
    s = synthese["synthese"]
    assert s["nominatif_disponible"] is False
    assert all(s[k] is None for k in ("disponibles", "affectes", "non_affectes", "a_recruter"))     # inconnus, pas 0
    assert s["besoin_total"] > 0                                          # le besoin des écoles reste établi
    assert "enseignant(s) mobilisable(s)" not in synthese["narratif"]
    assert any(p["code"] == "NOMINATIF_ABSENT" for p in synthese["points_attention"])


NOMINATIF = "nominatif_indisponible"


def test_fonctions_nominatives_refusees_avec_explication(drh):
    """Chaque fonction qui exige des agents identifiés refuse explicitement ; aucun matricule n'est inventé."""
    j, etab, _ = _jeu_seul(drh)
    jid = j["id"]
    sid = drh.get(B + f"jeux/{jid}/scenarios/").json()[0]["id"]
    ecole = etab[0]["Identifiant_Ecole"]
    gets = ["enseignants/", "enseignants/M1/", "recherche/enseignants/?q=a", "faits-prince/bases/enseignants/",
            f"scenarios/{sid}/affectations/", f"scenarios/{sid}/non-affectes/", f"scenarios/{sid}/vivier/",
            f"scenarios/{sid}/postes/", f"scenarios/{sid}/export/", f"scenarios/{sid}/flux/", "rapport/"]
    for url in gets:
        r = drh.get(B + f"jeux/{jid}/{url}")
        assert r.status_code == 422 and r.json()["code"] == NOMINATIF, (url, r.status_code, r.content[:200])
        assert "établissements seuls" in " ".join(r.json()["motifs"])
    posts = [("faits-prince/", {"id_ens": "M1", "id_etab": ecole, "motif": "x"}), ("faits-prince/impact/", {}),
             ("nominations/generer/", {}), ("nominations/", {"personne": "p", "poste": "q", "motif": "m"}),
             (f"scenarios/{sid}/executer/", {}), ("scenarios/", {"code": "x"})]
    for url, corps in posts:
        r = drh.post(B + f"jeux/{jid}/{url}", corps, content_type=J)
        assert r.status_code == 422 and r.json()["code"] == NOMINATIF, (url, r.status_code, r.content[:200])
    assert Enseignant.objects.filter(jeu_id=jid).count() == 0
    assert JeuDeDonnees.objects.get(pk=jid).faits_prince.count() == 0


def test_departs_et_fiabilite_sans_nominatif_sont_inconnus_pas_nuls(drh):
    j, _, _ = _jeu_seul(drh)
    d = drh.get(B + f"jeux/{j['id']}/planification/departs/").json()
    assert d["retraites"] is None and d["retraites_calculables"] is False
    assert d["message"] == MESSAGE_RETRAITES_NON_CALCULABLES
    f = drh.get(B + f"jeux/{j['id']}/planification/fiabilite/").json()["global"]
    assert f["enseignants"] is None and f["taux_date_naissance"] is None and f["taux_sous_systeme"] is None
    ind = {i["indicateur"]: i for i in drh.get(B + f"jeux/{j['id']}/planification/").json()["fiabilite"]}
    assert "indisponible" in ind["departs_retraite"]["detail"] and ind["departs_retraite"]["niveau"] == "faible"


# --- 3. Actualisation : du jeu incomplet au jeu complet, sans suppression silencieuse ------------------------------

def _actualiser(client, jeu, etab, ens=None, **extra):
    corps = {"etablissements": _fichier(client, "etablissements", etab, "etab_maj.xlsx"), **extra}
    if ens is not None:
        corps["enseignants"] = _fichier(client, "enseignants", ens, "ens_maj.xlsx")
    return client.post(B + f"jeux/{jeu}/actualisations/", corps, content_type=J)


def _jeu_complet(client, nb=25, graine=5):
    etab, ens = construire_jeu_demonstration(graine, nb, nb * 6)
    r = client.post(B + "jeux/", {"fichier_etablissements": _fichier(client, "etablissements", etab),
                                  "fichier_enseignants": _fichier(client, "enseignants", ens)}, content_type=J)
    assert r.status_code == 201, r.content
    return r.json(), etab, ens


def test_actualisation_d_un_jeu_incomplet_vers_un_jeu_complet(drh):
    j, etab, ens = _jeu_seul(drh)
    jid = j["id"]
    avant = _previsionnel(drh, jid)
    assert avant["retraites_fiabilite"]["statut"] == "non_calculable"
    r = _actualiser(drh, jid, etab, ens)
    assert r.status_code == 201, r.content
    act = r.json()
    assert act["mode_nominatif"] == "remplace" and act["resume"]["arrivees"] == len(ens)
    jeu = JeuDeDonnees.objects.get(pk=jid)
    assert jeu.nominatif_disponible is True and Enseignant.objects.filter(jeu=jeu).count() == len(ens)
    resume = drh.get(B + f"jeux/{jid}/").json()
    assert resume["mode_import"] == "complet" and resume["nb_enseignants"] == len(ens)
    assert set(resume["fichiers_source"]) == {"etablissements", "enseignants"}
    # Indicateurs dépendant des enseignants recalculés : les retraites ne sont plus « non calculables ».
    apres = _previsionnel(drh, jid)
    assert apres["retraites_fiabilite"]["statut"] != "non_calculable"
    assert apres["contexte"]["personnels_nominatifs"] > 0
    # Les fonctions nominatives sont désormais ouvertes.
    assert drh.get(B + f"jeux/{jid}/enseignants/").status_code == 200
    # Journalisée, avec le sort des données nominatives.
    ev = [e for e in drh.get(B + f"jeux/{jid}/journal-audit/").json()["resultats"] if e["type"] == "actualisation"]
    assert ev and "nouveau fichier d'enseignants" in ev[0]["resume"]
    assert Actualisation.objects.get(jeu=jeu).mode_nominatif == "remplace"


def test_actualisation_marque_les_projections_comme_obsoletes(drh):
    from contextes.planification.models import EtatPlanification
    j, etab, ens = _jeu_seul(drh)
    _previsionnel(drh, j["id"])
    EtatPlanification.objects.filter(jeu_id=j["id"]).update(obsolete=False)
    assert _actualiser(drh, j["id"], etab, ens).status_code == 201
    assert EtatPlanification.objects.get(jeu_id=j["id"]).obsolete is True


def test_actualisation_sans_nouveau_fichier_ne_supprime_aucun_enseignant(drh):
    """Absence de nouveau fichier ≠ suppression : les enseignants enregistrés sont conservés."""
    j, etab, ens = _jeu_complet(drh)
    jid = j["id"]
    avant = set(Enseignant.objects.filter(jeu_id=jid).values_list("matricule", flat=True))
    r = _actualiser(drh, jid, etab)
    assert r.status_code == 201, r.content
    assert r.json()["mode_nominatif"] == "conserve" and r.json()["resume"]["departs"] == 0
    jeu = JeuDeDonnees.objects.get(pk=jid)
    assert jeu.nominatif_disponible is True
    assert set(Enseignant.objects.filter(jeu=jid).values_list("matricule", flat=True)) == avant
    assert drh.get(B + f"jeux/{jid}/").json()["nb_enseignants"] == len(ens)


def test_remplacement_du_fichier_nominatif_distinct_de_l_absence_de_fichier(drh):
    j, etab, ens = _jeu_complet(drh)
    reduit = ens[:100]
    r = _actualiser(drh, j["id"], etab, reduit)
    assert r.status_code == 201 and r.json()["mode_nominatif"] == "remplace"
    assert r.json()["resume"]["departs"] == len(ens) - 100
    assert Enseignant.objects.filter(jeu_id=j["id"]).count() == 100


def test_suppression_des_donnees_nominatives_seulement_sur_demande_explicite(drh):
    j, etab, ens = _jeu_complet(drh)
    jid = j["id"]
    r = _actualiser(drh, jid, etab, ens, supprimer_nominatif=True)               # contradictoire : refusé
    assert r.status_code == 422 and r.json()["code"] == "nominatif_contradictoire"
    assert Enseignant.objects.filter(jeu_id=jid).count() == len(ens)
    r = _actualiser(drh, jid, etab, supprimer_nominatif=True)
    assert r.status_code == 201 and r.json()["mode_nominatif"] == "supprime"
    jeu = JeuDeDonnees.objects.get(pk=jid)
    assert jeu.nominatif_disponible is False and Enseignant.objects.filter(jeu=jeu).count() == 0
    assert _previsionnel(drh, jid)["retraites_fiabilite"]["statut"] == "non_calculable"
    ev = [e for e in drh.get(B + f"jeux/{jid}/journal-audit/").json()["resultats"] if e["type"] == "actualisation"]
    assert "supprimées à la demande" in ev[0]["resume"]
    # Un jeu sans nominatif n'a rien à supprimer.
    r = _actualiser(drh, jid, etab, supprimer_nominatif=True)
    assert r.status_code == 422 and r.json()["code"] == "nominatif_deja_absent"


def test_actualisation_d_un_jeu_incomplet_sans_fichier_reste_incomplet(drh):
    j, etab, _ = _jeu_seul(drh)
    r = _actualiser(drh, j["id"], etab)
    assert r.status_code == 201 and r.json()["mode_nominatif"] == "aucun"
    assert JeuDeDonnees.objects.get(pk=j["id"]).nominatif_disponible is False
    assert Enseignant.objects.filter(jeu_id=j["id"]).count() == 0


def test_actualisation_sans_fichier_d_etablissements_refusee(drh):
    j, _, ens = _jeu_complet(drh)
    r = drh.post(B + f"jeux/{j['id']}/actualisations/", {"enseignants": _fichier(drh, "enseignants", ens)},
                 content_type=J)
    assert r.status_code == 422 and r.json()["code"] == "etablissements_requis"


def test_la_decision_d_un_fait_du_prince_survit_a_l_actualisation_conservant_les_enseignants(drh):
    """Jeu complet : le fait du Prince reste actif et prioritaire quand seule la base des établissements change."""
    j, etab, ens = _jeu_complet(drh, nb=20)
    jid = j["id"]
    jeu = JeuDeDonnees.objects.get(pk=jid)
    t = Enseignant.objects.filter(jeu=jeu).first()
    cible = next(e["Identifiant_Ecole"] for e in etab if e["Identifiant_Ecole"] != t.ecole_attache)
    r = drh.post(B + f"jeux/{jid}/faits-prince/", {"id_ens": t.matricule, "id_etab": cible, "motif": "Décision"},
                 content_type=J)
    assert r.status_code == 201, r.content
    assert _actualiser(drh, jid, etab).status_code == 201
    faits = drh.get(B + f"jeux/{jid}/faits-prince/").json()
    assert [f["statut"] for f in faits] == ["ACTIF"]


def test_fait_du_prince_inapplicable_sans_matricules(drh):
    """Établissements seuls : un fait du Prince porte sur des matricules, il est refusé et rien n'est enregistré."""
    j, etab, _ = _jeu_seul(drh)
    r = drh.post(B + f"jeux/{j['id']}/faits-prince/", {"id_ens": "M1", "id_etab": etab[0]["Identifiant_Ecole"],
                                                        "motif": "x"}, content_type=J)
    assert r.status_code == 422 and r.json()["code"] == NOMINATIF
    # Avec le jeu à la création : un fichier du Prince ne peut accompagner des établissements seuls.
    buf = io.BytesIO(b"Matricule_Enseignant,Identifiant_Ecole,Motif\nM1,%s,x\n" % etab[0]["Identifiant_Ecole"].encode())
    buf.name = "prince.csv"
    prince = drh.post(B + "fichiers/", {"type": "prince", "fichier": buf}).json()["id"]
    r = _etab_seuls(drh, etab, fichier_prince=prince)
    assert r.status_code == 422 and r.json()["code"] == "prince_sans_nominatif"


# --- 4. Permissions ----------------------------------------------------------------------------------------------

def test_delegue_importe_la_base_nationale_en_etablissements_seuls_et_ne_garde_que_sa_region(centre, littoral):
    etab, _ = _national(60, 200)
    r = _etab_seuls(centre, etab)
    assert r.status_code == 201, r.content
    j = r.json()
    assert j["portee"] == "regional" and j["region"] == "Centre" and j["nominatif_disponible"] is False
    regions = set(Etablissement.objects.filter(jeu_id=j["id"]).values_list("region", flat=True))
    assert regions == {"Centre"}
    attendu = {l["Identifiant_Ecole"] for l in etab if l["Region"] == "Centre"}
    assert set(Etablissement.objects.filter(jeu_id=j["id"]).values_list("id_ecole", flat=True)) == attendu
    # Les contrôles territoriaux restent obligatoires : un autre délégué ne voit pas ce jeu.
    assert littoral.get(B + f"jeux/{j['id']}/").status_code in (403, 404)
    assert all(x["id"] != j["id"] for x in littoral.get(B + "jeux/").json())


def test_delegue_ne_peut_pas_importer_les_ecoles_d_une_autre_region_sans_nominatif(centre):
    """Un fichier régional dont une ligne porte une autre région est refusé en entier, comme en mode complet."""
    etab, _ = construire_jeu_demonstration(5, 20, 80)
    for l in etab:
        l["Region"] = "Centre"
    etab[3]["Region"] = "Littoral"
    r = centre.post(B + "fichiers/", {"type": "etablissements", "fichier": _xlsx(etab)})
    assert r.status_code in (201, 422)
    if r.status_code == 201:                      # reconnu comme base nationale : seule la région du délégué est retenue
        j = centre.post(B + "jeux/", {"fichier_etablissements": r.json()["id"]}, content_type=J).json()
        assert set(Etablissement.objects.filter(jeu_id=j["id"]).values_list("region", flat=True)) == {"Centre"}


def _xlsx(lignes):
    buf = io.BytesIO()
    pd.DataFrame(lignes).to_excel(buf, index=False)
    buf.name = "etablissements.xlsx"
    buf.seek(0)
    return buf


def test_faits_du_prince_toujours_reserves_au_drh_pour_un_jeu_sans_nominatif(centre):
    etab, _ = _national(30, 100)
    j = _etab_seuls(centre, etab).json()
    for methode, url in (("get", "faits-prince/"), ("post", "faits-prince/"), ("post", "faits-prince/impact/")):
        r = getattr(centre, methode)(B + f"jeux/{j['id']}/{url}", **({"data": {}, "content_type": J}
                                                                    if methode == "post" else {}))
        assert r.status_code == 403 and r.json()["code"] == "reserve_drh", (url, r.status_code)


def test_le_drh_importe_la_base_nationale_seule_et_les_dix_regions_restent(drh):
    etab, _ = _national(100, 300)
    j = _etab_seuls(drh, etab).json()
    assert j["portee"] == "national" and j["nb_etablissements"] == 100
    assert len(set(Etablissement.objects.filter(jeu_id=j["id"]).values_list("region", flat=True))) == 10


def test_delegue_actualise_vers_un_jeu_complet_dans_sa_region(centre):
    etab, ens = _national(60, 300)
    j = _etab_seuls(centre, etab).json()
    r = _actualiser(centre, j["id"], etab, ens)
    assert r.status_code == 201, r.content
    jeu = JeuDeDonnees.objects.get(pk=j["id"])
    assert jeu.nominatif_disponible is True
    ecoles = set(Etablissement.objects.filter(jeu=jeu).values_list("id_ecole", flat=True))
    assert set(Enseignant.objects.filter(jeu=jeu).values_list("ecole_attache", flat=True)) <= ecoles
    assert set(Etablissement.objects.filter(jeu=jeu).values_list("region", flat=True)) == {"Centre"}


def test_validation_d_un_jeu_sans_nominatif_signale_l_absence(drh):
    j, _, _ = _jeu_seul(drh)
    v = drh.get(B + f"jeux/{j['id']}/validation/").json()
    par = {c["code"]: c for c in v["controles"]}
    assert par["nominatif"]["ok"] is False and par["nominatif"]["bloquant"] is False
    assert par["rattachement"]["detail"].startswith("Sans objet")
    assert par["date_naissance"]["ok"] is False and "indisponible" in par["date_naissance"]["detail"]
    # Non bloquant : le jeu reste validable comme référence des besoins, avec ce contrôle en évidence.
    r = drh.post(B + f"jeux/{j['id']}/validation/", {"auteur": "DRH"}, content_type=J)
    assert r.status_code == 200, r.content


# --- Retraites inconnues : jamais 0 dans aucune vue publiée ---------------------------------------------------------

def test_tableau_de_planification_sans_nominatif_ne_publie_aucune_retraite_a_zero(drh):
    jeu, _, _ = _jeu_seul(drh)
    t = drh.get(B + f"jeux/{jeu['id']}/planification/").json()
    assert t["retraites_fiabilite"]["statut"] == "non_calculable"
    for ligne in t["annees"]:
        for cle in ("departs_retraite", "retraites_identifiees", "retraites_non_imputables", "plancher_retraites",
                    "depassement_plafond"):
            assert ligne[cle] is None, (ligne["annee"], cle)
        # Ce qui ne dépend pas des retraites individuelles reste calculé.
        assert ligne["besoin"] is not None and ligne["departs_attrition"] is not None


def test_lignes_ecoles_et_rapport_territorial_sans_nominatif_ne_publient_pas_de_zero_de_retraites(drh):
    jeu, _, _ = _jeu_seul(drh)
    ecoles = drh.get(B + f"jeux/{jeu['id']}/planification/ecoles/").json()
    lignes = ecoles["resultats"]
    assert lignes and all(a["departs_retraite"] is None for e in lignes for a in e["annees"])
    rt = drh.get(B + f"jeux/{jeu['id']}/rapports/territorial/").json()
    for bloc in [rt["noeud"], *rt["enfants"]]:
        assert all(a["departs_retraite"] is None for a in bloc["attrition"]["annees"].values())


def test_indicateurs_de_suivi_sans_nominatif_ne_parlent_pas_de_personnes_disponibles(drh):
    jeu, _, _ = _jeu_seul(drh)
    ind = drh.get(B + f"jeux/{jeu['id']}/indicateurs/").json()["indicateurs"]
    par_code = {i["code"]: i for i in ind}
    vivier = par_code["mobilisation_vivier"]
    assert "personne(s) disponible(s)" not in vivier["detail"] and "stock déclaré" in vivier["detail"]
    # Aucun mouvement ni nomination ne peut exister sans matricules : non calculables, jamais « 0 % » ni « 0 prévu ».
    for code in ("couverture_besoin", "mobilisation_vivier", "realisation_nominations", "ecart_prevu_realise"):
        assert par_code[code]["valeur"] is None and "Non calculable" in par_code[code]["detail"]
    assert par_code["besoin_residuel"]["valeur"] is not None and "conditionnelle" in par_code["besoin_residuel"]["detail"]
    fiab = drh.get(B + f"jeux/{jeu['id']}/planification/").json()["fiabilite"]
    detail = next(f for f in fiab if f["indicateur"] == "ressources_vivier")
    assert detail["niveau"] == "faible" and "aucune liste nominative" in detail["detail"]


def test_comparaison_de_versions_ne_transforme_pas_une_retraite_inconnue_en_zero(drh):
    jeu, _, _ = _jeu_seul(drh)
    drh.get(B + f"jeux/{jeu['id']}/planification/")
    drh.post(B + f"jeux/{jeu['id']}/planification/recalculer/", {}, content_type=J)
    r = drh.get(B + f"jeux/{jeu['id']}/planification/versions/comparer/?de=1&a=2")
    assert r.status_code == 200, r.content[:300]
    assert not any(e["indicateur"] == "departs_retraite" and 0 in (e["de"], e["a"]) for e in r.json()["ecarts"])


def test_rapport_territorial_sans_nominatif_ne_publie_pas_de_couverture_a_zero(drh, tmp_path):
    jeu, _, _ = _jeu_seul(drh)
    rt = drh.get(B + f"jeux/{jeu['id']}/rapports/territorial/").json()
    for bloc in [rt["noeud"], *rt["enfants"]]:
        for code in ("couverture_globale", "couverture_operationnelle"):
            for situation, v in bloc[code].items():
                if situation == "ecart_n5_import":
                    assert v is None
                else:
                    assert v["statut"] == "non_disponible" and v["taux"] is None, (code, situation)
        # Ce qui ne dépend pas du fichier nominatif reste calculé.
        assert bloc["encadrement"]["import"]["taux"] is not None
    x = drh.get(B + f"jeux/{jeu['id']}/rapports/territorial/export/?format=xlsx")
    assert x.status_code == 200
    import openpyxl
    f = tmp_path / "rt.xlsx"
    f.write_bytes(x.content)
    feuille = openpyxl.load_workbook(f)["Couverture globale des besoins"]
    valeurs = [c for ligne in list(feuille.iter_rows(min_row=2, values_only=True)) for c in ligne[1:]]
    assert valeurs and set(valeurs) == {"Non disponible"}


def test_les_gabarits_d_import_n_ont_aucune_colonne_nouvelle():
    """Garde-fou D7 : rendre le fichier des enseignants facultatif n'ajoute ni ne retire aucune colonne des fichiers
    attendus (listes figées le 2026-10-26, identiques à celles de `main`)."""
    from domaine.donnees import colonnes as C
    assert C.COLONNES_ATTENDUES_ETAB == [
        "Identifiant_Ecole", "Sous_Systeme", "Region", "Departement", "Commune", "Circonscription_IAEB",
        "Effectif_Eleves_Attendus", "Enseignants_Actuels", "Salles_Simple_Flux", "Salles_Double_Flux",
        "Accessibilite_Zone", "Securite_Zone", "Classes_Multigrades"]
    assert C.COLONNES_OPTIONNELLES_ETAB == ["nom_etab", "type_etab", "latitude", "longitude", "Classes_Ouvertes"]
    assert C.COLONNES_BLOQUANTES_ETAB == ["Identifiant_Ecole"]
    assert C.COLONNES_ATTENDUES_ENS == [
        "Matricule_Enseignant", "Sous_Systeme_Formation", "Ecole_Attache_Actuelle", "Age", "Anciennete_Carriere",
        "Anciennete_Poste_Actuel", "Annees_Zone_Difficulte_1", "Annees_Zone_Difficulte_2", "Situation_Matrimoniale",
        "Nombre_Enfants_A_Charge", "Formations_Continues", "Voeu_1", "Voeu_2", "Voeu_3", "Motif_Bonification"]
    assert C.COLONNES_BLOQUANTES_ENS == ["Matricule_Enseignant"]
    assert not any("Groupes_Pedagogiques" in c for c in C.COLONNES_ATTENDUES_ETAB + C.COLONNES_OPTIONNELLES_ETAB)


def test_enseignants_redeployables_sans_nominatif_ne_valent_pas_zero(drh):
    """Sans agents identifiés, « 0 redéployable » serait faux : le total retombe sur l'excédent déclaré des écoles."""
    jeu, _, _ = _jeu_seul(drh)
    totaux = drh.get(B + f"jeux/{jeu['id']}/diagnostic/").json()["totaux"]
    assert totaux["excedent_mobilisable"] == totaux["excedent_enseignants"]
    ecoles = drh.get(B + f"jeux/{jeu['id']}/diagnostic/").json()["ecoles"]
    lignes = ecoles["resultats"]
    assert lignes and all(e["mobilisables"] is None for e in lignes)
