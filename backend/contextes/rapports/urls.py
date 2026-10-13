from django.urls import path

from . import views

urlpatterns = [path("jeux/<uuid:jeu>/rapport/", views.rapport)]
