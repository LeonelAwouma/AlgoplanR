"""Sécurité des accès : activation signée, mot de passe initial, région, cloisonnement, sessions, révocation.

Chaque test passe par l'API HTTP réelle (authentification, permissions, vues) : aucune garde de l'interface
React n'intervient ici.
"""
import io
import re
import uuid
from datetime import timedelta

import pytest
from django.test import Client
from django.urls import URLPattern, URLResolver, get_resolver

from contextes.acces import horloge
from contextes.acces.activation import signer
from contextes.acces.models import Compte
from tests.outils_acces import (B, NOUVEAU, TEMPORAIRE, activer, charge, client_jeton, comptes_test, connecter,
                                creer_compte, generer_cles, identifiant, session_complete, televerser)

pytestmark = pytest.mark.django_db

CENTRE = identifiant("Centre")


def _csv(texte: str, nom: str) -> io.BytesIO:
    f = io.BytesIO(texte.encode("utf-8"))
    f.name = nom
    return f


def _jeu_demo(client: Client) -> str:
    r = client.post(B + "jeux/demonstration/", {"nb_ecoles": 12, "nb_enseignants": 60},
                    content_type="application/json")
    assert r.status_code == 201, r.content
    return r.json()["id"]


def _avancer(monkeypatch, minutes: float):
    base = horloge.maintenant()
    monkeypatch.setattr(horloge, "maintenant", lambda: base + timedelta(minutes=minutes))


# --- 1. Installation vierge et activation signée ----------------------------------------------------------------


def test_installation_vierge_sans_aucun_compte(db, cle_privee):
    etat = Client().get(B + "acces/etat/").json()
    assert {k: etat[k] for k in ("poste_active", "registre", "profil")} == {
        "poste_active": False, "registre": "vierge", "profil": None}
    assert uuid.UUID(etat["poste"])            # identifiant administratif du poste, stable
    assert Client().get(B + "acces/etat/").json()["poste"] == etat["poste"]
    assert connecter("drh").status_code == 401
    assert Client().get(B + "jeux/").status_code == 401


def test_activation_refuse_autre_cle_et_fichier_altere(db, cle_privee):
    autre_privee, _ = generer_cles()
    r = activer(Client(), autre_privee)
    assert r.status_code == 422 and r.json()["code"] == "signature_invalide"
    # Charge modifiée après signature (rôle DRH ajouté à la main) : la signature ne correspond plus.
    import base64
    import json
    fichier = json.loads(signer(charge("initiale", [creer_compte("x", "DELEGUE", "Centre"),
                                                    creer_compte("drh", "DRH")]), cle_privee))
    contenu = json.loads(base64.b64decode(fichier["charge"]))
    contenu["operations"][0]["role"] = "DRH"
    contenu["operations"][0]["region"] = None
    fichier["charge"] = base64.b64encode(json.dumps(contenu).encode()).decode()
    r = televerser(Client(), json.dumps(fichier).encode())
    assert r.status_code == 422 and r.json()["code"] == "signature_invalide"
    assert Compte.objects.count() == 0
    # Fichier non signé.
    assert televerser(Client(), b'{"charge": "e30=", "signature": ""}').status_code == 422
    assert Compte.objects.count() == 0


def test_activation_rejeu_sans_expiration_et_mot_de_passe_en_clair(db, cle_privee):
    ident = uuid.uuid4()
    assert activer(Client(), cle_privee, ident=ident).status_code == 201
    r = activer(Client(), cle_privee, ident=ident)
    assert r.status_code == 422 and r.json()["code"] == "activation_rejouee"
    # Une seconde activation initiale ne peut pas remplacer le registre existant.
    r = activer(Client(), cle_privee)
    assert r.status_code == 422 and r.json()["code"] == "deja_active"
    # Aucun fichier n'expire : une ancienne date « expire_le » dépassée est ignorée.
    r = activer(Client(), cle_privee, "ajout", [creer_compte("tardif", "DRH")], expire_dans=timedelta(days=-400))
    assert r.status_code == 201, r.content
    op = creer_compte("clair", "DELEGUE", "Sud")
    op["mot_de_passe_hache"] = "123456"
    assert activer(Client(), cle_privee, "ajout", [op]).status_code == 422
    assert not Compte.objects.filter(identifiant="clair").exists()


