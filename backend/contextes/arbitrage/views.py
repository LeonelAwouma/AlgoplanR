from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.commun.erreurs import RefusMetier
from contextes.diagnostic.services import preparer
from contextes.donnees.models import JeuDeDonnees
from contextes.simulation import services as sim

from .models import DecisionArbitrage


def _d(a):
    return {"id": a.pk, "id_ens": a.id_ens, "id_etab": a.id_etab, "motif": a.motif, "commission": a.commission,
            "cree_le": a.cree_le}


@extend_schema(methods=["GET"], responses=OpenApiTypes.OBJECT, summary="Décisions des commissions")
@extend_schema(methods=["POST"], request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT,
               summary="Décision {id_ens, id_etab, motif, commission} ; remplace la précédente ; recalcule")
@api_view(["GET", "POST"])
def arbitrages(request, jeu):
    j = get_object_or_404(JeuDeDonnees, pk=jeu)
    if request.method == "GET":
        return Response([_d(a) for a in j.arbitrages.all()])
    d = request.data
    ens, etab = str(d.get("id_ens", "")).strip(), str(d.get("id_etab", "")).strip()
    p = preparer(j)
    motifs = []
    if not ens or not etab:
        motifs.append("id_ens et id_etab sont requis")
    else:
        if etab not in p.ecoles_par_id:
            motifs.append(f"École inconnue : {etab}")
        if ens not in {e.matricule for e in p.vivier}:
            motifs.append("Enseignant absent du vivier")
    if motifs:
        raise RefusMetier("Arbitrage refusé", motifs, code="arbitrage_refuse")
    a, _ = DecisionArbitrage.objects.update_or_create(
        jeu=j, id_ens=ens, defaults={"id_etab": etab, "motif": d.get("motif", ""),
                                     "commission": d.get("commission", "")})
    sim.recalculer_scenarios(j)
    return Response(_d(a), status=201)


@extend_schema(responses=None, summary="Annuler une décision ; recalcule")
@api_view(["DELETE"])
def arbitrage_supprimer(request, jeu, pk):
    j = get_object_or_404(JeuDeDonnees, pk=jeu)
    get_object_or_404(DecisionArbitrage, pk=pk, jeu=j).delete()
    sim.recalculer_scenarios(j)
    return Response(status=204)
