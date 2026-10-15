from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from contextes.commun.erreurs import RefusMetier

from . import activation, services
from .journal import prolonger
from .models import Compte, EvenementAcces
from .permissions import EstDrh, PorteeChangementMotDePasse, PorteeConfirmationRegion, SessionOuverte

OBJ = OpenApiTypes.OBJECT
TAILLE_MAX_ACTIVATION = 2 * 1024 * 1024


def _texte(request, nom: str) -> str:
    v = request.data.get(nom, "") if isinstance(request.data, dict) or hasattr(request.data, "get") else ""
    return v if isinstance(v, str) else ""


# --- Routes publiques : aucune ne donne accès aux données ---------------------------------------------------------


@extend_schema(responses=OBJ, summary="État du poste : activé ou non (aucun compte n'est listé)")
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def etat(request):
    from .codes_acces import profil_poste

    from domaine.acces.regions import identifiant_delegue

    e = activation.etat_registre()
    profil, region = profil_poste()
    return Response({"poste_active": e == activation.ETAT_ACTIVE, "registre": e,
                     "poste": activation.identifiant_poste(), "profil": profil, "region": region,
                     "identifiant": identifiant_delegue(region) if region else None})


@extend_schema(request={"multipart/form-data": OBJ}, responses=OBJ,
               summary="Importer un fichier signé par l'administration : activation, récupération ou catalogue de codes")
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def appliquer_activation(request):
    from .codes_acces import FORMAT_CATALOGUE, importer_catalogue

    up = request.FILES.get("fichier")
    if up is None:
        raise RefusMetier("Aucun fichier reçu", ["Champ multipart « fichier » manquant"])
    if up.size > TAILLE_MAX_ACTIVATION:
        raise RefusMetier("Fichier d'activation trop volumineux", code="activation_illisible")
    contenu = up.read()
    charge = activation.verifier_enveloppe(contenu)
    if charge.get("format") == FORMAT_CATALOGUE:
        bilan = importer_catalogue(contenu, charge, auteur="interface")
        return Response({"id": f"catalogue-{bilan['numero']}", "type": "catalogue",
                         "operations": [f"Catalogue de codes n° {bilan['numero']} : {bilan['codes']} code(s), "
                                        f"{bilan['revoques']} révoqué(s)"],
                         "registre": activation.etat_registre()}, status=201)
    a = activation.appliquer(contenu, auteur="interface")
    return Response({"id": str(a.id), "type": a.type, "operations": a.resume.get("operations", []),
                     "registre": activation.etat_registre()}, status=201)


@extend_schema(request=OBJ, responses=OBJ,
               summary="Délégué : code d'activation ou de récupération {region, usage, code} ; session limitée à la "
                       "création du mot de passe")
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def code_acces(request):
    from .codes_acces import utiliser_code

    usage = _texte(request, "usage") or "activation"
    compte, jeton, session = utiliser_code(_texte(request, "region"), usage, _texte(request, "code"))
    return Response(services.reponse_session(compte, jeton, session), status=201)


@extend_schema(request=OBJ, responses=OBJ, summary="Connexion : {identifiant, mot_de_passe} -> jeton de session")
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def connexion(request):
    compte, jeton, session = services.connecter(_texte(request, "identifiant"), _texte(request, "mot_de_passe"))
    return Response(services.reponse_session(compte, jeton, session), status=201)


# --- Session en cours ------------------------------------------------------------------------------------------


@extend_schema(request=None, responses=None, summary="Déconnexion : ferme la session côté serveur")
@api_view(["POST"])
@permission_classes([SessionOuverte])
def deconnexion(request):
    services.deconnecter(request.auth)
    return Response(status=204)


@extend_schema(responses=OBJ, summary="Compte connecté et échéances de la session (ne la prolonge pas)")
@api_view(["GET"])
@permission_classes([SessionOuverte])
def session(request):
    return Response(services.reponse_session(request.user, None, request.auth))


@extend_schema(request=None, responses=OBJ, summary="Signale une activité de l'utilisateur : prolonge la session")
@api_view(["POST"])
@permission_classes([SessionOuverte])
def activite(request):
    return Response(services.reponse_session(request.user, None, prolonger(request.auth)))


@extend_schema(request=OBJ, responses=OBJ,
               summary="Changer de mot de passe {actuel, nouveau, confirmation} ; délivre un nouveau jeton")
@api_view(["POST"])
@permission_classes([PorteeChangementMotDePasse])
def mot_de_passe(request):
    jeton, s = services.changer_mot_de_passe(request.user, _texte(request, "actuel"), _texte(request, "nouveau"),
                                             _texte(request, "confirmation"))
    corps = services.reponse_session(s.compte, jeton, s)
    if getattr(s, "cle_secours", None):
        corps["cle_secours"] = s.cle_secours     # carnet du DRH installé : clé de secours, affichée une fois
    return Response(corps)