def test_activation_initiale_exige_un_drh(db, cle_privee):
    r = activer(Client(), cle_privee, operations=[creer_compte("seul", "DELEGUE", "Est")])
    assert r.status_code == 422
    assert Compte.objects.count() == 0


# --- 2. Impossible de s'attribuer le rôle DRH ---------------------------------------------------------------------


def test_aucune_route_ne_donne_le_role_drh(centre):
    for url in ("acces/comptes/", f"acces/comptes/{CENTRE}/historique/"):
        r = centre.get(B + url)
        assert r.status_code == 403 and r.json()["code"] == "reserve_drh"
    r = centre.post(B + f"acces/comptes/{CENTRE}/reactiver/")
    assert r.status_code == 403
    # Le corps d'une requête ne peut pas changer le rôle ni la région d'un compte.
    for corps in ({"role": "DRH"}, {"region": "Littoral", "role": "DRH"}):
        centre.post(B + "acces/session/activite/", corps, content_type="application/json")
    c = Compte.objects.get(identifiant=CENTRE)
    assert c.role == "DELEGUE" and c.region == "Centre"
    # Le jeu créé par un délégué reste régional, quoi qu'envoie le client.
    r = centre.post(B + "jeux/demonstration/", {"nb_ecoles": 8, "nb_enseignants": 30, "portee": "national"},
                    content_type="application/json")
    assert r.json()["portee"] == "regional" and r.json()["region"] == "Centre"


def test_activation_rejetee_sur_poste_actif_meme_signee_ailleurs(poste_active):
    autre, _ = generer_cles()
    r = activer(Client(), autre, "ajout", [creer_compte("pirate", "DRH")])
    assert r.status_code == 422 and not Compte.objects.filter(identifiant="pirate").exists()


# --- 3. Mot de passe initial ---------------------------------------------------------------------------------------


def test_mot_de_passe_initial_a_usage_unique(poste_active):
    r = connecter(CENTRE)
    assert r.status_code == 201
    corps = r.json()
    assert corps["session"]["portee"] == "CHANGEMENT_MDP" and corps["compte"]["doit_changer_mot_de_passe"]
    limite = client_jeton(corps["jeton"])
    for url in ("jeux/", "parametres/defaut/", "acces/comptes/"):
        r = limite.get(B + url)
        assert r.status_code == 403, url
    assert limite.get(B + "jeux/").json()["code"] == "mot_de_passe_a_changer"
    for nouveau in ("123456", "court1", "sanschiffre", "1234567890123"):
        r = limite.post(B + "acces/mot-de-passe/", {"actuel": TEMPORAIRE, "nouveau": nouveau, "confirmation": nouveau},
                        content_type="application/json")
        assert r.status_code == 422, nouveau
    r = limite.post(B + "acces/mot-de-passe/", {"actuel": TEMPORAIRE, "nouveau": NOUVEAU, "confirmation": "autre"},
                    content_type="application/json")
    assert r.status_code == 422
    r = limite.post(B + "acces/mot-de-passe/", {"actuel": TEMPORAIRE, "nouveau": NOUVEAU, "confirmation": NOUVEAU},
                    content_type="application/json")
    assert r.status_code == 200 and r.json()["session"]["portee"] == "CONFIRMATION_REGION"
    # L'ancien jeton est fermé ; le mot de passe temporaire ne sert plus jamais.
    assert limite.get(B + "acces/session/").status_code == 401
    assert connecter(CENTRE, TEMPORAIRE).status_code == 401
    assert connecter(CENTRE, NOUVEAU).status_code == 201


