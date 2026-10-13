from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def sante(request):
    return JsonResponse({"statut": "ok", "application": "AlgoPlanR", "version": "2.1.0"})


v1 = [
    path("sante/", sante, name="sante"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("", include("contextes.parametrage.urls")),
    path("", include("contextes.donnees.urls")),
    path("", include("contextes.diagnostic.urls")),
    path("", include("contextes.prince.urls")),
    path("", include("contextes.simulation.urls")),
    path("", include("contextes.arbitrage.urls")),
    path("", include("contextes.recrutement.urls")),
    path("", include("contextes.rapports.urls")),
    path("", include("contextes.ia.urls")),
]
urlpatterns = [path("api/v1/", include(v1))]
