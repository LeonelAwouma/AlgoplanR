from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.controle_import import verifier_fichier
from contextes.acces.perimetre import jeu_autorise
from contextes.audit.services import decision
from contextes.commun.erreurs import RefusMetier
from contextes.donnees.lecteur import FichierIllisible, lire_classeur_numerote

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
    j = jeu_autorise(request, jeu)
    if request.method == "GET":
        return Response([_d(f) for f in j.faits_prince.all()])
    _protege(request)
    d = request.data
    f = services.ajouter(j, str(d.get("id_ens", "")), str(d.get("id_etab", "")), d.get("motif", ""))
    decision(j, "fait_prince", "ajout", f"Fait du Prince : {f.id_ens} → {f.id_etab}", request=request,
             declencheur="Fait du Prince", objet=("fait_prince", f.pk), apres=_d(f))
    return Response(_d(f), status=201)


@extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT, summary="Aperçu d'impact (rien n'est enregistré)")
@api_view(["POST"])
def impact(request, jeu):
    d = request.data
    # Simple aperçu, rien n'est enregistré : une lecture suffit.
    return Response(services.impact(jeu_autorise(request, jeu, ecriture=False), str(d.get("id_ens", "")),
                                    str(d.get("id_etab", "")), d.get("motif", "")))


@extend_schema(request={"multipart/form-data": OpenApiTypes.OBJECT}, responses=OpenApiTypes.OBJECT,
               summary="Import en lot (xlsx/csv) : acceptées, refus, manquantes")
@api_view(["POST"])
def importer(request, jeu):
    j = jeu_autorise(request, jeu)
    _protege(request)
    up = request.FILES.get("fichier")
    if up is None:
        raise RefusMetier("Aucun fichier reçu", ["Champ multipart « fichier » manquant"])
    try:
        _, _, entetes, lignes, numeros = lire_classeur_numerote(up.read(), up.name,
                                                                request.data.get("feuille") or None)
    except FichierIllisible as exc:
        raise RefusMetier(str(exc), code="fichier_illisible")
    verifier_fichier(request, entetes, lignes, numeros, up.name)
    bilan = services.importer(j, lignes)
    decision(j, "fait_prince", "import", f"Import de faits du Prince ({up.name})", request=request,
             declencheur="Import de faits du Prince", objet=("fait_prince", "import"), apres=bilan)
    return Response(bilan)


@extend_schema(responses=None, summary="Annuler un fait ; recalcule les scénarios")
@api_view(["DELETE"])
def annuler(request, jeu, pk):
    _protege(request)
    j = jeu_autorise(request, jeu)
    f = get_object_or_404(FaitPrince, pk=pk, jeu=j)
    avant = _d(f)
    services.annuler(j, f)
    decision(j, "fait_prince", "annulation", f"Fait du Prince annulé : {f.id_ens} → {f.id_etab}", request=request,
             declencheur="Annulation d'un fait du Prince", objet=("fait_prince", pk), avant=avant)
    return Response(status=204)