def test_mot_de_passe_temporaire_sans_expiration(poste_active, monkeypatch):
    _avancer(monkeypatch, 400 * 24 * 60)
    r = connecter("drh")
    assert r.status_code == 201 and r.json()["session"]["portee"] == "CHANGEMENT_MDP"


# --- 4. Région du délégué ------------------------------------------------------------------------------------------


def test_confirmation_de_region_obligatoire_et_verrouillee(poste_active):
    r = connecter(CENTRE)
    j = client_jeton(r.json()["jeton"]).post(
        B + "acces/mot-de-passe/", {"actuel": TEMPORAIRE, "nouveau": NOUVEAU, "confirmation": NOUVEAU},
        content_type="application/json").json()["jeton"]
    c = client_jeton(j)
    assert c.get(B + "jeux/").json()["code"] == "region_a_confirmer"
    r = c.post(B + "acces/region/confirmer/", {"region": "Littoral"}, content_type="application/json")
    assert r.status_code == 403 and r.json()["code"] == "region_non_autorisee"
    r = c.post(B + "acces/region/confirmer/", {"region": "centre"}, content_type="application/json")
    assert r.status_code == 200
    complet = client_jeton(r.json()["jeton"])
    assert complet.get(B + "jeux/").status_code == 200
    assert Compte.objects.get(identifiant=CENTRE).region_confirmee_le is not None
    # Déjà confirmée : aucune session complète ne peut la rouvrir.
    assert complet.post(B + "acces/region/confirmer/", {"region": "Littoral"},
                        content_type="application/json").status_code == 403


def test_reaffectation_par_fichier_signe_seulement(centre, poste_active):
    r = activer(Client(), poste_active, "reaffectation",
                [{"action": "reaffecter", "identifiant": CENTRE, "region": "Littoral"}])
    assert r.status_code == 201
    assert centre.get(B + "jeux/").status_code == 401          # sessions fermées par la réaffectation
    c = Compte.objects.get(identifiant=CENTRE)
    assert c.region == "Littoral" and c.region_confirmee_le is None
    r = connecter(CENTRE, NOUVEAU)
    assert r.json()["session"]["portee"] == "CONFIRMATION_REGION"


# --- 5. Imports régionaux --------------------------------------------------------------------------------------------

ETAB = ("Identifiant_Ecole,Region,Departement,Commune,Effectif_Eleves_Attendus,Enseignants_Actuels\n"
        "E1,Centre,Mfoundi,Yaounde 1,120,3\nE2,CENTRE,Lekie,Obala,80,2\nE3,Littoral,Wouri,Douala 1,90,2\n")


def test_fichier_multi_regions_reconnu_comme_base_nationale(centre):
    # Aucune déclaration : un fichier qui porte d'autres régions est reconnu national, la région sera extraite.
    r = centre.post(B + "fichiers/", {"type": "etablissements", "fichier": _csv(ETAB, "e.csv")})
    assert r.status_code == 201 and r.json()["base_nationale"] is True, r.content
    # Fichier d'une seule région : régional, contrôlé ligne à ligne.
    r = centre.post(B + "fichiers/", {"type": "etablissements",
                                      "fichier": _csv(ETAB.rsplit("E3", 1)[0], "r.csv")})
    assert r.status_code == 201 and r.json()["base_nationale"] is False


def test_import_regional_refuse_region_vide_ou_inconnue(centre):
    from contextes.donnees.models import FichierImporte

    # Région vide ou illisible dans un fichier régional : refusé (impossible de rattacher la ligne).
    r = centre.post(B + "fichiers/", {"type": "etablissements",
                                      "fichier": _csv("Identifiant_Ecole,Region\nE1,Centre\nE2,\n", "v.csv")})
    assert r.status_code == 422 and r.json()["code"] == "region_non_autorisee"
    assert r.json()["details"]["lignes"][0]["motif"] == "région manquante"
    r = centre.post(B + "fichiers/", {"type": "etablissements",
                                      "fichier": _csv("Identifiant_Ecole,Region\nE1,Centre\nE2,Atlantis\n", "i.csv")})
    assert r.status_code == 422 and r.json()["details"]["lignes"][0]["motif"] == "région inconnue"
    assert FichierImporte.objects.count() == 0


