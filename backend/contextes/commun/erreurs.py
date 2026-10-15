"""Erreurs métier (HTTP 422) et gestionnaire d'exceptions DRF."""
from __future__ import annotations

from typing import Any, List

from django.http import Http404
from rest_framework.exceptions import NotAuthenticated
from rest_framework.response import Response
from rest_framework.views import exception_handler

from domaine.parametrage.config import ParametresInvalides


class RefusMetier(Exception):
    """Refus métier : renvoyé en 422 (ou au statut `statut`) avec son motif."""

    statut = 422

    def __init__(self, message: str, motifs: List[str] | None = None, code: str = "refus_metier",
                 details: Any = None):
        super().__init__(message)
        self.message, self.motifs, self.code, self.details = message, motifs or [], code, details


def gestionnaire_exceptions(exc, contexte):
    if isinstance(exc, RefusMetier):
        corps = {"detail": exc.message, "code": exc.code, "motifs": exc.motifs}
        if exc.details is not None:
            corps["details"] = exc.details
        return Response(corps, status=exc.statut)
    if isinstance(exc, ParametresInvalides):
        return Response({"detail": "Paramètres invalides", "code": "parametres_invalides", "motifs": exc.erreurs},
                        status=422)
    if isinstance(exc, Http404):
        return Response({"detail": str(exc) or "Ressource introuvable", "code": "introuvable"}, status=404)
    reponse = exception_handler(exc, contexte)
    if reponse is None or not isinstance(reponse.data, dict):
        return reponse
    if isinstance(exc, NotAuthenticated):
        reponse.data = {"detail": "Authentification requise : connectez-vous.", "code": "non_authentifie"}
    elif "code" not in reponse.data:
        # Code stable (session_expiree, mot_de_passe_a_changer…) joint aux refus d'accès, pour l'interface.
        codes = exc.get_codes() if hasattr(exc, "get_codes") else None
        if isinstance(codes, str):
            reponse.data["code"] = codes
    return reponse
