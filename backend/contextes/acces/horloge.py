"""Heure courante du contexte Accès, remplaçable dans les tests (expiration des sessions, blocages)."""
from __future__ import annotations

from datetime import datetime

from django.utils import timezone


def maintenant() -> datetime:
    return timezone.now()