def test_import_regional_conforme_et_enseignants_hors_region(centre):
    etab = ETAB.rsplit("E3", 1)[0]
    e = centre.post(B + "fichiers/", {"type": "etablissements", "fichier": _csv(etab, "e.csv")}).json()
    ens = "Matricule_Enseignant,Ecole_Attache_Actuelle,Age\nM1,E1,30\nM2,E2,40\nM3,X99,35\n"
    n = centre.post(B + "fichiers/", {"type": "enseignants", "fichier": _csv(ens, "n.csv")}).json()
    r = centre.post(B + "jeux/", {"fichier_etablissements": e["id"], "fichier_enseignants": n["id"]},
                    content_type="application/json")
    assert r.status_code == 422 and r.json()["details"]["lignes"][0] == {
        "ligne": 4, "colonne": "Ecole_Attache_Actuelle", "valeur": "X99",
        "motif": "école d'attache absente du fichier régional"}
    n = centre.post(B + "fichiers/", {"type": "enseignants",
                                      "fichier": _csv(ens.replace("M3,X99,35\n", ""), "n.csv")}).json()
    r = centre.post(B + "jeux/", {"fichier_etablissements": e["id"], "fichier_enseignants": n["id"]},
                    content_type="application/json")
    assert r.status_code == 201, r.content
    jeu = r.json()
    assert jeu["portee"] == "regional" and jeu["region"] == "Centre"
    # « CENTRE » est enregistré sous sa graphie officielle : le périmètre imposé retrouve toutes les écoles.
    assert centre.get(B + f"jeux/{jeu['id']}/etablissements/").json()["count"] == 2


def test_imports_secondaires_controles(centre):
    jeu = _jeu_demo(centre)
    recrues = "id_recrue,nom,region_souhaitee\nR1,Ali,Centre\nR2,Ba,Nord\n"
    r = centre.post(B + f"jeux/{jeu}/recrues/import/", {"fichier": _csv(recrues, "r.csv")})
    assert r.status_code == 422 and r.json()["details"]["lignes"][0]["ligne"] == 3
    assert centre.get(B + f"jeux/{jeu}/recrues/").json() == []
    prince = "id_ens,id_etab,Region\nM1,ECO001,Littoral\n"
    r = centre.post(B + f"jeux/{jeu}/faits-prince/import/", {"fichier": _csv(prince, "p.csv")})
    assert r.status_code == 422 and r.json()["code"] == "region_non_autorisee"


ENS_NATIONAL = "Matricule_Enseignant,Ecole_Attache_Actuelle,Age\nM1,E1,30\nM2,E2,40\nM3,E3,35\nM4,X99,50\n"


def _envoyer_base_nationale(client: Client, base_nationale: bool = True) -> tuple:
    drapeau = {"base_nationale": "true"} if base_nationale else {}
    e = client.post(B + "fichiers/", {"type": "etablissements", "fichier": _csv(ETAB, "e.csv"), **drapeau})
    n = client.post(B + "fichiers/", {"type": "enseignants", "fichier": _csv(ENS_NATIONAL, "n.csv"), **drapeau})
    return e, n


