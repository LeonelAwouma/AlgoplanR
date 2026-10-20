"""Outils communs aux vues : périmètre, pagination, téléversement."""
from __future__ import annotations

from typing import Iterable, List

from django.http import HttpResponse
from rest_framework.negotiation import BaseContentNegotiation

from domaine.commun.pagination import paginer, trier
from domaine.diagnostic.territoires import Perimetre


def perimetre_depuis(request) -> Perimetre:
    """Périmètre demandé. Pour un délégué, la région est toujours celle de son compte, quel que soit le paramètre."""
    from contextes.acces.perimetre import region_imposee

    q = request.query_params
    region = region_imposee(request) or q.get("region", "").strip()
    return Perimetre(region, q.get("departement", "").strip(), q.get("commune", "").strip())


def reponse_paginee(request, lignes: Iterable[dict], tri_defaut: str | None = None) -> dict:
    q = request.query_params
    lignes = trier(list(lignes), q.get("tri") or tri_defaut)
    try:
        page, taille = int(q.get("page", 1)), int(q.get("taille", 50))
    except ValueError:
        page, taille = 1, 50
    return paginer(lignes, page, taille)


def bool_param(request, nom: str, defaut: bool = False) -> bool:
    v = request.query_params.get(nom)
    if v is None:
        return defaut
    return v.strip().lower() in ("1", "true", "oui", "yes")


MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class SansNegociation(BaseContentNegotiation):
    """Une vue qui renvoie un fichier accepte n'importe quel type demandé par le client."""

    def select_parser(self, request, parsers):
        return parsers[0]

    def select_renderer(self, request, renderers, format_suffix=None):
        return (renderers[0], renderers[0].media_type)


def reponse_excel(octets: bytes, nom_fichier: str) -> HttpResponse:
    """Réponse de téléchargement d'un classeur Excel."""
    rep = HttpResponse(octets, content_type=MIME_XLSX)
    rep["Content-Disposition"] = f'attachment; filename="{nom_fichier}"'
    return rep
