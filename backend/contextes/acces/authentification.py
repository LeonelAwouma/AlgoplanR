"""Authentification DRF par jeton de session : en-tête `Authorization: Bearer <jeton>`.

Le jeton est tiré au hasard à la connexion ; le serveur n'en garde que l'empreinte SHA-256. L'expiration est
contrôlée ici, à chaque requête : 20 minutes sans activité (réglage `ACCES_INACTIVITE_MIN`) ou 12 heures après
l'ouverture, la session est fermée côté serveur, quoi qu'affiche l'interface.

Seules les requêtes d'écriture et `POST acces/session/activite/` comptent comme activité : les lectures faites
en arrière-plan par l'interface (rafraîchissements automatiques) ne maintiennent pas une session abandonnée.

Le jeton local `X-AlgoPlanR-Jeton` (JetonLocalMiddleware) reste exigé en plus : il authentifie le processus de
l'application de bureau, pas la personne.
"""
from __future__ import annotations

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import SAFE_METHODS

from . import horloge
from .journal import duree_inactivite, empreinte, evenement, fermer, prolonger
from .models import EvenementAcces, SessionUtilisateur


class AuthentificationJeton(BaseAuthentication):
    mot_cle = "bearer"

    def authenticate(self, request):
        entete = request.META.get("HTTP_AUTHORIZATION", "")
        if not entete:
            return None
        type_, _, jeton = entete.partition(" ")
        jeton = jeton.strip()
        if type_.lower() != self.mot_cle or not jeton or len(jeton) > 200:
            raise AuthenticationFailed("En-tête d'authentification invalide.", code="session_invalide")
        session = (SessionUtilisateur.objects.select_related("compte")
                   .filter(empreinte_jeton=empreinte(jeton)).first())
        if session is None or session.fermee_le is not None:
            raise AuthenticationFailed("Session fermée ou inconnue : reconnectez-vous.", code="session_invalide")
        compte = session.compte
        maintenant = horloge.maintenant()
        if not compte.actif:
            fermer(session, "compte_inactif")
            raise AuthenticationFailed("Ce compte n'est plus actif.", code="session_invalide")
        if maintenant >= session.expire_absolue or maintenant >= session.derniere_activite + duree_inactivite():
            fermer(session, "expiration")
            evenement(compte, EvenementAcces.EXPIRATION)
            raise AuthenticationFailed("Session expirée après une période d'inactivité.", code="session_expiree")
        if request.method not in SAFE_METHODS:
            prolonger(session)
        return compte, session

    def authenticate_header(self, request):
        # Un en-tête WWW-Authenticate fait répondre 401 (et non 403) aux requêtes non authentifiées.
        return 'Bearer realm="AlgoPlanR"'
