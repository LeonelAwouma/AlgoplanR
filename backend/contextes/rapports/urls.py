from django.urls import path

from . import views

urlpatterns = [
    path("jeux/<uuid:jeu>/rapport/", views.rapport),
    path("jeux/<uuid:jeu>/rapports/territorial/", views.rapport_territorial),
]
