from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.perimetre import jeu_autorise, region_imposee
from contextes.audit.services import auteur_de
from contextes.commun.erreurs import RefusMetier
from contextes.commun.outils import reponse_paginee
from domaine.planification.parametres import hypotheses_par_defaut

from . import services as pl

OBJ = OpenApiTypes.OBJECT
PERIMETRE = [OpenApiParameter(n, str) for n in ("region", "departement", "commune", "iaeb", "sous_systeme",
                                                  "niveau", "scenario", "annee", "version")]
PAGE = [OpenApiParameter("page", int), OpenApiParameter("taille", int), OpenApiParameter("tri", str)]
SOUS_SYSTEMES = ("francophone", "anglophone", "non_renseigne")


def perimetre(request) -> dict:
    """Périmètre de planification ; pour un délégué, la région est toujours celle de son compte."""
    q = request.query_params
    p = {"region": region_imposee(request) or q.get("region", "").strip(),
         "departement": q.get("departement", "").strip(), "commune": q.get("commune", "").strip(),
         "iaeb": q.get("iaeb", "").strip(), "sous_systeme": (q.get("sous_systeme") or "").strip()}
    if p["sous_systeme"] and p["sous_systeme"] not in SOUS_SYSTEMES:
        raise RefusMetier("Sous-système inconnu", [f"Valeurs possibles : {', '.join(SOUS_SYSTEMES)}"])
    return {k: v for k, v in p.items() if v}


def _ctx(request, jeu):
    j = jeu_autorise(request, jeu, ecriture=False)
    return pl.contexte(j, request.query_params.get("scenario") or None)


def _version_demandee(request):
    v = request.query_params.get("version")
    if not v:
        return None
    if not v.isdigit():
        raise RefusMetier("Version invalide", ["Numéro de version entier attendu"])
    return int(v)


# --- Hypothèses ------------------------------------------------------------------------------------------------

@extend_schema(responses=OBJ, summary="Hypothèses par défaut (rapport DRH d'octobre 2026)")
@api_view(["GET"])
def hypotheses_defaut(request):
    return Response({**hypotheses_par_defaut(), "version": 1, "modifiees_le": None, "modifiees_par": pl.AUTEUR_INITIAL})


@extend_schema(methods=["GET"], responses=OBJ, summary="Hypothèses en vigueur")
@extend_schema(methods=["PUT"], request=OBJ, responses=OBJ,
               summary="Remplacer les hypothèses {…, motif, auteur} ; la version précédente est historisée")
@api_view(["GET", "PUT"])
def hypotheses(request, jeu):
    j = jeu_autorise(request, jeu)
    if request.method == "GET":
        return Response(pl.hypotheses_dict(j))
    d = request.data if isinstance(request.data, dict) else {}
    corps = {k: v for k, v in d.items() if k not in ("motif", "auteur", "version", "modifiees_le", "modifiees_par")}
    return Response(pl.modifier_hypotheses(j, corps, motif=str(d.get("motif") or ""),
                                           auteur=auteur_de(request, d.get("auteur")), request=request))


@extend_schema(responses=OBJ, summary="Fiche lisible des hypothèses en vigueur")
@api_view(["GET"])
def documentation(request, jeu):
    return Response(pl.documentation(jeu_autorise(request, jeu)))


@extend_schema(responses=OBJ, summary="Versions historisées des hypothèses (la plus récente d'abord)")
@api_view(["GET"])
def historique_hypotheses(request, jeu):
    return Response(pl.historique_hypotheses(jeu_autorise(request, jeu)))


@extend_schema(request=None, responses=OBJ, summary="Estimer un taux d'attrition d'après les actualisations (non enregistré)")
@api_view(["POST"])
def estimer_attrition(request, jeu):
    return Response(pl.estimer_attrition(jeu_autorise(request, jeu, ecriture=False)))


# --- Tableau et ventilations ------------------------------------------------------------------------------------

@extend_schema(parameters=PERIMETRE, responses=OBJ, summary="Tableau N+1 → N+5 du périmètre et fiabilité")
@api_view(["GET"])
def tableau(request, jeu):
    j = jeu_autorise(request, jeu, ecriture=False)
    p = perimetre(request)
    numero = _version_demandee(request)
    if numero is not None:
        etat = pl.etat(j)
        if numero != etat.version:
            return Response(pl.version(j, numero, p)["tableau"])
    return Response(pl.tableau(pl.contexte(j, request.query_params.get("scenario") or None), p))


@extend_schema(parameters=PERIMETRE, responses=OBJ, summary="Tableau ventilé par territoire enfant (ou ?niveau=)")
@api_view(["GET"])
def territoires(request, jeu):
    return Response(pl.ventilation_territoriale(_ctx(request, jeu), perimetre(request),
                                                request.query_params.get("niveau", "")))


@extend_schema(parameters=PERIMETRE, responses=OBJ, summary="Tableau ventilé par sous-système")
@api_view(["GET"])
def sous_systemes(request, jeu):
    return Response(pl.ventilation_sous_systemes(_ctx(request, jeu), perimetre(request)))


@extend_schema(parameters=PERIMETRE + PAGE, responses=OBJ, summary="Projection école par école")
@api_view(["GET"])
def ecoles(request, jeu):
    return Response(reponse_paginee(request, pl.lignes_ecoles(_ctx(request, jeu), perimetre(request))))


@extend_schema(parameters=PERIMETRE, responses=OBJ, summary="Retraites nominatives et attrition par sous-système")
@api_view(["GET"])
def departs(request, jeu):
    return Response(pl.plan_departs(_ctx(request, jeu), perimetre(request)))


