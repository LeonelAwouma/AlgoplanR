"""Postes autonomes : codes d'accès des délégués, carnet chiffré du DRH, fichiers signés sans expiration.

Chaque test simule un poste (une base) : un poste de délégué ne reçoit que le catalogue signé, le poste du DRH son
fichier d'activation et son carnet. Les échanges entre postes se font par fichier, comme sur une clé USB.
"""
import base64
import json
import uuid
from datetime import timedelta

import pytest
from django.contrib.auth.hashers import check_password
from django.test import Client

from contextes.acces import horloge
from contextes.acces.activation import signer
from contextes.acces.models import CodeConsomme, CodeEnAttente, Compte, EvenementAcces, RemiseCode
from tests.outils_acces import (B, NOUVEAU, activer, charge, client_jeton, connecter, creer_compte, generer_cles,
                                session_complete)
from tests.outils_codes import (PHRASE, code_de, contenu_base, finaliser, importer_fichier, preparer_codes, saisir)

pytestmark = pytest.mark.django_db
CENTRE = "delegue.centre"


def _avancer(monkeypatch, minutes: float):
    base = horloge.maintenant()
    monkeypatch.setattr(horloge, "maintenant", lambda: base + timedelta(minutes=minutes))


@pytest.fixture
def codes(db, cle_privee):
    """Poste de délégué vierge, catalogue n° 1 importé (Centre et Littoral)."""
    catalogue, _, liste = preparer_codes(cle_privee)
    r = importer_fichier(catalogue)
    assert r.status_code == 201, r.content
    return liste


def _delegue_actif(codes, region="Centre"):
    c = code_de(codes, region)
    r = saisir(region, c["code"])
    assert r.status_code == 201, r.content
    r = finaliser(r, c["code"])
    assert r.status_code == 200, r.content
    return client_jeton(r.json()["jeton"]), c


def _comptes_donnees():
    from contextes.audit.models import EvenementAudit
    from contextes.donnees.models import Enseignant, Etablissement, JeuDeDonnees
    from contextes.nominations.models import Nomination
    return (JeuDeDonnees.objects.count(), Etablissement.objects.count(), Enseignant.objects.count(),
            Nomination.objects.count(), EvenementAudit.objects.count())


# --- 1. Délégué : activation par code, mot de passe obligatoire -------------------------------------------------------


def test_activation_par_code_puis_mot_de_passe_obligatoire(codes):
    c = code_de(codes, "Centre")
    r = saisir("centre", c["code"].lower())             # casse et graphie de la région indifférentes
    assert r.status_code == 201, r.content
    corps = r.json()
    assert corps["session"]["portee"] == "CHANGEMENT_MDP" and corps["compte"]["identifiant"] == CENTRE
    assert corps["compte"]["region"] == "Centre" and not corps["compte"]["region_a_confirmer"]
    limite = client_jeton(corps["jeton"])
    assert limite.get(B + "jeux/").json()["code"] == "mot_de_passe_a_changer"
    assert not CodeConsomme.objects.exists()            # pas encore consommé
    r = finaliser(r, c["code"])
    assert r.status_code == 200 and r.json()["session"]["portee"] == "COMPLETE"
    assert CodeConsomme.objects.get().entree == c["id"] and not CodeEnAttente.objects.exists()
    # Le code ne sert plus sur ce poste, ni comme mot de passe ni comme code.
    assert connecter(CENTRE, c["code"]).status_code == 401
    r = saisir("Centre", c["code"])
    assert r.status_code == 409 and r.json()["code"] == "deja_active"
    assert connecter(CENTRE, NOUVEAU).status_code == 201
    etat = Client().get(B + "acces/etat/").json()
    assert etat["poste_active"] and etat["profil"] == "region" and etat["region"] == "Centre"


def test_abandon_avant_le_mot_de_passe_laisse_le_code_utilisable(codes):
    c = code_de(codes, "Centre")
    assert saisir("Centre", c["code"]).status_code == 201
    r = saisir("Centre", c["code"])                     # nouvelle saisie : même compte, même code
    assert r.status_code == 201 and Compte.objects.filter(identifiant=CENTRE).count() == 1
    assert finaliser(r, c["code"]).status_code == 200


