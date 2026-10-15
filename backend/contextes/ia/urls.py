from django.urls import path

from . import views

S = "jeux/<uuid:jeu>/scenarios/<int:sid>/ia/"
urlpatterns = [
    path(S + "note-strategique/", views.note_strategique),
    path(S + "audit-equite/", views.audit_equite),
    path(S + "copilot/", views.copilot),
]
