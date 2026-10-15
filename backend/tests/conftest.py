import os
import tempfile

import pytest

_tmp = tempfile.mkdtemp()
os.environ["ALGOPLANR_DATA_DIR"] = _tmp
os.environ["ALGOPLANR_DB"] = os.path.join(_tmp, "test.sqlite3")
os.environ["ALGOPLANR_JETON"] = ""


@pytest.fixture
def cle_privee(settings):
    """Clé de signature propre aux tests : le poste n'accepte que les fichiers signés par elle."""
    from tests.outils_acces import generer_cles

    privee, publique = generer_cles()
    settings.ACCES_CLES_PUBLIQUES = [publique]
    # Hachage rapide pour les tests seulement (PBKDF2 complet en production).
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    return privee


@pytest.fixture
def poste_active(db, cle_privee):
    """Poste activé avec le DRH et les dix délégués (mot de passe temporaire 123456)."""
    from django.test import Client

    from tests.outils_acces import activer

    r = activer(Client(), cle_privee)
    assert r.status_code == 201, r.content
    return cle_privee


@pytest.fixture
def drh(poste_active):
    from tests.outils_acces import session_complete

    return session_complete("drh")


@pytest.fixture
def centre(poste_active):
    from tests.outils_acces import identifiant, session_complete

    return session_complete(identifiant("Centre"), "Centre")


@pytest.fixture
def littoral(poste_active):
    from tests.outils_acces import identifiant, session_complete

    return session_complete(identifiant("Littoral"), "Littoral")