def test_codes_refuses(codes, cle_privee):
    c = code_de(codes, "Centre")
    for region, code, attendu in (("Littoral", c["code"], "code_invalide"),        # code d'une autre région
                                  ("Centre", "ABC", "code_invalide"),              # forme
                                  ("Centre", "2222Z222", "code_invalide")):        # inconnu
        r = saisir(region, code)
        assert r.status_code == 403 and r.json()["code"] == attendu, (region, code, r.content)
    assert saisir("Atlantide", c["code"]).json()["code"] == "region_inconnue"
    # Un code de récupération ne crée pas de compte ; un code d'activation ne sert pas de récupération.
    assert saisir("Centre", code_de(codes, "Centre", "recuperation")["code"], "recuperation").json()["code"] == \
        "compte_absent"
    # Révocation par un catalogue plus récent ; les autres codes restent valables (aucune expiration).
    revocation, _, _ = preparer_codes(cle_privee, 2, activation=0, recuperation=0, revoques=[c["id"]])
    assert importer_fichier(revocation).status_code == 201
    r = saisir("Centre", c["code"])
    assert r.status_code == 403 and r.json()["code"] == "code_revoque"
    assert saisir("Centre", code_de(codes, "Centre", rang=1)["code"]).status_code == 201
    # Catalogue ancien, ou altéré, ou signé par une autre clé : refusé.
    ancien, _, _ = preparer_codes(cle_privee, 2)
    assert importer_fichier(ancien).json()["code"] == "catalogue_ancien"
    autre, _ = generer_cles()
    pirate, _, _ = preparer_codes(autre, 9)
    assert importer_fichier(pirate).json()["code"] == "signature_invalide"
    env = json.loads(preparer_codes(cle_privee, 10)[0])
    charge_ = json.loads(base64.b64decode(env["charge"]))
    charge_["groupes"][0]["verificateurs"].append({"id": "C10-CEN-A999", "v": base64.b64encode(b"x" * 32).decode()})
    env["charge"] = base64.b64encode(json.dumps(charge_).encode()).decode()
    assert importer_fichier(json.dumps(env).encode()).json()["code"] == "signature_invalide"


def test_blocage_apres_cinq_codes_refuses(codes, monkeypatch):
    for _ in range(5):
        assert saisir("Centre", "2222Z222").status_code == 403
    bon = code_de(codes, "Centre")["code"]
    r = saisir("Centre", bon)
    assert r.status_code == 429 and r.json()["code"] == "codes_bloques"
    _avancer(monkeypatch, 16)
    assert saisir("Centre", bon).status_code == 201
    assert EvenementAcces.objects.filter(type="ECHEC_CODE").count() == 5


def test_un_poste_une_region_et_jamais_le_poste_du_drh(codes, cle_privee):
    _delegue_actif(codes, "Centre")
    r = saisir("Littoral", code_de(codes, "Littoral")["code"])
    assert r.status_code == 403 and r.json()["code"] == "poste_autre_region"


def test_le_poste_du_drh_refuse_les_codes(poste_active):
    catalogue, _, liste = preparer_codes(poste_active)
    assert importer_fichier(catalogue).status_code == 201
    r = saisir("Centre", code_de(liste, "Centre")["code"])
    assert r.status_code == 403 and r.json()["code"] == "poste_drh"


# --- 2. Atomicité : mot de passe personnel et consommation du code ----------------------------------------------------


def test_panne_pendant_la_creation_du_mot_de_passe(codes, monkeypatch):
    c = code_de(codes, "Centre")
    r = saisir("Centre", c["code"])

    def panne(*a, **k):
        raise RuntimeError("panne simulée après la consommation")

    monkeypatch.setattr("contextes.acces.services.fermer_sessions", panne)
    with pytest.raises(RuntimeError):
        finaliser(r, c["code"])
    monkeypatch.undo()
    compte = Compte.objects.get(identifiant=CENTRE)
    assert not CodeConsomme.objects.exists() and CodeEnAttente.objects.filter(compte=compte).exists()
    assert compte.mdp_temporaire and check_password(c["code"], compte.mot_de_passe)
    assert saisir("Centre", c["code"]).status_code == 201       # le code reste utilisable


