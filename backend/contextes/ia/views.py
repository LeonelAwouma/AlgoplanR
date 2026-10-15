from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.perimetre import jeu_autorise
from contextes.commun.erreurs import RefusMetier
from contextes.commun.outils import perimetre_depuis
from contextes.simulation import services as sim
from domaine.diagnostic.territoires import restreindre_resultat

from . import services

GEO = [OpenApiParameter(n, str) for n in ("region", "departement", "commune")]


def _res(request, jeu, sid):
    # Les routes IA sont des POST qui n'enregistrent rien : une lecture suffit.
    j = jeu_autorise(request, jeu, ecriture=False)
    return restreindre_resultat(sim.charger_resultat(sim.scenario_du_jeu(j, sid)), perimetre_depuis(request))


@extend_schema(parameters=GEO, request=None, responses=OpenApiTypes.OBJECT, summary="Note de synthèse stratégique (IA)")
@api_view(["POST"])
def note_strategique(request, jeu, sid):
    return Response({"texte": services.note_strategique(_res(request, jeu, sid))})


@extend_schema(parameters=GEO, request=None, responses=OpenApiTypes.OBJECT, summary="Audit d'équité des dérogations (IA)")
@api_view(["POST"])
def audit_equite(request, jeu, sid):
    return Response({"texte": services.audit_equite(_res(request, jeu, sid))})


@extend_schema(parameters=GEO, request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT, summary="Copilot : question libre")
@api_view(["POST"])
def copilot(request, jeu, sid):
    q = str(request.data.get("question", "")).strip()
    if not q:
        raise RefusMetier("Question vide", ["Le champ « question » est requis"])
    return Response({"texte": services.copilot(_res(request, jeu, sid), q)})
