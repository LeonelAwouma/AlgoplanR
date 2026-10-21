from django.urls import path

from . import views

urlpatterns = [
    path("jeux/<uuid:jeu>/faits-prince/", views.faits),
    path("jeux/<uuid:jeu>/faits-prince/impact/", views.impact),
    path("jeux/<uuid:jeu>/faits-prince/import/", views.importer),
    path("jeux/<uuid:jeu>/faits-prince/application/", views.application),
    path("jeux/<uuid:jeu>/faits-prince/bases/<str:nom>/", views.bases),
    path("jeux/<uuid:jeu>/faits-prince/bases/<str:nom>/export/", views.bases_export),
    path("jeux/<uuid:jeu>/faits-prince/<int:pk>/", views.annuler),
]
