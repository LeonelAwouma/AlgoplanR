from django.urls import path

from . import views as v

C = "acces/comptes/<str:identifiant>/"
urlpatterns = [
    path("acces/etat/", v.etat),
    path("acces/activation/", v.appliquer_activation),
    path("acces/connexion/", v.connexion),
    path("acces/code/", v.code_acces),
    path("acces/deconnexion/", v.deconnexion),
    path("acces/session/", v.session),
    path("acces/session/activite/", v.activite),
    path("acces/mot-de-passe/", v.mot_de_passe),
    path("acces/region/confirmer/", v.confirmer_region),
    path("acces/comptes/", v.comptes),
    path(C + "historique/", v.historique),
    path(C + "suspendre/", v.suspendre),
    path(C + "reactiver/", v.reactiver),
    path(C + "reinitialiser-mot-de-passe/", v.reinitialiser),
    path(C + "fermer-sessions/", v.fermer_sessions),
    path("acces/codes/", v.codes),
    path("acces/codes/remettre/", v.remettre_code),
    path("acces/carnet/", v.carnet),
    path("acces/carnet/secours/", v.carnet_secours),
]