def test_double_finalisation_refusee(codes):
    c = code_de(codes, "Centre")
    r = saisir("Centre", c["code"])
    # Un autre onglet a déjà consommé ce code entre-temps.
    CodeConsomme.objects.create(entree=c["id"], region="Centre", usage="activation", consomme_le=horloge.maintenant())
    r2 = finaliser(r, c["code"])
    assert r2.status_code == 409 and r2.json()["code"] == "code_deja_utilise"
    compte = Compte.objects.get(identifiant=CENTRE)
    assert compte.mdp_temporaire and check_password(c["code"], compte.mot_de_passe)


# --- 3. Récupération du délégué, sans perte de données --------------------------------------------------------------


def test_recuperation_du_delegue_a_usage_unique_sans_perte(codes):
    client, _ = _delegue_actif(codes, "Centre")
    jeu = client.post(B + "jeux/demonstration/", {"nb_ecoles": 10, "nb_enseignants": 50},
                      content_type="application/json").json()["id"]
    avant = _comptes_donnees()
    rec = code_de(codes, "Centre", "recuperation")
    r = saisir("Centre", rec["code"], "recuperation")
    assert r.status_code == 201 and r.json()["session"]["portee"] == "CHANGEMENT_MDP"
    assert connecter(CENTRE, NOUVEAU).status_code == 401            # ancien mot de passe remplacé
    autre = "Autre-mdp-2026"
    r = finaliser(r, rec["code"], autre)
    assert r.status_code == 200
    complet = client_jeton(r.json()["jeton"])
    assert complet.get(B + f"jeux/{jeu}/").status_code == 200
    assert _comptes_donnees()[:4] == avant[:4]
    r = saisir("Centre", rec["code"], "recuperation")              # usage unique
    assert r.status_code == 403 and r.json()["code"] == "code_deja_utilise"


# --- 4. Aucun code en clair sur un poste de délégué -------------------------------------------------------------------


def test_aucun_code_en_clair_sur_le_poste_du_delegue(codes):
    _delegue_actif(codes, "Centre")
    saisir("Centre", "2222Z222")
    texte = contenu_base()
    assert all(c["code"] not in texte for c in codes)


# --- 5. Cloisonnement régional d'un délégué activé par code --------------------------------------------------------


def test_cloisonnement_regional_sur_toutes_les_routes(codes):
    from contextes.acces.perimetre import PORTEE_REGIONALE
    from contextes.donnees.models import JeuDeDonnees

    client, _ = _delegue_actif(codes, "Centre")
    mien = client.post(B + "jeux/demonstration/", {"nb_ecoles": 10, "nb_enseignants": 50},
                       content_type="application/json").json()
    assert mien["region"] == "Centre"
    etranger = JeuDeDonnees.objects.create(nom="Littoral", portee=PORTEE_REGIONALE, region="Littoral")
    for route in ("", "planification/", "planification/territoires/", "quotas/", "nominations/", "vivier/",
                  "mouvements/", "journal-audit/", "validation/", "actualisations/", "etablissements/"):
        r = client.get(B + f"jeux/{etranger.id}/{route}")
        assert r.status_code == 404, (route, r.status_code)
    assert {j["id"] for j in client.get(B + "jeux/").json()} == {mien["id"]}
    lignes = client.get(B + f"jeux/{mien['id']}/planification/territoires/", {"region": "Littoral"}).json()["lignes"]
    assert lignes and all(l["territoire"]["region"] == "Centre" for l in lignes)


# --- 6. DRH : fichier sans expiration, lié au poste, carnet chiffré, récupération ---------------------------------


def _poste_drh(cle_privee, **kw):
    r = activer(Client(), cle_privee, operations=[creer_compte("drh", "DRH")], **kw)
    assert r.status_code == 201, r.content
    return session_complete("drh")


def _carnet(client, contenu, phrase=PHRASE, mdp=NOUVEAU):
    import io
    f = io.BytesIO(contenu)
    f.name = "carnet.algoplanr-carnet"
    return client.post(B + "acces/carnet/", {"fichier": f, "phrase": phrase, "mot_de_passe": mdp})


