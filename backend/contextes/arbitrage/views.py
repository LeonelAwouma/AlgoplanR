from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.perimetre import jeu_autorise
from contextes.audit.services import decision
from contextes.commun.erreurs import RefusMetier
from contextes.diagnostic.services import preparer
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
    j = jeu_autorise(request, jeu)
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
    decision(j, "arbitrage", "décision", f"Arbitrage : {a.id_ens} → {a.id_etab}", request=request,
             declencheur="Décision d'arbitrage", objet=("arbitrage", a.pk), apres=_d(a))
    return Response(_d(a), status=201)


@extend_schema(responses=None, summary="Annuler une décision ; recalcule")
@api_view(["DELETE"])
def arbitrage_supprimer(request, jeu, pk):
    j = jeu_autorise(request, jeu)
    a = get_object_or_404(DecisionArbitrage, pk=pk, jeu=j)
    avant = _d(a)
    a.delete()
    sim.recalculer_scenarios(j)
    decision(j, "arbitrage", "annulation", f"Arbitrage annulé : {avant['id_ens']}", request=request,
             declencheur="Annulation d'un arbitrage", objet=("arbitrage", pk), avant=avant)
    return Response(status=204)
