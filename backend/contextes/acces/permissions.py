"""Permissions DRF fondées sur le compte authentifié et la portée de sa session."""
from __future__ import annotations

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from .models import PORTEE_CHANGEMENT_MDP, PORTEE_COMPLETE, PORTEE_CONFIRMATION_REGION


def _authentifie(request) -> bool:
    return bool(getattr(request.user, "is_authenticated", False)) and request.auth is not None


class SessionOuverte(BasePermission):
    """Toute session valide, même limitée (changement du mot de passe, confirmation de la région)."""

    def has_permission(self, request, view):
        return _authentifie(request)


class AccesComplet(BasePermission):
    """Permission par défaut de toute l'API : session complète, mot de passe changé et région confirmée."""

    def has_permission(self, request, view):
        if not _authentifie(request):
            return False
        portee = request.auth.portee
        if portee == PORTEE_COMPLETE:
            return True
        if portee == PORTEE_CHANGEMENT_MDP:
            raise PermissionDenied("Changez votre mot de passe temporaire avant d'accéder à l'application.",
                                   code="mot_de_passe_a_changer")
        if portee == PORTEE_CONFIRMATION_REGION:
            raise PermissionDenied("Confirmez votre région avant d'accéder à l'application.",
                                   code="region_a_confirmer")
        return False


class EstDrh(AccesComplet):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if not request.user.est_drh:
            raise PermissionDenied("Action réservée au DRH.", code="reserve_drh")
        return True


class EstDelegue(AccesComplet):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if not request.user.est_delegue:
            raise PermissionDenied("Action réservée aux délégués régionaux.", code="reserve_delegue")
        return True


class PorteeChangementMotDePasse(BasePermission):
    """Changement du mot de passe : permis à une session complète ou limitée à ce changement."""

    def has_permission(self, request, view):
        return _authentifie(request) and request.auth.portee in (PORTEE_CHANGEMENT_MDP, PORTEE_COMPLETE)


class PorteeConfirmationRegion(BasePermission):
    def has_permission(self, request, view):
        if not _authentifie(request):
            return False
        if request.auth.portee != PORTEE_CONFIRMATION_REGION:
            raise PermissionDenied("Aucune région n'est à confirmer pour cette session.", code="portee_invalide")
        return True
