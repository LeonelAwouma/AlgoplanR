from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.controle_import import verifier_fichier
from contextes.acces.perimetre import jeu_autorise
from contextes.audit.services import decision
from contextes.commun.erreurs import RefusMetier
from contextes.donnees.lecteur import FichierIllisible, lire_classeur_numerote
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
    j = jeu_autorise(request, jeu)
    if request.method == "DELETE":
        nb = j.recrues.count()
        j.recrues.all().delete()
        sim.recalculer_scenarios(j)
        decision(j, "recrues", "suppression", f"{nb} recrue(s) supprimée(s)", request=request,
                 declencheur="Suppression des recrues", objet=("recrues", j.id), avant={"recrues": nb})
        return Response(status=204)
    return Response([_d(r) for r in j.recrues.all()])


@extend_schema(request={"multipart/form-data": OpenApiTypes.OBJECT}, responses=OpenApiTypes.OBJECT,
               summary="Importer les candidats au concours (xlsx/csv) ; recalcule")
@api_view(["POST"])
def recrues_import(request, jeu):
    j = jeu_autorise(request, jeu)
    up = request.FILES.get("fichier")
    if up is None:
        raise RefusMetier("Aucun fichier reçu", ["Champ multipart « fichier » manquant"])
    try:
        _, _, entetes, lignes, numeros = lire_classeur_numerote(up.read(), up.name,
                                                                request.data.get("feuille") or None)
    except FichierIllisible as exc:
        raise RefusMetier(str(exc), code="fichier_illisible")
    # Délégué : toute région (ou région souhaitée) renseignée doit être la sienne, sinon refus du fichier entier.
    verifier_fichier(request, entetes, lignes, numeros, up.name)
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
    decision(j, "recrues", "import", f"{len(nouvelles)} recrue(s) importée(s) ({up.name})", request=request,
             declencheur="Import des recrues", objet=("recrues", j.id),
             apres={"acceptees": len(nouvelles), "refusees": len(analyse["refusees"])})
    return Response({"acceptees": len(nouvelles), "refusees": analyse["refusees"]}, status=201)
