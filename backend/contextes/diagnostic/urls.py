from django.urls import path

from . import views

urlpatterns = [
    path("jeux/<uuid:jeu>/diagnostic/", views.diagnostic),
    path("jeux/<uuid:jeu>/diagnostic/totaux/", views.diagnostic_totaux),
    path("jeux/<uuid:jeu>/territoires/", views.territoires),
    path("jeux/<uuid:jeu>/territoires/arbre/", views.territoires_arbre),
    path("jeux/<uuid:jeu>/territoires/options/", views.territoires_options),
    path("jeux/<uuid:jeu>/priorites/", views.priorites),
    path("jeux/<uuid:jeu>/synthese/", views.synthese),
]