def test_fichier_drh_sans_expiration_et_lie_au_poste(db, cle_privee):
    autre_poste = str(uuid.uuid4())
    r = activer(Client(), cle_privee, operations=[creer_compte("drh", "DRH")], expire_dans=timedelta(days=-900),
                poste=autre_poste)
    assert r.status_code == 422 and r.json()["code"] == "poste_non_autorise"
    poste = Client().get(B + "acces/etat/").json()["poste"]
    r = activer(Client(), cle_privee, operations=[creer_compte("drh", "DRH")], expire_dans=timedelta(days=-900),
                poste=poste)
    assert r.status_code == 201, r.content
    assert Client().get(B + "acces/etat/").json()["profil"] == "drh"


def test_carnet_chiffre_remise_de_codes_et_recuperation_du_drh(db, cle_privee, monkeypatch):
    drh = _poste_drh(cle_privee)
    _, carnet, codes = preparer_codes(cle_privee)
    assert _carnet(drh, carnet, phrase="mauvaise phrase").json()["code"] == "phrase_incorrecte"
    assert _carnet(drh, carnet, mdp="faux").json()["code"] == "mot_de_passe_incorrect"
    r = _carnet(drh, carnet)
    assert r.status_code == 201, r.content
    secours = r.json()["cle_secours"]
    assert secours and r.json()["total"] == len(codes)
    synth = drh.get(B + "acces/codes/").json()
    centre = next(x for x in synth["regions"] if x["region"] == "Centre")
    assert centre["activation"]["disponibles"] == 3 and centre["recuperation"]["disponibles"] == 2
    # Le carnet n'est jamais en clair dans la base du poste du DRH.
    assert all(c["code"] not in contenu_base() for c in codes)

    def remettre(mdp=NOUVEAU, usage="activation"):
        return drh.post(B + "acces/codes/remettre/", {"region": "Centre", "usage": usage, "mot_de_passe": mdp,
                                                     "remis_a": "M. Atangana"}, content_type="application/json")

    assert remettre("faux").json()["code"] == "mot_de_passe_incorrect"
    premier = remettre().json()
    assert premier["code"] == code_de(codes, "Centre")["code"]
    assert remettre().json()["code"] == code_de(codes, "Centre", rang=1)["code"]      # jamais deux fois le même
    assert RemiseCode.objects.count() == 2
    assert premier["code"] not in json.dumps(list(EvenementAcces.objects.values("details")), default=str)

    # Changement de mot de passe : le carnet reste lisible avec le nouveau.
    nouveau2 = "Encore-mdp-2026"
    r = drh.post(B + "acces/mot-de-passe/", {"actuel": NOUVEAU, "nouveau": nouveau2, "confirmation": nouveau2},
                 content_type="application/json")
    assert r.status_code == 200
    drh = client_jeton(r.json()["jeton"])
    r = drh.post(B + "acces/codes/remettre/", {"region": "Centre", "usage": "activation", "mot_de_passe": nouveau2},
                 content_type="application/json")
    assert r.status_code == 200 and r.json()["code"] == code_de(codes, "Centre", rang=2)["code"]

    # Récupération du DRH : fichier signé lié au poste, à usage unique.
    from django.contrib.auth.hashers import make_password
    op = [{"action": "reinitialiser", "identifiant": "drh", "mot_de_passe_hache": make_password("Secours-tmp-1")}]
    assert activer(Client(), cle_privee, "reinitialisation", op).json()["code"] == "poste_obligatoire"
    assert activer(Client(), cle_privee, "reinitialisation", op, poste=str(uuid.uuid4())).json()["code"] == \
        "poste_non_autorise"
    poste = Client().get(B + "acces/etat/").json()["poste"]
    ident = uuid.uuid4()
    assert activer(Client(), cle_privee, "reinitialisation", op, poste=poste, ident=ident).status_code == 201
    assert activer(Client(), cle_privee, "reinitialisation", op, poste=poste, ident=ident).json()["code"] == \
        "activation_rejouee"
    avant = _comptes_donnees()
    r = connecter("drh", "Secours-tmp-1")
    final = "Final-mdp-2026"
    r = client_jeton(r.json()["jeton"]).post(B + "acces/mot-de-passe/", {"actuel": "Secours-tmp-1", "nouveau": final,
                                                                         "confirmation": final},
                                             content_type="application/json")
    drh = client_jeton(r.json()["jeton"])
    assert drh.get(B + "acces/codes/").json()["verrouille"] is True
    r = drh.post(B + "acces/codes/remettre/", {"region": "Centre", "usage": "recuperation", "mot_de_passe": final},
                 content_type="application/json")
    assert r.status_code == 409 and r.json()["code"] == "carnet_verrouille"
    r = drh.post(B + "acces/carnet/secours/", {"cle_secours": "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF", "mot_de_passe": final},
                 content_type="application/json")
    assert r.json()["code"] == "cle_secours_incorrecte"
    r = drh.post(B + "acces/carnet/secours/", {"cle_secours": secours.lower(), "mot_de_passe": final},
                 content_type="application/json")
    assert r.status_code == 200 and r.json()["cle_secours"] != secours
    r = drh.post(B + "acces/codes/remettre/", {"region": "Centre", "usage": "recuperation", "mot_de_passe": final},
                 content_type="application/json")
    assert r.status_code == 200 and r.json()["code"] == code_de(codes, "Centre", "recuperation")["code"]
    assert RemiseCode.objects.count() == 4 and _comptes_donnees()[:4] == avant[:4]


