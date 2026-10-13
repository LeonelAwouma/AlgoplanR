"""Erreurs métier (HTTP 422) et gestionnaire d'exceptions DRF."""
from __future__ import annotations

from typing import List

from django.http import Http404
from rest_framework.response import Response
from rest_framework.views import exception_handler

from domaine.parametrage.config import ParametresInvalides


class RefusMetier(Exception):
    """Refus métier : renvoyé en 422 avec son motif."""

    def __init__(self, message: str, motifs: List[str] | None = None, code: str = "refus_metier"):
        super().__init__(message)
        self.message, self.motifs, self.code = message, motifs or [], code


def gestionnaire_exceptions(exc, contexte):
    if isinstance(exc, RefusMetier):
        return Response({"detail": exc.message, "code": exc.code, "motifs": exc.motifs}, status=422)
    if isinstance(exc, ParametresInvalides):
        return Response({"detail": "Paramètres invalides", "code": "parametres_invalides", "motifs": exc.erreurs},
                        status=422)
    if isinstance(exc, Http404):
        return Response({"detail": str(exc) or "Ressource introuvable", "code": "introuvable"}, status=404)
    return exception_handler(exc, contexte)
