"""Codes d'accès des délégués régionaux et coffre chiffré du carnet du DRH. Python pur (+ `cryptography`).

Un code compte 8 caractères tirés au hasard dans un alphabet de 31 symboles sans ambiguïté de lecture
(31^8 ≈ 8,5·10^11 combinaisons, ~39,6 bits). Les postes ne conservent jamais un code : ils reçoivent un catalogue
de vérificateurs `scrypt`, regroupés par (région, usage) avec un sel par groupe — une saisie coûte un seul calcul,
quel que soit le nombre de codes du groupe.

Le carnet du DRH (les codes en clair) est chiffré en AES-256-GCM par une clé de données, elle-même enveloppée par
une clé dérivée d'un secret (mot de passe du DRH, clé de secours, phrase de transport).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from typing import Dict, Iterable, List, Optional, Set

ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"   # 31 symboles : ni 0, O, 1, I ni L
LONGUEUR = 8
USAGES = ("activation", "recuperation")

#: Coût des vérificateurs du catalogue (~0,8 s et 64 Mo par saisie sur un poste courant ; mesuré par
#: `manage.py acces_mesurer_codes`). Enregistré dans chaque catalogue : il peut évoluer sans invalider les codes.
PARAMS_CATALOGUE = {"n": 2 ** 16, "r": 8, "p": 1}
#: Coût des dérivations de clé du coffre (mot de passe, clé de secours, phrase).
PARAMS_COFFRE = {"n": 2 ** 15, "r": 8, "p": 1}
LONGUEUR_CLE_SECOURS = 24


class CodeIllisible(ValueError):
    pass


class DechiffrementImpossible(ValueError):
    pass


def b64(octets: bytes) -> str:
    return base64.b64encode(octets).decode("ascii")


def deb64(texte: str) -> bytes:
    return base64.b64decode(texte.encode("ascii"), validate=True)


# --- Codes ----------------------------------------------------------------------------------------------------

def normaliser(code: str) -> str:
    """Majuscules, sans espaces ni tirets."""
    return "".join(c for c in str(code or "").upper() if c not in " -_\t")


def est_bien_forme(code: str) -> bool:
    c = normaliser(code)
    return len(c) == LONGUEUR and all(x in ALPHABET for x in c)


def generer_codes(nombre: int, exclus: Iterable[str] = ()) -> List[str]:
    """`nombre` codes distincts, absents de `exclus`."""
    vus: Set[str] = set(exclus)
    codes: List[str] = []
    while len(codes) < nombre:
        c = "".join(secrets.choice(ALPHABET) for _ in range(LONGUEUR))
        if c not in vus:
            vus.add(c)
            codes.append(c)
    return codes


def _scrypt(secret: bytes, sel: bytes, params: Dict[str, int], longueur: int = 32) -> bytes:
    n, r, p = int(params["n"]), int(params["r"]), int(params["p"])
    return hashlib.scrypt(secret, salt=sel, n=n, r=r, p=p, maxmem=128 * r * n * p + 64 * 1024 * 1024,
                          dklen=longueur)


def verificateur(code: str, sel: bytes, params: Dict[str, int]) -> bytes:
    return _scrypt(normaliser(code).encode("ascii"), sel, params)


def groupe(region: str, usage: str, codes: Dict[str, str], params: Dict[str, int]) -> dict:
    """Groupe de catalogue : un sel, un vérificateur par code ({id: code}). Aucun code en clair."""
    sel = os.urandom(16)
    return {"region": region, "usage": usage, "sel": b64(sel),
            "verificateurs": [{"id": i, "v": b64(verificateur(c, sel, params))} for i, c in codes.items()]}


def chercher(code: str, groupe_: dict, params: Dict[str, int]) -> Optional[str]:
    """Identifiant de l'entrée du groupe qui correspond au code, `None` sinon (un seul calcul scrypt)."""
    if not est_bien_forme(code):
        return None
    v = verificateur(code, deb64(groupe_["sel"]), params)
    trouve = None
    for e in groupe_["verificateurs"]:     # parcours complet : temps indépendant de la position
        if hmac.compare_digest(v, deb64(e["v"])):
            trouve = e["id"]
    return trouve


# --- Coffre chiffré -------------------------------------------------------------------------------------------

def deriver_cle(secret: str, sel: bytes, params: Dict[str, int] = PARAMS_COFFRE) -> bytes:
    return _scrypt(str(secret).encode("utf-8"), sel, params)


def chiffrer(cle: bytes, clair: bytes) -> dict:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nonce = os.urandom(12)
    return {"nonce": b64(nonce), "chiffre": b64(AESGCM(cle).encrypt(nonce, clair, None))}


def dechiffrer(cle: bytes, boite: dict) -> bytes:
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    try:
        return AESGCM(cle).decrypt(deb64(boite["nonce"]), deb64(boite["chiffre"]), None)
    except (InvalidTag, KeyError, ValueError):
        raise DechiffrementImpossible("Clé incorrecte ou données altérées")


def envelopper(cle_donnees: bytes, secret: str) -> dict:
    """Clé de données chiffrée par une clé dérivée de `secret`."""
    sel = os.urandom(16)
    return {"sel": b64(sel), "params": dict(PARAMS_COFFRE), **chiffrer(deriver_cle(secret, sel), cle_donnees)}


def desenvelopper(enveloppe: dict, secret: str) -> bytes:
    cle = deriver_cle(secret, deb64(enveloppe["sel"]), enveloppe.get("params") or PARAMS_COFFRE)
    return dechiffrer(cle, enveloppe)


def nouvelle_cle_donnees() -> bytes:
    return os.urandom(32)


def nouvelle_cle_secours() -> str:
    """24 caractères de l'alphabet des codes, présentés par blocs de 4."""
    brute = "".join(secrets.choice(ALPHABET) for _ in range(LONGUEUR_CLE_SECOURS))
    return "-".join(brute[i:i + 4] for i in range(0, LONGUEUR_CLE_SECOURS, 4))
