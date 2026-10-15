from django.urls import path

from . import views

urlpatterns = [
    path("jeux/<uuid:jeu>/recrues/", views.recrues),
    path("jeux/<uuid:jeu>/recrues/import/", views.recrues_import),
]
