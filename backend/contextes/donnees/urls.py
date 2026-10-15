from django.urls import path

from . import views

urlpatterns = [
    path("fichiers/", views.fichiers),
    path("fichiers/<uuid:fichier>/correspondances/", views.fichier_correspondances),
    path("jeux/", views.jeux),
    path("jeux/demonstration/", views.jeu_demonstration),
    path("jeux/<uuid:jeu>/", views.jeu_detail),
    path("jeux/<uuid:jeu>/qualite/", views.qualite),
    path("jeux/<uuid:jeu>/validation/", views.validation),
    path("jeux/<uuid:jeu>/actualisations/", views.actualisations),
    path("jeux/<uuid:jeu>/actualisations/<int:actualisation>/ecarts/", views.ecarts_actualisation),
    path("jeux/<uuid:jeu>/etablissements/", views.etablissements),
    path("jeux/<uuid:jeu>/etablissements/<str:ident>/", views.etablissement_detail),
    path("jeux/<uuid:jeu>/enseignants/", views.enseignants),
    path("jeux/<uuid:jeu>/enseignants/<str:matricule>/", views.enseignant_detail),
    path("jeux/<uuid:jeu>/recherche/enseignants/", views.recherche_enseignants),
    path("jeux/<uuid:jeu>/recherche/etablissements/", views.recherche_etablissements),
]
