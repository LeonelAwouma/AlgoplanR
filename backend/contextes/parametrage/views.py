import json

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.commun.erreurs import RefusMetier
from contextes.donnees.models import JeuDeDonnees
from domaine.mobilite.scenarios import SCENARIO_PRESETS, SCENARIOS_GEOGRAPHIQUES
from domaine.parametrage import config as cfg_dom

from . import services


@extend_schema(responses=OpenApiTypes.OBJECT, summary="Paramètres par défaut du moteur (DEFAULT_SETTINGS)")
@api_view(["GET"])
def parametres_defaut(request):
    return Response(cfg_dom.defaut())


@extend_schema(responses=OpenApiTypes.OBJECT, summary="Modèles de scénarios (SCENARIO_PRESETS)")
@api_view(["GET"])
def scenarios_presets(request):
    return Response({
        "presets": [{"code": k, **v} for k, v in SCENARIO_PRESETS.items()],
        "geographiques": SCENARIOS_GEOGRAPHIQUES,
    })


@extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT,
               methods=["PUT", "PATCH"], summary="Lire / remplacer / fusionner les règles du jeu")
@extend_schema(responses=OpenApiTypes.OBJECT, methods=["GET"])
@api_view(["GET", "PUT", "PATCH"])
def parametres_jeu(request, jeu):
    j = get_object_or_404(JeuDeDonnees, pk=jeu)
    if request.method == "GET":
        return Response({"parametres": services.config_jeu(j), "surcharges": services.surcharges_jeu(j)})
    corps = request.data
    if not isinstance(corps, dict):
        raise RefusMetier("Le corps doit être un objet JSON")
    corps = corps.get("parametres", corps) if "parametres" in corps and len(corps) == 1 else dict(corps)
    if request.method == "PUT":
        return Response(services.remplacer(j, corps))
    return Response(services.fusionner_avec_existant(j, corps))


@extend_schema(request={"multipart/form-data": OpenApiTypes.OBJECT, "application/json": OpenApiTypes.OBJECT},
               responses=OpenApiTypes.OBJECT, summary="Importer des règles (fichier JSON ou corps JSON)")
@api_view(["POST"])
def parametres_import(request, jeu):
    j = get_object_or_404(JeuDeDonnees, pk=jeu)
    fichier = request.FILES.get("fichier")
    if fichier is not None:
        try:
            regles = json.loads(fichier.read().decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RefusMetier("Fichier JSON invalide", [str(exc)])
    else:
        regles = request.data.get("parametres", request.data) if isinstance(request.data, dict) else None
    if not isinstance(regles, dict):
        raise RefusMetier("Aucune règle à importer", ["Envoyez un fichier JSON ou un objet JSON"])
    return Response(services.remplacer(j, dict(regles)))


@extend_schema(responses=OpenApiTypes.OBJECT, summary="Inventaire des situations familiales du jeu")
@api_view(["GET"])
def situations_familiales(request, jeu):
    return Response(services.inventaire_situations(get_object_or_404(JeuDeDonnees, pk=jeu)))
