import json

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.perimetre import jeu_autorise
from contextes.audit.services import decision
from contextes.commun.erreurs import RefusMetier
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
    j = jeu_autorise(request, jeu)
    if request.method == "GET":
        return Response({"parametres": services.config_jeu(j), "surcharges": services.surcharges_jeu(j),
                         "annee_scolaire": j.annee_scolaire})
    corps = request.data
    if not isinstance(corps, dict):
        raise RefusMetier("Le corps doit être un objet JSON")
    corps = corps.get("parametres", corps) if "parametres" in corps and len(corps) == 1 else dict(corps)
    avant = services.config_jeu(j)
    res = services.remplacer(j, corps) if request.method == "PUT" else services.fusionner_avec_existant(j, corps)
    decision(j, "parametres", "remplacement" if request.method == "PUT" else "modification",
             "Règles du moteur modifiées", request=request, declencheur="Modification des règles du moteur",
             objet=("parametres", j.id), avant=avant, apres=services.config_jeu(j))
    return Response({**res, "annee_scolaire": j.annee_scolaire})


@extend_schema(request={"multipart/form-data": OpenApiTypes.OBJECT, "application/json": OpenApiTypes.OBJECT},
               responses=OpenApiTypes.OBJECT, summary="Importer des règles (fichier JSON ou corps JSON)")
@api_view(["POST"])
def parametres_import(request, jeu):
    j = jeu_autorise(request, jeu)
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
    avant = services.config_jeu(j)
    res = services.remplacer(j, dict(regles))
    decision(j, "parametres", "import", "Règles du moteur importées", request=request,
             declencheur="Import des règles du moteur", objet=("parametres", j.id), avant=avant,
             apres=services.config_jeu(j))
    return Response({**res, "annee_scolaire": j.annee_scolaire})


@extend_schema(responses=OpenApiTypes.OBJECT, summary="Inventaire des situations familiales du jeu")
@api_view(["GET"])
def situations_familiales(request, jeu):
    return Response(services.inventaire_situations(jeu_autorise(request, jeu)))
