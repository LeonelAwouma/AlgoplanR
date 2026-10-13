from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.commun.erreurs import RefusMetier
from contextes.donnees.lecteur import FichierIllisible, lire_classeur
from contextes.donnees.models import JeuDeDonnees
from contextes.simulation import services as sim
from domaine.mobilite.analyses import analyser_recrues

from .models import Recrue


def _d(r):
    return {"id_recrue": r.id_recrue, "nom": r.nom, "prenom": r.prenom, "sous_systeme": r.sous_systeme,
            "region_souhaitee": r.region_souhaitee, "rang": r.rang}


@extend_schema(methods=["GET"], responses=OpenApiTypes.OBJECT, summary="Liste des recrues")
@extend_schema(methods=["DELETE"], responses=None, summary="Supprimer toutes les recrues ; recalcule")
@api_view(["GET", "DELETE"])
def recrues(request, jeu):
    j = get_object_or_404(JeuDeDonnees, pk=jeu)
    if request.method == "DELETE":
        j.recrues.all().delete()
        sim.recalculer_scenarios(j)
        return Response(status=204)
    return Response([_d(r) for r in j.recrues.all()])


@extend_schema(request={"multipart/form-data": OpenApiTypes.OBJECT}, responses=OpenApiTypes.OBJECT,
               summary="Importer les candidats au concours (xlsx/csv) ; recalcule")
@api_view(["POST"])
def recrues_import(request, jeu):
    j = get_object_or_404(JeuDeDonnees, pk=jeu)
    up = request.FILES.get("fichier")
    if up is None:
        raise RefusMetier("Aucun fichier reçu", ["Champ multipart « fichier » manquant"])
    try:
        _, _, _, lignes = lire_classeur(up.read(), up.name, request.data.get("feuille") or None)
    except FichierIllisible as exc:
        raise RefusMetier(str(exc), code="fichier_illisible")
    analyse = analyser_recrues(lignes)
    existants = set(j.recrues.values_list("id_recrue", flat=True))
    nouvelles = []
    for r in analyse["acceptees"]:
        if r["id_recrue"] in existants:
            analyse["refusees"].append({"id_recrue": r["id_recrue"], "motif": "Recrue déjà enregistrée"})
        else:
            nouvelles.append(Recrue(jeu=j, **r))
    Recrue.objects.bulk_create(nouvelles)
    sim.recalculer_scenarios(j)
    return Response({"acceptees": len(nouvelles), "refusees": analyse["refusees"]}, status=201)
