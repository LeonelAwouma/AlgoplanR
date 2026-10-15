from django.urls import path

from . import views as v

S = "jeux/<uuid:jeu>/scenarios/<int:sid>/"
urlpatterns = [
    path("jeux/<uuid:jeu>/scenarios/", v.scenarios),
    path("jeux/<uuid:jeu>/scenarios/base/", v.scenarios_base),
    path(S, v.scenario_detail),
    path(S + "executer/", v.executer),
    path(S + "resultat/", v.resultat),
    path(S + "affectations/", v.affectations),
    path(S + "affectations/<str:matricule>/explication/", v.explication),
    path(S + "non-affectes/", v.non_affectes),
    path(S + "vivier/", v.vivier),
    path(S + "postes/", v.postes),
    path(S + "postes-non-couverts/", v.postes_non_couverts_groupes),
    path(S + "postes-zone-rouge/", v.postes_rouge),
    path(S + "ecoles-en-besoin/", v.ecoles_besoin),
    path(S + "ecoles-fournisseurs/", v.ecoles_fournisseurs),
    path(S + "candidatures/", v.candidatures),
    path(S + "combinaisons/", v.combinaisons),
    path(S + "journal/", v.journal),
    path(S + "invariants/", v.invariants),
    path(S + "projections/", v.projections),
    path(S + "recrutes/", v.recrutes),
    path(S + "flux/", v.flux),
    path(S + "export/", v.exporter),
    path("jeux/<uuid:jeu>/comparaison/", v.comparaison),
    path("jeux/<uuid:jeu>/scenario-retenu/", v.scenario_retenu),
]
