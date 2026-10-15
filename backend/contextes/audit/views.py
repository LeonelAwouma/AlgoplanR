from datetime import date

from django.http import Http404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.perimetre import jeu_autorise
from contextes.commun.erreurs import RefusMetier
from contextes.commun.outils import reponse_paginee

from .services import vers_dict

FILTRES = [OpenApiParameter("type", str, many=True), OpenApiParameter("objet", str, description="type:id"),
           OpenApiParameter("auteur", str), OpenApiParameter("du", str), OpenApiParameter("au", str),
           OpenApiParameter("page", int), OpenApiParameter("taille", int)]


def _jour(valeur: str, nom: str) -> date:
    try:
        return date.fromisoformat(valeur[:10])
    except ValueError:
        raise RefusMetier(f"Date invalide pour « {nom} »", ["Format attendu : AAAA-MM-JJ"])


@extend_schema(parameters=FILTRES, responses=OpenApiTypes.OBJECT,
               summary="Journal d'audit du jeu, du plus récent au plus ancien")
@api_view(["GET"])
def journal(request, jeu):
    j = jeu_autorise(request, jeu)
    q = request.query_params
    evenements = j.evenements_audit.all()
    types = q.getlist("type")
    if types:
        evenements = evenements.filter(type__in=types)
    if q.get("objet"):
        type_objet, _, ident = q["objet"].partition(":")
        evenements = evenements.filter(objet_type=type_objet, objet_id=ident)
    if q.get("auteur"):
        evenements = evenements.filter(auteur__icontains=q["auteur"].strip())
    if q.get("du"):
        evenements = evenements.filter(le__date__gte=_jour(q["du"], "du"))
    if q.get("au"):
        evenements = evenements.filter(le__date__lte=_jour(q["au"], "au"))
    return Response(reponse_paginee(request, [vers_dict(e) for e in evenements]))


@extend_schema(responses=OpenApiTypes.OBJECT, summary="Détail d'un événement : état avant et après")
@api_view(["GET"])
def evenement(request, jeu, evenement):
    j = jeu_autorise(request, jeu)
    e = j.evenements_audit.filter(pk=evenement).first()
    if e is None:
        raise Http404("Cet événement n'existe pas")
    return Response(vers_dict(e, detail=True))
