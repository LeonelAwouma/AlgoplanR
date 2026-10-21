from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from contextes.acces.perimetre import jeu_autorise
from contextes.commun.erreurs import RefusMetier
from contextes.commun.outils import SansNegociation, entier_param, perimetre_depuis, reponse_docx, reponse_excel
from contextes.planification.views import perimetre as perimetre_planification
from contextes.simulation import services as sim
from domaine.diagnostic.territoires import restreindre_resultat
from domaine.rapport.rapport import construire_rapport
from domaine.rapport.territorial import REGISTRE_INDICATEURS

from . import export_docx as docx_rt
from . import export_xlsx as xlsx_rt
from . import rapport_territorial as rt


@extend_schema(parameters=[OpenApiParameter("scenario", int), OpenApiParameter("region", str),
                           OpenApiParameter("departement", str), OpenApiParameter("commune", str)],
               responses=OpenApiTypes.OBJECT, summary="Rapport de décision (JSON)")
@api_view(["GET"])
def rapport(request, jeu):
    j = jeu_autorise(request, jeu)
    sid = request.query_params.get("scenario")
    sc = sim.scenario_du_jeu(j, entier_param(sid, "scenario")) if sid else sim.scenario_par_defaut(j)
    r = restreindre_resultat(sim.charger_resultat(sc), perimetre_depuis(request))
    return Response(construire_rapport(
        r, jeu={"id": str(j.id), "nom": j.nom, "statut": j.statut, "valide_par": j.valide_par or None,
                "valide_le": j.valide_le.isoformat(timespec="seconds") if j.valide_le else None,
                "reserve_drh": j.validation_reserve}, scenario=sim.resume_scenario(sc),
        faits_prince=sim.faits_prince_actifs(j), arbitrages=sim.arbitrages_jeu(j),
        genere_le=timezone.now().isoformat(timespec="seconds")))


@extend_schema(parameters=[OpenApiParameter("scenario", int), OpenApiParameter("region", str),
                           OpenApiParameter("departement", str), OpenApiParameter("commune", str),
                           OpenApiParameter("iaeb", str), OpenApiParameter("sous_systeme", str),
                           OpenApiParameter("niveau", str, description="Niveau des enfants : region | departement "
                                            "| commune (= arrondissement) | ecole | iaeb")],
               responses=OpenApiTypes.OBJECT,
               summary="Synthèse territoriale (taux d'encadrement, couverture des besoins, couverture PAREC, "
                       "attrition M1, degré d'aléa) — source unique pour le tableau de bord et les exports")
@api_view(["GET"])
def rapport_territorial(request, jeu):
    j = jeu_autorise(request, jeu, ecriture=False)
    p = perimetre_planification(request)
    niveau_demande = (request.query_params.get("niveau") or "").strip()
    return Response(rt.construire(j, p, scenario_id=request.query_params.get("scenario") or None,
                                  niveau_demande=niveau_demande))


FORMATS_EXPORT = ("xlsx", "docx")
TYPES_EXPORT = ("perimetre", "national_complet")
CODES_INDICATEURS = {d["code"] for d in REGISTRE_INDICATEURS}
NIVEAUX_ENFANTS = ("region", "departement", "commune", "ecole", "iaeb")
ANNEES_EXPORT = tuple(f"n{k}" for k in range(1, 6))


@extend_schema(parameters=[OpenApiParameter("format", str), OpenApiParameter("type", str),
                           OpenApiParameter("indicateur", str), OpenApiParameter("scenario", int),
                           OpenApiParameter("region", str), OpenApiParameter("departement", str),
                           OpenApiParameter("commune", str),
                           OpenApiParameter("niveau", str, description="Ventilation : region | departement | commune "
                                            "(= arrondissement) | ecole | iaeb ; par défaut le niveau inférieur"),
                           OpenApiParameter("annee", str, description="n1 à n5 : une seule année de projection")],
               responses={(200, "application/octet-stream"): OpenApiTypes.BINARY},
               summary="Export Excel ou Word de la synthèse territoriale (respecte le périmètre demandé ; "
                       "type=national_complet, réservé au DRH, est exhaustif : national, régions, tous les "
                       "départements, tous les arrondissements et le détail de tous les établissements en xlsx "
                       "(synthétique jusqu'aux arrondissements en docx)")
@api_view(["GET"])
def rapport_territorial_export(request, jeu):
    j = jeu_autorise(request, jeu, ecriture=False)
    q = request.query_params
    format_ = (q.get("format") or "").strip().lower()
    if format_ not in FORMATS_EXPORT:
        raise RefusMetier("Format d'export invalide", [f"« format » doit valoir {' ou '.join(FORMATS_EXPORT)}"],
                          code="parametre_invalide")
    type_ = (q.get("type") or "perimetre").strip().lower()
    if type_ not in TYPES_EXPORT:
        raise RefusMetier("Type d'export invalide", [f"« type » doit valoir {' ou '.join(TYPES_EXPORT)}"],
                          code="parametre_invalide")
    indicateur = (q.get("indicateur") or "").strip() or None
    if indicateur and indicateur not in CODES_INDICATEURS:
        raise RefusMetier("Indicateur inconnu", [f"« indicateur » doit valoir l'un de {sorted(CODES_INDICATEURS)}"],
                          code="parametre_invalide")
    scenario_id = q.get("scenario") or None
    niveau = (q.get("niveau") or "").strip().lower()
    if niveau and niveau not in NIVEAUX_ENFANTS:
        raise RefusMetier("Niveau invalide", [f"« niveau » doit valoir l'un de {list(NIVEAUX_ENFANTS)}"],
                          code="parametre_invalide")
    annee = (q.get("annee") or "").strip().lower() or None
    if annee and annee not in ANNEES_EXPORT:
        raise RefusMetier("Année invalide", [f"« annee » doit valoir l'un de {list(ANNEES_EXPORT)}"],
                          code="parametre_invalide")

    if type_ == "national_complet":
        if not request.user.est_drh:
            raise PermissionDenied("L'export national complet est réservé au DRH.", code="reserve_drh")
        complet = rt.construire_national_complet(j, scenario_id=scenario_id, indicateur=indicateur)
        nom = f"rapport-national-complet-{j.id}.{format_}"
        if format_ == "xlsx":
            octets = xlsx_rt.classeur_national_complet(complet)
            return reponse_excel(octets, nom)
        octets = docx_rt.document_national_complet(complet, jeu_nom=j.nom, scenario_id=scenario_id or "")
        return reponse_docx(octets, nom)

    p = perimetre_planification(request)
    rapport = rt.construire(j, p, scenario_id=scenario_id, niveau_demande=niveau)
    tableaux = rt.tableaux_pour_export(rapport, indicateur=indicateur, annee=annee)
    slug = rapport["titre"].lower().replace(" ", "-").replace(">", "-").strip("-") or "cameroun"
    nom = f"rapport-territorial-{slug}.{format_}"
    if format_ == "xlsx":
        return reponse_excel(xlsx_rt.classeur_perimetre(rapport, tableaux), nom)
    return reponse_docx(docx_rt.document_perimetre(rapport, tableaux, jeu_nom=j.nom), nom)


rapport_territorial_export.cls.content_negotiation_class = SansNegociation
