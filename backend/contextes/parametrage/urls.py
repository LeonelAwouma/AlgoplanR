from django.urls import path

from . import views

urlpatterns = [
    path("parametres/defaut/", views.parametres_defaut),
    path("scenarios/presets/", views.scenarios_presets),
    path("jeux/<uuid:jeu>/parametres/", views.parametres_jeu),
    path("jeux/<uuid:jeu>/parametres/import/", views.parametres_import),
    path("jeux/<uuid:jeu>/situations-familiales/", views.situations_familiales),
]
