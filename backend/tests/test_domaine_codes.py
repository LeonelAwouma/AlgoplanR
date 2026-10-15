"""Codes d'accès et coffre chiffré, domaine pur."""
import json
import os

import pytest

from domaine.acces import codes as dom

PARAMS = {"n": 2 ** 10, "r": 8, "p": 1}


def test_forme_et_alphabet():
    assert len(dom.ALPHABET) == 31 and not set("0O1IL") & set(dom.ALPHABET)
    assert dom.normaliser(" ab-cd ef gh ") == "ABCDEFGH" and dom.est_bien_forme("ab-cd-ef-gh")
    assert not dom.est_bien_forme("ABCDEFG") and not dom.est_bien_forme("ABCDEFG0")
    codes = dom.generer_codes(300)
    assert len(set(codes)) == 300 and all(dom.est_bien_forme(c) for c in codes)
    assert not set(dom.generer_codes(50, exclus=codes)) & set(codes)


def test_groupe_sans_code_en_clair_et_recherche_en_un_calcul():
    codes = {f"E{i}": c for i, c in enumerate(dom.generer_codes(20))}
    g = dom.groupe("Centre", "activation", codes, PARAMS)
    texte = json.dumps(g)
    assert all(c not in texte for c in codes.values())
    assert dom.chercher(codes["E7"].lower(), g, PARAMS) == "E7"
    assert dom.chercher("22222222", g, PARAMS) is None and dom.chercher("trop-court", g, PARAMS) is None
    autre = dom.groupe("Centre", "activation", {"X": codes["E7"]}, PARAMS)
    assert autre["sel"] != g["sel"]                       # un sel par groupe : vérificateurs différents
    assert dom.chercher(codes["E7"], autre, PARAMS) == "X"


def test_chiffrement_et_enveloppes():
    cle = dom.nouvelle_cle_donnees()
    boite = dom.chiffrer(cle, b"carnet secret")
    assert dom.dechiffrer(cle, boite) == b"carnet secret"
    with pytest.raises(dom.DechiffrementImpossible):
        dom.dechiffrer(os.urandom(32), boite)
    altere = {**boite, "chiffre": dom.b64(bytes([dom.deb64(boite["chiffre"])[0] ^ 1]) + dom.deb64(boite["chiffre"])[1:])}
    with pytest.raises(dom.DechiffrementImpossible):
        dom.dechiffrer(cle, altere)
    env = dom.envelopper(cle, "Mot-de-passe-2026")
    assert dom.desenvelopper(env, "Mot-de-passe-2026") == cle
    with pytest.raises(dom.DechiffrementImpossible):
        dom.desenvelopper(env, "autre")
    secours = dom.nouvelle_cle_secours()
    assert len(dom.normaliser(secours)) == dom.LONGUEUR_CLE_SECOURS and secours.count("-") == 5