def test_drh_importe_la_base_nationale(drh, centre):
    e, n = _envoyer_base_nationale(drh, base_nationale=False)
    assert e.status_code == 201 and n.status_code == 201, (e.content, n.content)
    r = drh.post(B + "jeux/", {"fichier_etablissements": e.json()["id"], "fichier_enseignants": n.json()["id"]},
                 content_type="application/json")
    assert r.status_code == 201, r.content
    jeu = r.json()
    assert jeu["portee"] == "national" and jeu["region"] is None
    assert (jeu["nb_etablissements"], jeu["nb_enseignants"]) == (3, 4)
    regions = {l["Region"] for l in drh.get(B + f"jeux/{jeu['id']}/etablissements/").json()["resultats"]}
    assert regions == {"Centre", "Littoral"}   # « CENTRE » ramené à sa graphie officielle
    assert drh.patch(B + f"jeux/{jeu['id']}/parametres/", {"seuils": {"age_senior_ans": 52}},
                     content_type="application/json").status_code == 200
    # Un délégué ne voit pas le jeu national et ne peut pas utiliser les fichiers du DRH.
    assert centre.get(B + f"jeux/{jeu['id']}/").status_code == 404
    r = centre.post(B + "jeux/", {"fichier_etablissements": e.json()["id"], "fichier_enseignants": n.json()["id"]},
                    content_type="application/json")
    assert r.status_code == 404


def test_delegue_extrait_sa_region_de_la_base_nationale(centre, littoral):
    # Avec ou sans drapeau, le fichier national est reconnu et sa région extraite.
    for client, region, ecoles, enseignants, drapeau in ((centre, "Centre", 2, 2, False),
                                                         (littoral, "Littoral", 1, 1, True)):
        e, n = _envoyer_base_nationale(client, base_nationale=drapeau)
        assert e.status_code == 201 and e.json()["base_nationale"] is True, e.content
        r = client.post(B + "jeux/", {"fichier_etablissements": e.json()["id"],
                                      "fichier_enseignants": n.json()["id"]}, content_type="application/json")
        assert r.status_code == 201, r.content
        jeu = r.json()
        assert jeu["portee"] == "regional" and jeu["region"] == region
        assert (jeu["nb_etablissements"], jeu["nb_enseignants"]) == (ecoles, enseignants)
        lignes = client.get(B + f"jeux/{jeu['id']}/etablissements/").json()["resultats"]
        assert {l["Region"] for l in lignes} == {region}


def test_base_nationale_sans_ecole_de_la_region(poste_active):
    from tests.outils_acces import identifiant, session_complete

    nord = session_complete(identifiant("Nord"), "Nord")
    e, n = _envoyer_base_nationale(nord)
    r = nord.post(B + "jeux/", {"fichier_etablissements": e.json()["id"], "fichier_enseignants": n.json()["id"]},
                  content_type="application/json")
    assert r.status_code == 422 and r.json()["code"] == "region_absente"


# --- 6. Contournement de l'API impossible ------------------------------------------------------------------------

PUBLIQUES = {"sante/", "acces/etat/", "acces/activation/", "acces/connexion/", "acces/code/"}


def _routes():
    """Toutes les routes de l'API, paramètres remplacés par des valeurs plausibles."""
    def parcourir(motifs, prefixe=""):
        for m in motifs:
            if isinstance(m, URLResolver):
                yield from parcourir(m.url_patterns, prefixe + str(m.pattern))
            elif isinstance(m, URLPattern):
                yield prefixe + str(m.pattern)

    for brut in parcourir(get_resolver().url_patterns):
        chemin = re.sub(r"<uuid:\w+>", str(uuid.uuid4()), brut)
        chemin = re.sub(r"<int:\w+>", "1", chemin)
        yield brut, re.sub(r"<(str:)?\w+>", "x", chemin)


def test_toute_route_non_publique_exige_une_session(poste_active):
    routes = list(_routes())
    assert len(routes) > 60
    anonyme, faux = Client(), client_jeton("jeton-invente")
    for brut, chemin in routes:
        relatif = chemin.removeprefix("api/v1/")
        if relatif in PUBLIQUES:
            continue
        for methode in ("get", "post", "delete"):
            for client in (anonyme, faux):
                r = getattr(client, methode)("/" + chemin)
                assert r.status_code == 401, (methode, brut, r.status_code)


