"""Sécurité locale : jeton secret exigé sur toute l'API (hors /sante/ et préambules CORS)."""
from __future__ import annotations

import hmac

from django.conf import settings
from django.http import JsonResponse

EXEMPTES = ("/api/v1/sante/",)


class JetonLocalMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        jeton = settings.ALGOPLANR_JETON
        if jeton and request.path.startswith("/api/") and request.path not in EXEMPTES \
                and request.method != "OPTIONS":
            fourni = request.headers.get("X-AlgoPlanR-Jeton", "")
            if not hmac.compare_digest(fourni.encode(), jeton.encode()):
                return JsonResponse({"detail": "Jeton local manquant ou invalide", "code": "jeton_invalide"},
                                    status=401)
        return self.get_response(request)
