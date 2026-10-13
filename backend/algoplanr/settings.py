"""Configuration Django d'AlgoPlanR (API locale, SQLite, un seul poste)."""
from __future__ import annotations

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _bool(nom: str, defaut: bool = False) -> bool:
    return os.environ.get(nom, str(defaut)).strip().lower() in ("1", "true", "oui", "yes")


DEBUG = _bool("ALGOPLANR_DEBUG", False)
SECRET_KEY = os.environ.get("ALGOPLANR_SECRET_KEY") or ("dev-" + secrets.token_hex(16) if DEBUG else secrets.token_hex(32))
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]

# Jeton local exigé dans l'en-tête X-AlgoPlanR-Jeton (généré par Electron à chaque lancement).
# Vide = contrôle désactivé (développement et tests uniquement).
ALGOPLANR_JETON = os.environ.get("ALGOPLANR_JETON", "")
# Code optionnel protégeant l'écriture des faits de Prince (en-tête X-AlgoPlanR-Code-Prince). Vide = désactivé.
ALGOPLANR_CODE_PRINCE = os.environ.get("ALGOPLANR_CODE_PRINCE", "")

DATA_DIR = Path(os.environ.get("ALGOPLANR_DATA_DIR", BASE_DIR / "donnees"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
FRONTEND_DIR = Path(os.environ.get("ALGOPLANR_FRONTEND_DIR", BASE_DIR / "frontend_out"))

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
    "contextes.donnees",
    "contextes.parametrage",
    "contextes.diagnostic",
    "contextes.prince",
    "contextes.simulation",
    "contextes.arbitrage",
    "contextes.recrutement",
    "contextes.rapports",
    "contextes.ia",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
    "contextes.commun.middleware.JetonLocalMiddleware",
]

ROOT_URLCONF = "algoplanr.urls"
WSGI_APPLICATION = "algoplanr.wsgi.application"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": ["django.template.context_processors.request"]},
}]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("ALGOPLANR_DB", str(DATA_DIR / "algoplanr.sqlite3")),
        "OPTIONS": {"timeout": 30},
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Africa/Douala"
USE_TZ = True
STATIC_URL = "/_static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
if FRONTEND_DIR.exists():
    WHITENOISE_ROOT = FRONTEND_DIR
    WHITENOISE_INDEX_FILE = True

# Le frontend est servi depuis la même origine en production : CORS seulement en développement.
if DEBUG:
    CORS_ALLOWED_ORIGINS = ["http://127.0.0.1:3000", "http://localhost:3000"]
    CORS_ALLOW_HEADERS = ["content-type", "x-algoplanr-jeton", "x-algoplanr-code-prince"]
    CORS_EXPOSE_HEADERS = ["content-disposition"]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser", "rest_framework.parsers.MultiPartParser"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "contextes.commun.erreurs.gestionnaire_exceptions",
    "UNAUTHENTICATED_USER": None,
}
SPECTACULAR_SETTINGS = {
    "TITLE": "AlgoPlanR API",
    "DESCRIPTION": "API d'affectation des enseignants (MINEDUB / PAREC).",
    "VERSION": "2.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
}
DATA_UPLOAD_MAX_MEMORY_SIZE = 200 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 200 * 1024 * 1024
