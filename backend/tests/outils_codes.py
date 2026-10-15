"""Outils des tests des codes d'accès : catalogue et carnet signés par la clé de test, saisie, finalisation."""
from __future__ import annotations

from django.core import serializers
from django.test import Client

from contextes.acces.activation import signer
from contextes.acces.preparation_codes import preparer
from tests.outils_acces import B, NOUVEAU, client_jeton, televerser

#: Coût scrypt réduit pour les tests (les paramètres sont portés par chaque catalogue).
PARAMS_TEST = {"n": 2 ** 10, "r": 8, "p": 1}
PHRASE = "phrase-de-test-AlgoPlanR"


def preparer_codes(cle_privee: bytes, numero: int = 1, *, activation: int = 3, recuperation: int = 2,
                   regions=("Centre", "Littoral"), revoques=()):
    """(catalogue signé, carnet signé, codes en clair [{id, region, usage, code}])."""
    catalogue, carnet, codes = preparer(numero, activation=activation, recuperation=recuperation, phrase=PHRASE,
                                        regions=regions, revoques=revoques, params=PARAMS_TEST)
    return signer(catalogue, cle_privee), signer(carnet, cle_privee), codes


def code_de(codes, region: str, usage: str = "activation", rang: int = 0) -> dict:
    return [c for c in codes if c["region"] == region and c["usage"] == usage][rang]


def importer_fichier(contenu: bytes):
    return televerser(Client(), contenu)


def saisir(region: str, code: str, usage: str = "activation"):
    return Client().post(B + "acces/code/", {"region": region, "usage": usage, "code": code},
                         content_type="application/json")


def finaliser(reponse, code: str, nouveau: str = NOUVEAU):
    """Crée le mot de passe personnel après la saisie d'un code (le code tient lieu de mot de passe actuel)."""
    return client_jeton(reponse.json()["jeton"]).post(
        B + "acces/mot-de-passe/", {"actuel": code, "nouveau": nouveau, "confirmation": nouveau},
        content_type="application/json")


def contenu_base() -> str:
    """Toutes les lignes de toutes les tables, sérialisées : pour vérifier qu'aucun secret n'y figure en clair."""
    from django.apps import apps

    morceaux = []
    for modele in apps.get_models():
        try:
            morceaux.append(serializers.serialize("json", modele.objects.all()))
        except Exception:     # tables sans clé simple : sans objet ici
            continue
    return "\n".join(morceaux)
