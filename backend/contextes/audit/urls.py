from django.urls import path

from . import views

urlpatterns = [
    path("jeux/<uuid:jeu>/journal-audit/", views.journal),
    path("jeux/<uuid:jeu>/journal-audit/<int:evenement>/", views.evenement),
]
