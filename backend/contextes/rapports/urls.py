from django.urls import path

from . import views

urlpatterns = [
    path("jeux/<uuid:jeu>/rapport/", views.rapport),
    path("jeux/<uuid:jeu>/rapports/territorial/", views.rapport_territorial),
    path("jeux/<uuid:jeu>/rapports/territorial/export/", views.rapport_territorial_export),
]