def test_un_delegue_ne_voit_pas_les_donnees_d_une_autre_region(centre, littoral):
    jeu = _jeu_demo(littoral)
    sid = littoral.get(B + f"jeux/{jeu}/scenarios/").json()[0]["id"]
    assert centre.get(B + "jeux/").json() == []
    for url in (f"jeux/{jeu}/", f"jeux/{jeu}/etablissements/", f"jeux/{jeu}/enseignants/",
                f"jeux/{jeu}/recherche/enseignants/?q=a", f"jeux/{jeu}/diagnostic/", f"jeux/{jeu}/synthese/",
                f"jeux/{jeu}/scenarios/{sid}/affectations/", f"jeux/{jeu}/scenarios/{sid}/export/",
                f"jeux/{jeu}/rapport/", f"jeux/{jeu}/parametres/"):
        assert centre.get(B + url).status_code == 404, url
    assert centre.delete(B + f"jeux/{jeu}/").status_code == 404
    assert centre.post(B + f"jeux/{jeu}/scenarios/base/").status_code == 404
    assert littoral.get(B + f"jeux/{jeu}/").status_code == 200


def test_filtre_region_du_client_ignore_pour_un_delegue(centre):
    jeu = _jeu_demo(centre)
    total = centre.get(B + f"jeux/{jeu}/etablissements/").json()["count"]
    autre = centre.get(B + f"jeux/{jeu}/etablissements/", {"region": "Littoral"}).json()
    assert autre["count"] == total == 12
    assert {e["Region"] for e in autre["resultats"]} == {"Centre"}
    assert centre.get(B + f"jeux/{jeu}/diagnostic/", {"region": "Nord"}).json()["perimetre"]["region"] == "Centre"


def test_fichiers_d_un_autre_delegue_inutilisables(centre, littoral):
    f = littoral.post(B + "fichiers/", {"type": "etablissements",
                                        "fichier": _csv("Identifiant_Ecole,Region\nL1,Littoral\n", "l.csv")}).json()
    r = centre.patch(B + f"fichiers/{f['id']}/correspondances/", {"Region": "Region"},
                     content_type="application/json")
    assert r.status_code == 404
    r = centre.post(B + "jeux/", {"fichier_etablissements": f["id"], "fichier_enseignants": f["id"]},
                    content_type="application/json")
    assert r.status_code == 404


# --- 7. Droits du DRH --------------------------------------------------------------------------------------------


def test_drh_lit_les_regions_sans_les_modifier(drh, centre, littoral):
    j_centre, j_littoral = _jeu_demo(centre), _jeu_demo(littoral)
    assert {j["id"] for j in drh.get(B + "jeux/").json()} >= {j_centre, j_littoral}
    assert drh.get(B + f"jeux/{j_centre}/etablissements/").status_code == 200
    r = drh.patch(B + f"jeux/{j_centre}/parametres/", {"seuils": {"age_senior_ans": 52}},
                  content_type="application/json")
    assert r.status_code == 403 and r.json()["code"] == "ecriture_interdite"
    assert drh.delete(B + f"jeux/{j_centre}/").status_code == 403
    # Postes autonomes : la consolidation des jeux régionaux n'existe plus.
    assert drh.post(B + "jeux/consolidation/", {}, content_type="application/json").status_code == 404


# --- 8. Sessions -----------------------------------------------------------------------------------------------------


def test_deconnexion_ferme_la_session(centre):
    assert centre.post(B + "acces/deconnexion/").status_code == 204
    r = centre.get(B + "jeux/")
    assert r.status_code == 401 and r.json()["code"] == "session_invalide"


def test_expiration_apres_20_minutes_d_inactivite(centre, monkeypatch):
    _avancer(monkeypatch, 15)
    assert centre.get(B + "jeux/").status_code == 200        # une lecture ne prolonge pas la session…
    _avancer(monkeypatch, 6)
    r = centre.get(B + "jeux/")
    assert r.status_code == 401 and r.json()["code"] == "session_expiree"
    assert centre.get(B + "jeux/").status_code == 401


