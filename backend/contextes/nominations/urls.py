from django.urls import path

from . import views as v

J = "jeux/<uuid:jeu>/"
N = J + "nominations/<int:nomination>/"
urlpatterns = [
    path(J + "vivier/", v.vivier),
    path(J + "vivier/import/", v.vivier_import),
    path(J + "vivier/<str:personne>/", v.personne),
    path(J + "vivier/<str:personne>/postes-compatibles/", v.postes_compatibles),
    path(J + "postes-ouverts/", v.postes_ouverts),
    path(J + "postes-ouverts/<str:poste>/candidats/", v.candidats),
    path(J + "nominations/", v.nominations),
    path(J + "nominations/generer/", v.generer),
    path(J + "nominations/lot/", v.lot),
    path(J + "nominations/import/", v.importer),
    path(J + "nominations/synthese/", v.synthese),
    path(N, v.nomination),
    path(N + "valider/", v.valider),
    path(N + "rejeter/", v.rejeter),
    path(N + "mettre-en-oeuvre/", v.mettre_en_oeuvre),
    path(N + "annuler/", v.annuler),
    path(J + "mouvements/", v.mouvements),
    path(J + "mouvements/controles/", v.controles),
    path(J + "mouvements/<str:mouvement>/", v.mouvement),
    path(J + "mouvements/<str:mouvement>/mettre-en-oeuvre/", v.realiser),
    path(J + "personnes/<str:matricule>/mouvements/", v.mouvements_personne),
]
