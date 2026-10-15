from django.urls import path

from . import views as v

J = "jeux/<uuid:jeu>/"
P = J + "planification/"
urlpatterns = [
    path("hypotheses/defaut/", v.hypotheses_defaut),
    path(J + "hypotheses/", v.hypotheses),
    path(J + "hypotheses/documentation/", v.documentation),
    path(J + "hypotheses/historique/", v.historique_hypotheses),
    path(J + "hypotheses/attrition/estimer/", v.estimer_attrition),
    path(P, v.tableau),
    path(P + "territoires/", v.territoires),
    path(P + "sous-systemes/", v.sous_systemes),
    path(P + "ecoles/", v.ecoles),
    path(P + "departs/", v.departs),
    path(P + "fiabilite/", v.fiabilite),
    path(P + "rapport/", v.rapport),
    path(P + "rapport/listes/", v.rapport_listes),
    path(P + "etat/", v.etat),
    path(P + "recalculer/", v.recalculer),
    path(P + "versions/", v.versions),
    path(P + "versions/comparer/", v.comparer),
    path(P + "versions/<int:numero>/", v.version),
    path(J + "quotas/", v.quotas),
    path(J + "quotas/valider/", v.valider_quotas),
    path(J + "quotas/historique/", v.historique_quotas),
    path(J + "quotas/<str:annee>/<str:territoire>/", v.quota),
    path(J + "indicateurs/", v.indicateurs),
    path(J + "indicateurs/evolution/", v.evolution),
]