@extend_schema(parameters=PERIMETRE, responses=OBJ, summary="Disponibilité des données des projections")
@api_view(["GET"])
def fiabilite(request, jeu):
    return Response(pl.fiabilite(_ctx(request, jeu), perimetre(request)))


RAPPORT = PERIMETRE + [OpenApiParameter("horizon", int), OpenApiParameter("seuil_cohorte", float)]


@extend_schema(parameters=RAPPORT, responses=OBJ,
               summary="Tableaux du rapport DRH : national, retraites, scénarios, redéploiement, priorités, limites")
@api_view(["GET"])
def rapport(request, jeu):
    q = request.query_params
    return Response(pl.rapport(_ctx(request, jeu), perimetre(request), q.get("horizon") or 3,
                               q.get("seuil_cohorte") or 5))


@extend_schema(parameters=RAPPORT, responses=OBJ,
               summary="Listes du volet redéploiement : écoles (C1, C3) et cohorte « au moins N ans au poste »")
@api_view(["GET"])
def rapport_listes(request, jeu):
    return Response(pl.listes_rapport(_ctx(request, jeu), perimetre(request),
                                      request.query_params.get("seuil_cohorte") or 5))


# --- État et versions -----------------------------------------------------------------------------------------

@extend_schema(responses=OBJ, summary="État du dernier calcul")
@api_view(["GET"])
def etat(request, jeu):
    j = jeu_autorise(request, jeu, ecriture=False)
    return Response(pl.etat_dict(j, pl.etat(j)))


@extend_schema(request=None, responses=OBJ, summary="Recalcul : nouvelle version conservée")
@api_view(["POST"])
def recalculer(request, jeu):
    j = jeu_autorise(request, jeu)
    return Response(pl.recalculer(j, request=request, auteur=auteur_de(request)))


@extend_schema(responses=OBJ, summary="Versions conservées, la plus récente d'abord")
@api_view(["GET"])
def versions(request, jeu):
    return Response(pl.versions(jeu_autorise(request, jeu, ecriture=False)))


@extend_schema(parameters=[OpenApiParameter("region", str)], responses=OBJ,
               summary="Version conservée : tableau du national (ou d'une région)")
@api_view(["GET"])
def version(request, jeu, numero):
    return Response(pl.version(jeu_autorise(request, jeu, ecriture=False), numero, perimetre(request)))


@extend_schema(parameters=[OpenApiParameter("de", int), OpenApiParameter("a", int), OpenApiParameter("region", str)],
               responses=OBJ, summary="Écarts entre deux versions, indicateur par indicateur")
@api_view(["GET"])
def comparer(request, jeu):
    q = request.query_params
    if not (q.get("de", "").isdigit() and q.get("a", "").isdigit()):
        raise RefusMetier("Versions à comparer manquantes", ["Paramètres « de » et « a » (numéros) attendus"])
    return Response(pl.comparer(jeu_autorise(request, jeu, ecriture=False), int(q["de"]), int(q["a"]),
                                perimetre(request)))


# --- Quotas -----------------------------------------------------------------------------------------------------

@extend_schema(parameters=PERIMETRE, responses=OBJ, summary="Quotas par région, sous-système et année")
@api_view(["GET"])
def quotas(request, jeu):
    ctx = _ctx(request, jeu)
    p = perimetre(request)
    return Response(pl.quotas(ctx, annee=request.query_params.get("annee", ""), region=p.get("region", ""),
                              sous_systeme=p.get("sous_systeme", "")))


@extend_schema(request=OBJ, responses=OBJ, summary="Ajuster un quota {sous_systeme, retenu, motif, auteur}")
@api_view(["PUT"])
def quota(request, jeu, annee, territoire):
    j = jeu_autorise(request, jeu)
    d = request.data if isinstance(request.data, dict) else {}
    pl.contexte(j)   # quotas à jour avant l'ajustement
    return Response(pl.ajuster_quota(j, annee, territoire, d, request=request, auteur=auteur_de(request, d.get("auteur"))))


@extend_schema(request=OBJ, responses=OBJ, summary="Valider (figer) les quotas d'une année {annee, auteur}")
@api_view(["POST"])
def valider_quotas(request, jeu):
    j = jeu_autorise(request, jeu)
    d = request.data if isinstance(request.data, dict) else {}
    pl.contexte(j)
    return Response(pl.valider_quotas(j, str(d.get("annee") or ""), request=request,
                                      auteur=auteur_de(request, d.get("auteur"))))


@extend_schema(parameters=[OpenApiParameter("annee", str)], responses=OBJ, summary="Historique des quotas")
@api_view(["GET"])
def historique_quotas(request, jeu):
    j = jeu_autorise(request, jeu, ecriture=False)
    return Response(pl.historique_quotas(j, request.query_params.get("annee", ""), region_imposee(request) or ""))


# --- Indicateurs de suivi ---------------------------------------------------------------------------------------

@extend_schema(parameters=PERIMETRE, responses=OBJ, summary="Indicateurs de suivi du périmètre (N+1)")
@api_view(["GET"])
def indicateurs(request, jeu):
    return Response(pl.indicateurs(_ctx(request, jeu), perimetre(request)))


@extend_schema(parameters=PERIMETRE, responses=OBJ, summary="Évolution des indicateurs de version en version")
@api_view(["GET"])
def evolution(request, jeu):
    return Response(pl.evolution(_ctx(request, jeu), perimetre(request)))

