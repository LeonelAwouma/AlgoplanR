from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.perimetre import jeu_autorise
from contextes.commun.outils import perimetre_depuis
from contextes.simulation import services as sim
from domaine.diagnostic.territoires import restreindre_resultat
from domaine.rapport.rapport import construire_rapport


@extend_schema(parameters=[OpenApiParameter("scenario", int), OpenApiParameter("region", str),
                           OpenApiParameter("departement", str), OpenApiParameter("commune", str)],
               responses=OpenApiTypes.OBJECT, summary="Rapport de décision (JSON)")
@api_view(["GET"])
def rapport(request, jeu):
    j = jeu_autorise(request, jeu)
    sid = request.query_params.get("scenario")
    sc = sim.scenario_du_jeu(j, int(sid)) if sid else sim.scenario_par_defaut(j)
    r = restreindre_resultat(sim.charger_resultat(sc), perimetre_depuis(request))
    return Response(construire_rapport(
        r, jeu={"id": str(j.id), "nom": j.nom, "statut": j.statut, "valide_par": j.valide_par or None,
                "valide_le": j.valide_le.isoformat(timespec="seconds") if j.valide_le else None,
                "reserve_drh": j.validation_reserve}, scenario=sim.resume_scenario(sc),
        faits_prince=sim.faits_prince_actifs(j), arbitrages=sim.arbitrages_jeu(j),
        genere_le=timezone.now().isoformat(timespec="seconds")))
