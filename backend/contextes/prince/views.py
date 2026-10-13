from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.commun.erreurs import RefusMetier
from contextes.donnees.lecteur import FichierIllisible, lire_classeur
from contextes.donnees.models import JeuDeDonnees

from . import services
from .models import FaitPrince


def _d(f: FaitPrince) -> dict:
    return {"id": f.pk, "id_ens": f.id_ens, "id_etab": f.id_etab, "motif": f.motif, "statut": f.statut,
            "cree_le": f.cree_le}


def _protege(request):
    if not services.code_requis_ok(request):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Code d'accès Effet de Prince manquant ou invalide")


@extend_schema(methods=["GET"], responses=OpenApiTypes.OBJECT, summary="Faits du Prince et leur statut")
@extend_schema(methods=["POST"], request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT,
               summary="Ajouter un fait {id_ens, id_etab, motif} ; recalcule les scénarios")
@api_view(["GET", "POST"])
def faits(request, jeu):
    j = get_object_or_404(JeuDeDonnees, pk=jeu)
    if request.method == "GET":
        return Response([_d(f) for f in j.faits_prince.all()])
    _protege(request)
    d = request.data
    return Response(_d(services.ajouter(j, str(d.get("id_ens", "")), str(d.get("id_etab", "")), d.get("motif", ""))),
                    status=201)


@extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT, summary="Aperçu d'impact (rien n'est enregistré)")
@api_view(["POST"])
def impact(request, jeu):
    d = request.data
    return Response(services.impact(get_object_or_404(JeuDeDonnees, pk=jeu), str(d.get("id_ens", "")),
                                    str(d.get("id_etab", "")), d.get("motif", "")))


@extend_schema(request={"multipart/form-data": OpenApiTypes.OBJECT}, responses=OpenApiTypes.OBJECT,
               summary="Import en lot (xlsx/csv) : acceptées, refus, manquantes")
@api_view(["POST"])
def importer(request, jeu):
    _protege(request)
    up = request.FILES.get("fichier")
    if up is None:
        raise RefusMetier("Aucun fichier reçu", ["Champ multipart « fichier » manquant"])
    try:
        _, _, _, lignes = lire_classeur(up.read(), up.name, request.data.get("feuille") or None)
    except FichierIllisible as exc:
        raise RefusMetier(str(exc), code="fichier_illisible")
    return Response(services.importer(get_object_or_404(JeuDeDonnees, pk=jeu), lignes))


@extend_schema(responses=None, summary="Annuler un fait ; recalcule les scénarios")
@api_view(["DELETE"])
def annuler(request, jeu, pk):
    _protege(request)
    j = get_object_or_404(JeuDeDonnees, pk=jeu)
    services.annuler(j, get_object_or_404(FaitPrince, pk=pk, jeu=j))
    return Response(status=204)