def test_carnet_verrouille_et_cle_de_secours_perdue_reimport(db, cle_privee):
    drh = _poste_drh(cle_privee)
    _, carnet, codes = preparer_codes(cle_privee)
    assert _carnet(drh, carnet).status_code == 201
    drh.post(B + "acces/codes/remettre/", {"region": "Centre", "usage": "activation", "mot_de_passe": NOUVEAU},
             content_type="application/json")
    from contextes.acces.models import CoffreCarnet
    CoffreCarnet.objects.update(verrouille=True)
    r = _carnet(drh, carnet)                     # réimport depuis le fichier de l'administration
    assert r.status_code == 201 and r.json()["cle_secours"]
    r = drh.post(B + "acces/codes/remettre/", {"region": "Centre", "usage": "activation", "mot_de_passe": NOUVEAU},
                 content_type="application/json")
    assert r.json()["code"] == code_de(codes, "Centre", rang=1)["code"]       # la remise précédente est conservée


def test_seul_le_drh_gere_le_carnet(codes):
    client, _ = _delegue_actif(codes, "Centre")
    for methode, url in (("get", "acces/codes/"), ("post", "acces/codes/remettre/"), ("post", "acces/carnet/"),
                         ("post", "acces/carnet/secours/")):
        r = getattr(client, methode)(B + url)
        assert r.status_code == 403, url


def test_fichier_sans_poste_pour_une_activation_initiale_reste_accepte(db, cle_privee):
    assert activer(Client(), cle_privee, operations=[creer_compte("drh", "DRH")]).status_code == 201
    contenu = signer(charge("ajout", [creer_compte("drh2", "DRH")]), cle_privee)
    from tests.outils_acces import televerser
    assert televerser(Client(), contenu).status_code == 201


def test_catalogue_embarque_signe_et_sans_code_en_clair(db):
    """Le catalogue livré avec l'installation est vérifié par la clé publique embarquée."""
    from contextes.acces.codes_acces import catalogues
    from domaine.acces.regions import REGIONS_CAMEROUN

    liste = catalogues()
    assert liste and liste[0]["numero"] == 1
    groupes = {(g["region"], g["usage"]) for g in liste[0]["groupes"]}
    assert groupes == {(r, u) for r in REGIONS_CAMEROUN for u in ("activation", "recuperation")}
    assert all("code" not in v for g in liste[0]["groupes"] for v in g["verificateurs"])


# --- 7. Carnet embarqué dans l'installation, ouvert par le fichier d'activation du DRH ------------------------------