@extend_schema(request=OBJ, responses=OBJ,
               summary="Délégué : confirmer la région attribuée {region} ; la verrouille ; délivre un nouveau jeton")
@api_view(["POST"])
@permission_classes([PorteeConfirmationRegion])
def confirmer_region(request):
    jeton, s = services.confirmer_region(request.user, _texte(request, "region"))
    return Response(services.reponse_session(request.user, jeton, s))


# --- Administration des comptes par le DRH --------------------------------------------------------------------


@extend_schema(responses=OBJ, summary="DRH : comptes, état et dernière connexion")
@api_view(["GET"])
@permission_classes([EstDrh])
def comptes(request):
    return Response([services.compte_dict(c) for c in Compte.objects.all()])


@extend_schema(responses=OBJ, summary="DRH : historique des accès d'un compte (100 derniers événements)")
@api_view(["GET"])
@permission_classes([EstDrh])
def historique(request, identifiant):
    from django.http import Http404

    c = Compte.objects.filter(identifiant=identifiant).first()
    if c is None:
        raise Http404("Compte introuvable")
    return Response({"compte": services.compte_dict(c),
                     "evenements": [services.evenement_dict(e) for e in EvenementAcces.objects.filter(compte=c)[:100]]})


def _action_drh(nom, titre, faire):
    @extend_schema(request=None, responses=OBJ, summary=titre)
    @api_view(["POST"])
    @permission_classes([EstDrh])
    def vue(request, identifiant):
        c = services.delegue_administrable(request.user, identifiant)
        return Response(faire(request.user, c))
    vue.__name__ = nom
    return vue


suspendre = _action_drh("suspendre", "DRH : suspendre un délégué (ferme ses sessions)",
                        lambda drh, c: services.compte_dict(services.suspendre(drh, c)))
reactiver = _action_drh("reactiver", "DRH : réactiver un délégué suspendu",
                        lambda drh, c: services.compte_dict(services.reactiver(drh, c)))
reinitialiser = _action_drh(
    "reinitialiser", "DRH : poser un mot de passe temporaire (renvoyé une seule fois)",
    lambda drh, c: {"compte": services.compte_dict(c),
                    "mot_de_passe_temporaire": services.reinitialiser_mot_de_passe(drh, c)})
fermer_sessions = _action_drh("fermer_sessions", "DRH : fermer les sessions ouvertes d'un délégué",
                              lambda drh, c: {"sessions_fermees": services.fermer_sessions_de(drh, c)})


# --- Carnet des codes des délégués (poste du DRH) -------------------------------------------------------------


@extend_schema(responses=OBJ, summary="DRH : codes des délégués disponibles et remis, par région (sans les codes)")
@api_view(["GET"])
@permission_classes([EstDrh])
def codes(request):
    from . import coffre
    return Response(coffre.synthese())


@extend_schema(request={"multipart/form-data": OBJ}, responses=OBJ,
               summary="DRH : importer le carnet signé {fichier, phrase, mot_de_passe} ; chiffré sur le poste")
@api_view(["POST"])
@permission_classes([EstDrh])
def carnet(request):
    from . import coffre
    up = request.FILES.get("fichier")
    if up is None:
        raise RefusMetier("Aucun fichier reçu", ["Champ multipart « fichier » manquant"])
    if up.size > TAILLE_MAX_ACTIVATION:
        raise RefusMetier("Carnet trop volumineux", code="activation_illisible")
    return Response(coffre.importer(request.user, up.read(), _texte(request, "phrase"),
                                    _texte(request, "mot_de_passe")), status=201)


@extend_schema(request=OBJ, responses=OBJ,
               summary="DRH : débloquer le carnet avec la clé de secours {cle_secours, mot_de_passe} ; la renouvelle")
@api_view(["POST"])
@permission_classes([EstDrh])
def carnet_secours(request):
    from . import coffre
    return Response(coffre.debloquer(request.user, _texte(request, "cle_secours"), _texte(request, "mot_de_passe")))


@extend_schema(request=OBJ, responses=OBJ,
               summary="DRH : remettre le prochain code d'une région {region, usage, mot_de_passe, remis_a}")
@api_view(["POST"])
@permission_classes([EstDrh])
def remettre_code(request):
    from . import coffre
    return Response(coffre.remettre(request.user, _texte(request, "region"), _texte(request, "usage"),
                                    _texte(request, "mot_de_passe"), _texte(request, "remis_a")))
