"""Historique des accès et outils de session, sans dépendance vers DRF.

Ce module est importé par la classe d'authentification, elle-même chargée pendant l'initialisation de
`rest_framework.views` : il ne doit importer ni DRF ni `contextes.commun.erreurs`.
"""
from __future__ import annotations

import hashlib
from datetime import timedelta

from django.conf import settings

from . import horloge
from .models import Compte, EvenementAcces, SessionUtilisateur


def evenement(compte: Compte | None, type_: str, auteur: str = "", details: dict | None = None,
              identifiant: str = "") -> None:
    EvenementAcces.objects.create(
        compte=compte, identifiant_saisi=identifiant or (compte.identifiant if compte else ""), type=type_,
        le=horloge.maintenant(), auteur=auteur, details=details or {})


def empreinte(jeton: str) -> str:
    return hashlib.sha256(jeton.encode("utf-8")).hexdigest()


def duree_inactivite() -> timedelta:
    return timedelta(minutes=getattr(settings, "ACCES_INACTIVITE_MIN", 20))


def prolonger(session: SessionUtilisateur) -> SessionUtilisateur:
    session.derniere_activite = horloge.maintenant()
    session.save(update_fields=["derniere_activite"])
    return session


def fermer(session: SessionUtilisateur, motif: str) -> None:
    session.fermee_le, session.motif_fermeture = horloge.maintenant(), motif
    session.save(update_fields=["fermee_le", "motif_fermeture"])