@pytest.fixture
def carnet_embarque(cle_privee, settings, tmp_path):
    """Installation livrée avec le carnet chiffré (clé connue du seul fichier d'activation du DRH)."""
    _, carnet, codes = preparer_codes(cle_privee)
    chemin = tmp_path / "carnet_codes.algoplanr-carnet"
    chemin.write_bytes(carnet)
    settings.ACCES_CARNET_EMBARQUE = chemin
    return codes


def _op_drh_avec_carnet(temporaire="123456", action="creer_compte"):
    from domaine.acces.codes import envelopper
    op = creer_compte("drh", "DRH", mdp=temporaire) if action == "creer_compte" else {
        "action": "reinitialiser", "identifiant": "drh",
        "mot_de_passe_hache": __import__("django.contrib.auth.hashers", fromlist=["x"]).make_password(temporaire)}
    op["carnet"] = envelopper(PHRASE.encode(), temporaire)
    return op


def _remettre(client, mdp, usage="activation"):
    return client.post(B + "acces/codes/remettre/", {"region": "Centre", "usage": usage, "mot_de_passe": mdp},
                       content_type="application/json")


def test_carnet_embarque_installe_a_la_creation_du_mot_de_passe(db, cle_privee, carnet_embarque):
    assert activer(Client(), cle_privee, operations=[_op_drh_avec_carnet()]).status_code == 201
    from contextes.acces.models import CoffreCarnet
    assert not CoffreCarnet.objects.exists()                 # rien d'installé avant le mot de passe personnel
    r = connecter("drh")
    r = client_jeton(r.json()["jeton"]).post(B + "acces/mot-de-passe/",
                                             {"actuel": "123456", "nouveau": NOUVEAU, "confirmation": NOUVEAU},
                                             content_type="application/json")
    assert r.status_code == 200 and r.json()["cle_secours"]
    drh = client_jeton(r.json()["jeton"])
    synth = drh.get(B + "acces/codes/").json()
    assert synth["present"] and not synth["verrouille"]
    assert _remettre(drh, NOUVEAU).json()["code"] == code_de(carnet_embarque, "Centre")["code"]
    assert all(c["code"] not in contenu_base() for c in carnet_embarque)
    # Le changement suivant ne montre plus de clé de secours : le carnet reste lisible.
    autre = "Encore-mdp-2026"
    r = drh.post(B + "acces/mot-de-passe/", {"actuel": NOUVEAU, "nouveau": autre, "confirmation": autre},
                 content_type="application/json")
    assert r.status_code == 200 and "cle_secours" not in r.json()
    assert _remettre(client_jeton(r.json()["jeton"]), autre).status_code == 200


def test_recuperation_du_drh_reconstruit_le_carnet_embarque(db, cle_privee, carnet_embarque):
    assert activer(Client(), cle_privee, operations=[_op_drh_avec_carnet()]).status_code == 201
    r = connecter("drh")
    r = client_jeton(r.json()["jeton"]).post(B + "acces/mot-de-passe/",
                                             {"actuel": "123456", "nouveau": NOUVEAU, "confirmation": NOUVEAU},
                                             content_type="application/json")
    drh = client_jeton(r.json()["jeton"])
    premier = _remettre(drh, NOUVEAU).json()["code"]
    poste = Client().get(B + "acces/etat/").json()["poste"]
    op = _op_drh_avec_carnet("Secours-tmp-2", "reinitialiser")
    assert activer(Client(), cle_privee, "reinitialisation", [op], poste=poste).status_code == 201
    r = connecter("drh", "Secours-tmp-2")
    final = "Final-mdp-2026"
    r = client_jeton(r.json()["jeton"]).post(B + "acces/mot-de-passe/", {"actuel": "Secours-tmp-2", "nouveau": final,
                                                                         "confirmation": final},
                                             content_type="application/json")
    assert r.status_code == 200 and r.json()["cle_secours"]
    drh = client_jeton(r.json()["jeton"])
    assert drh.get(B + "acces/codes/").json()["verrouille"] is False
    second = _remettre(drh, final).json()["code"]
    assert second != premier and RemiseCode.objects.count() == 2          # la remise précédente est conservée
