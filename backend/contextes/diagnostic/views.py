from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.perimetre import jeu_autorise
from contextes.commun.outils import bool_param, perimetre_depuis, reponse_paginee
from contextes.simulation import services as sim

from . import services

GEO = [OpenApiParameter(n, str, description="Filtre territorial") for n in ("region", "departement", "commune")]


@extend_schema(parameters=GEO + [OpenApiParameter(n, str) for n in
                                 ("zone", "securite", "sous_systeme", "type", "seulement", "q", "tri")]
               + [OpenApiParameter("sans_prince", bool), OpenApiParameter("page", int), OpenApiParameter("taille", int)],
               responses=OpenApiTypes.OBJECT, summary="Diagnostic des besoins (Moteur A)")
@api_view(["GET"])
def diagnostic(request, jeu):
    j = jeu_autorise(request, jeu)
    q = request.query_params
    d = services.diagnostic(j, perimetre_depuis(request), zone=q.get("zone", ""), securite=q.get("securite", ""),
                            sous_systeme=q.get("sous_systeme", ""), type_etab=q.get("type", ""),
                            seulement=q.get("seulement", ""), q=q.get("q", ""),
                            sans_prince=bool_param(request, "sans_prince"))
    d["ecoles"] = reponse_paginee(request, d["ecoles"], "-Up")
    return Response(d)


@extend_schema(parameters=GEO, responses=OpenApiTypes.OBJECT, summary="Nœud territorial courant, enfants, fil d'Ariane")
@api_view(["GET"])
def territoires(request, jeu):
    return Response(services.territoires(jeu_autorise(request, jeu), perimetre_depuis(request)))


@extend_schema(parameters=GEO, responses=OpenApiTypes.OBJECT, summary="Options des menus de filtres (cascade)")
@api_view(["GET"])
def territoires_options(request, jeu):
    return Response(services.options(jeu_autorise(request, jeu), perimetre_depuis(request)))


@extend_schema(parameters=GEO, responses=OpenApiTypes.OBJECT, summary="Écoles triées par priorité, avec raisons")
@api_view(["GET"])
def priorites(request, jeu):
    lignes = services.priorites(jeu_autorise(request, jeu), perimetre_depuis(request))
    return Response(reponse_paginee(request, lignes))


@extend_schema(parameters=GEO + [OpenApiParameter("scenario", int)], responses=OpenApiTypes.OBJECT,
               summary="Synthèse territoriale, tableau de bord, points d'attention")
@api_view(["GET"])
def synthese(request, jeu):
    j = jeu_autorise(request, jeu)
    sid = request.query_params.get("scenario")
    sc = sim.scenario_du_jeu(j, int(sid)) if sid else None
    return Response(services.synthese(j, perimetre_depuis(request), sc))
