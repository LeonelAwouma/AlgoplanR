"""Cloisonnement des données selon le compte authentifié. Toute vue qui touche un jeu passe par `jeu_autorise`.

| Compte   | Lecture                              | Écriture                                                     |
|----------|--------------------------------------|--------------------------------------------------------------|
| Délégué  | jeux régionaux de SA région          | idem                                                         |
| DRH      | tous les jeux                        | jeux nationaux (importés, consolidés, démonstration, hérités) |

Le DRH importe des classeurs nationaux (toutes régions) ; il consulte les jeux régionaux des délégués sans
pouvoir les modifier.

Un jeu hors de portée répond 404, comme s'il n'existait pas. La région d'un délégué vient toujours de son compte,
jamais d'un paramètre envoyé par l'interface.
"""
from __future__ import annotations

from django.http import Http404
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS

PORTEE_REGIONALE = "regional"
PORTEE_NATIONALE = "national"
PORTEE_HERITEE = "national_herite"


def peut_lire(compte, jeu) -> bool:
    if compte.est_drh:
        return True
    return jeu.portee == PORTEE_REGIONALE and jeu.region is not None and jeu.region == compte.region


def peut_ecrire(compte, jeu) -> bool:
    if compte.est_drh:
        return jeu.portee in (PORTEE_NATIONALE, PORTEE_HERITEE)
    return peut_lire(compte, jeu)


def jeux_visibles(compte):
    from contextes.donnees.models import JeuDeDonnees

    if compte.est_drh:
        return JeuDeDonnees.objects.all()
    return JeuDeDonnees.objects.filter(portee=PORTEE_REGIONALE, region=compte.region)


def jeu_autorise(request, jeu, *, ecriture: bool | None = None):
    """Jeu demandé, s'il est à la portée du compte connecté (lecture, ou écriture si `ecriture`).

    Par défaut, toute requête autre que GET/HEAD/OPTIONS est une écriture.
    """
    from contextes.donnees.models import JeuDeDonnees

    compte = request.user
    if ecriture is None:
        ecriture = request.method not in SAFE_METHODS
    j = JeuDeDonnees.objects.filter(pk=jeu).first()
    if j is None or not peut_lire(compte, j):
        raise Http404("Jeu de données introuvable")
    if ecriture and not peut_ecrire(compte, j):
        raise PermissionDenied("Le DRH consulte les jeux régionaux sans pouvoir les modifier : travaillez sur un "
                               "jeu national (importé ou consolidé).", code="ecriture_interdite")
    return j


def region_imposee(request) -> str | None:
    """Région à laquelle les requêtes du compte connecté sont restreintes ; None pour le DRH."""
    compte = getattr(request, "user", None)
    if compte is not None and getattr(compte, "is_authenticated", False) and compte.est_delegue:
        return compte.region
    return None
