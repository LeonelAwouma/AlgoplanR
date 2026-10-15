"""Outils des tests d'accès : clés de test, fichiers d'activation signés, clients authentifiés."""
from __future__ import annotations

import io
import uuid
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.test import Client
from django.utils import timezone

from contextes.acces.activation import FORMAT, VERSION, signer
from domaine.acces.regions import REGIONS_CAMEROUN

B = "/api/v1/"
TEMPORAIRE = "123456"
NOUVEAU = "Nouveau-mdp-2026"


def generer_cles():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    cle = Ed25519PrivateKey.generate()
    privee = cle.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                               serialization.NoEncryption())
    publique = cle.public_key().public_bytes(serialization.Encoding.PEM,
                                             serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    return privee, publique


def identifiant(region: str) -> str:
    from contextes.acces.management.commands.acces_preparer_activation import identifiant_delegue

    return identifiant_delegue(region)


def charge(type_: str, operations: list, *, expire_dans=timedelta(days=30), ident=None, poste=None) -> dict:
    """Charge d'un fichier d'activation. `expire_le` imite les anciens fichiers : le poste l'ignore."""
    maintenant = timezone.now()
    corps = {"format": FORMAT, "version": VERSION, "id": str(ident or uuid.uuid4()), "type": type_,
             "emise_le": maintenant.isoformat(), "expire_le": (maintenant + expire_dans).isoformat(),
             "operations": operations}
    if poste:
        corps["poste"] = poste
    return corps


def creer_compte(ident: str, role: str, region=None, mdp: str = TEMPORAIRE) -> dict:
    return {"action": "creer_compte", "identifiant": ident, "role": role, "region": region, "nom_affiche": ident,
            "mot_de_passe_hache": make_password(mdp),
            "temporaire_expire_le": (timezone.now() + timedelta(days=7)).isoformat()}


def comptes_test() -> list:
    return [creer_compte("drh", "DRH")] + [creer_compte(identifiant(r), "DELEGUE", r) for r in REGIONS_CAMEROUN]


def televerser(client: Client, contenu: bytes, url: str = "acces/activation/"):
    f = io.BytesIO(contenu)
    f.name = "activation.algoplanr-activation"
    return client.post(B + url, {"fichier": f})


def activer(client: Client, cle_privee: bytes, type_: str = "initiale", operations=None, **kw):
    return televerser(client, signer(charge(type_, operations if operations is not None else comptes_test(), **kw),
                                     cle_privee))


def client_jeton(jeton: str) -> Client:
    return Client(HTTP_AUTHORIZATION=f"Bearer {jeton}")


def connecter(ident: str, mdp: str = TEMPORAIRE):
    return Client().post(B + "acces/connexion/", {"identifiant": ident, "mot_de_passe": mdp},
                         content_type="application/json")


def session_complete(ident: str, region: str | None = None) -> Client:
    """Client d'un compte prêt à travailler : mot de passe changé, région confirmée pour un délégué."""
    r = connecter(ident)
    assert r.status_code == 201, r.content
    jeton = r.json()["jeton"]
    r = client_jeton(jeton).post(B + "acces/mot-de-passe/",
                                 {"actuel": TEMPORAIRE, "nouveau": NOUVEAU, "confirmation": NOUVEAU},
                                 content_type="application/json")
    assert r.status_code == 200, r.content
    jeton = r.json()["jeton"]
    if region:
        r = client_jeton(jeton).post(B + "acces/region/confirmer/", {"region": region},
                                     content_type="application/json")
        assert r.status_code == 200, r.content
        jeton = r.json()["jeton"]
    return client_jeton(jeton)
