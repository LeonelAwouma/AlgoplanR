"""Horloge injectable : le domaine ne lit jamais l'heure système directement."""
from __future__ import annotations

from datetime import datetime
from typing import Callable

Horloge = Callable[[], str]


def horloge_systeme() -> str:
    return datetime.now().isoformat(timespec="seconds")


def horloge_fixe(valeur: str = "2026-01-01T00:00:00") -> Horloge:
    return lambda: valeur
