from django.urls import path

from . import views

urlpatterns = [
    path("jeux/<uuid:jeu>/arbitrages/", views.arbitrages),
    path("jeux/<uuid:jeu>/arbitrages/<int:pk>/", views.arbitrage_supprimer),
]