def test_activite_prolonge_la_session(centre, monkeypatch):
    _avancer(monkeypatch, 15)
    r = centre.post(B + "acces/session/activite/")
    assert r.status_code == 200
    _avancer(monkeypatch, 19)                                  # 15 + 19 min, mais 19 min seulement d'inactivité
    assert centre.get(B + "jeux/").status_code == 200
    s = centre.get(B + "acces/session/").json()["session"]
    assert s["inactivite_minutes"] == 20 and s["avertissement_minutes"] == 2


def test_blocage_apres_cinq_echecs(poste_active):
    for _ in range(5):
        assert connecter("drh", "mauvais").status_code == 401
    r = connecter("drh", TEMPORAIRE)
    assert r.status_code == 401 and r.json()["code"] == "compte_bloque"
    # Message identique pour un identifiant inconnu : aucune énumération des comptes.
    assert connecter("inconnu", "x").json()["detail"] == connecter("drh2", "y").json()["detail"]


# --- 9. Changement et révocation des accès ------------------------------------------------------------------------


def test_suspension_par_le_drh_coupe_l_acces_immediatement(drh, centre):
    r = drh.post(B + f"acces/comptes/{CENTRE}/suspendre/")
    assert r.status_code == 200 and r.json()["etat"] == "SUSPENDU"
    assert centre.get(B + "jeux/").status_code == 401
    r = connecter(CENTRE, NOUVEAU)
    assert r.status_code == 403 and r.json()["code"] == "compte_suspendu"
    assert drh.post(B + f"acces/comptes/{CENTRE}/reactiver/").status_code == 200
    assert connecter(CENTRE, NOUVEAU).status_code == 201
    # Le DRH n'administre ni lui-même ni un autre DRH.
    assert drh.post(B + "acces/comptes/drh/suspendre/").status_code == 403


def test_revocation_signee_irreversible_par_le_drh(drh, centre, poste_active):
    r = activer(Client(), poste_active, "revocation", [{"action": "revoquer", "identifiant": CENTRE}])
    assert r.status_code == 201
    assert centre.get(B + "jeux/").status_code == 401
    assert connecter(CENTRE, NOUVEAU).json()["code"] == "compte_revoque"
    r = drh.post(B + f"acces/comptes/{CENTRE}/reactiver/")
    assert r.status_code == 422 and r.json()["code"] == "compte_revoque"


def test_reinitialisation_par_le_drh(drh, centre):
    r = drh.post(B + f"acces/comptes/{CENTRE}/reinitialiser-mot-de-passe/")
    temporaire = r.json()["mot_de_passe_temporaire"]
    assert centre.get(B + "jeux/").status_code == 401
    assert connecter(CENTRE, NOUVEAU).status_code == 401
    r = connecter(CENTRE, temporaire)
    assert r.status_code == 201 and r.json()["session"]["portee"] == "CHANGEMENT_MDP"
    h = drh.get(B + f"acces/comptes/{CENTRE}/historique/").json()["evenements"]
    assert {"REINITIALISATION", "CONNEXION", "CHANGEMENT_MDP"} <= {e["type"] for e in h}


# --- 10. Migration des installations existantes -------------------------------------------------------------------


def test_rattachement_prudent_des_jeux_existants():
    from contextes.acces.rattachement import classer

    assert classer(["Centre", "CENTRE", "centre "]) == ("regional", "Centre")
    assert classer(["Extreme-Nord", "Extrême-Nord", "Far North"]) == ("regional", "Extrême-Nord")
    assert classer(["Centre", "Littoral"]) == ("national_herite", None)
    assert classer(["Centre", "Inconnue"]) == ("national_herite", None)
    assert classer(["Centre", ""]) == ("national_herite", None)
    assert classer([]) == ("national_herite", None)


def test_comptes_test_complets(poste_active):
    assert Compte.objects.filter(role="DRH").count() == 1
    assert sorted(Compte.objects.filter(role="DELEGUE").values_list("region", flat=True)) == sorted(
        r["region"] for r in comptes_test() if r["region"])
    assert all(not c.mot_de_passe.startswith(TEMPORAIRE) and c.mdp_temporaire for c in Compte.objects.all())
