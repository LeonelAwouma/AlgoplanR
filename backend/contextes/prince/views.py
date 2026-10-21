from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.controle_import import verifier_fichier
from contextes.acces.perimetre import jeu_autorise
from contextes.audit.services import decision
from contextes.commun.erreurs import RefusMetier
from contextes.commun.outils import SansNegociation, bool_param, perimetre_depuis, reponse_excel, reponse_paginee
from contextes.donnees.lecteur import FichierIllisible, lire_classeur_numerote

from . import services
from .models import FaitPrince


def _d(f: FaitPrince) -> dict:
    return {"id": f.pk, "id_ens": f.id_ens, "id_etab": f.id_etab, "motif": f.motif, "statut": f.statut,
            "motif_invalidite": f.motif_invalidite or None, "cree_le": f.cree_le}


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
    f, alertes = services.ajouter(j, str(d.get("id_ens", "")), str(d.get("id_etab", "")), d.get("motif", ""))
    decision(j, "fait_prince", "ajout", f"Fait du Prince : {f.id_ens} → {f.id_etab}", request=request,
             declencheur="Fait du Prince", objet=("fait_prince", f.pk), apres={**_d(f), "alertes": alertes})
    return Response({**_d(f), "alertes": alertes}, status=201)


@extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT, summary="Aperçu d'impact (rien n'est enregistré)")
@api_view(["POST"])
def impact(request, jeu):
    d = request.data
    # Simple aperçu, rien n'est enregistré : une lecture suffit.
    return Response(services.impact(jeu_autorise(request, jeu, ecriture=False), str(d.get("id_ens", "")),
                                    str(d.get("id_etab", "")), d.get("motif", "")))


@extend_schema(request={"multipart/form-data": OpenApiTypes.OBJECT}, responses=OpenApiTypes.OBJECT,
               parameters=[OpenApiParameter("apercu", bool)],
               summary="Import en lot (xlsx/csv) : acceptées, refus, manquantes ; ?apercu=1 : essai à blanc")
@api_view(["POST"])
def importer(request, jeu):
    apercu = bool_param(request, "apercu")
    j = jeu_autorise(request, jeu, ecriture=not apercu)
    if not apercu:
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
    if apercu:
        # Essai à blanc : rien n'est enregistré, ni recalculé, ni journalisé.
        return Response(services.apercu_import(j, lignes))
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


@extend_schema(responses=OpenApiTypes.OBJECT,
               summary="Faits actifs appliqués aux bases : résumé, avant / après, décisions, écarts d'effectifs")
@api_view(["GET"])
def application(request, jeu):
    return Response(services.application(jeu_autorise(request, jeu, ecriture=False)))


BASES = [OpenApiParameter("concernes", bool), OpenApiParameter("q", str), OpenApiParameter("page", int),
         OpenApiParameter("taille", int), OpenApiParameter("tri", str)]


@extend_schema(parameters=BASES, responses=OpenApiTypes.OBJECT,
               summary="Base « après Prince » (etablissements, enseignants ou journal), paginée")
@api_view(["GET"])
def bases(request, jeu, nom):
    j = jeu_autorise(request, jeu, ecriture=False)
    lignes = services.lignes_bases(j, nom, perimetre_depuis(request), concernes=bool_param(request, "concernes"),
                                   q=request.query_params.get("q", ""))
    return Response(reponse_paginee(request, lignes))


@extend_schema(parameters=BASES[:1],
               responses={(200, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"):
                          OpenApiTypes.BINARY},
               summary="Classeur Excel d'une base « après Prince » (base dérivée pour simulation)")
@api_view(["GET"])
def bases_export(request, jeu, nom):
    j = jeu_autorise(request, jeu, ecriture=False)
    octets, fichier = services.classeur(j, nom, perimetre_depuis(request), concernes=bool_param(request, "concernes"))
    return reponse_excel(octets, fichier)


bases_export.cls.content_negotiation_class = SansNegociation
