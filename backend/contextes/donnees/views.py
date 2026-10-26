from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.perimetre import jeu_autorise, jeux_visibles
from contextes.commun.erreurs import RefusMetier
from contextes.commun.outils import entier_param, perimetre_depuis, reponse_paginee
from domaine.commun.texte import norm
from domaine.diagnostic.territoires import filtrer_lignes
from domaine.donnees import colonnes as C
from domaine.donnees.recherche import rapprocher
from domaine.mobilite.bareme import detail_bareme
from domaine.prince.faits import diagnostiquer_eligibilite
from contextes.commun.serializers import CreationJeuSerializer, EnvoiFichierSerializer

from . import services
from .models import FichierImporte

GEO = [OpenApiParameter(n, str) for n in ("region", "departement", "commune")]
PAGE = [OpenApiParameter("page", int), OpenApiParameter("taille", int), OpenApiParameter("tri", str)]


def _fichier_dict(f: FichierImporte) -> dict:
    return {"id": str(f.id), "type": f.type, "nom_fichier": f.nom_fichier, "feuille": f.feuille,
            "feuilles": f.feuilles, "entetes": f.entetes, "apercu": f.apercu, "correspondance": f.correspondance,
            "colonnes_a_confirmer": f.a_confirmer, "nb_lignes": len(f.lignes),
            "base_nationale": f.base_nationale}


def _journal_creation(request, jeu, resume: str) -> None:
    from contextes.audit.services import journaliser
    journaliser(jeu, "import", "création", resume, request=request, objet=("jeu", jeu.id),
                apres={"etablissements": jeu.etablissements.count(), "enseignants": jeu.enseignants.count()})


def _oui(valeur) -> bool:
    """Booléen d'un champ de formulaire multipart (« true », « 1 », « oui »…) ou JSON."""
    if isinstance(valeur, bool):
        return valeur
    return str(valeur or "").strip().lower() in ("1", "true", "oui", "yes")


@extend_schema(request=EnvoiFichierSerializer, responses=OpenApiTypes.OBJECT,
               summary="Envoi d'un classeur (type, fichier, feuille, base_nationale) : fichier de la région du "
                       "délégué, ou de la base nationale (toutes régions)")
@api_view(["POST"])
def fichiers(request):
    upload = request.FILES.get("fichier")
    if upload is None:
        raise RefusMetier("Aucun fichier reçu", ["Champ multipart « fichier » manquant"])
    f = services.recevoir_fichier(request.data.get("type", ""), upload, request.data.get("feuille") or None,
                                  compte=request.user, base_nationale=_oui(request.data.get("base_nationale")))
    return Response(_fichier_dict(f), status=201)


@extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT,
               summary="Corriger la correspondance des colonnes {colonne_attendue: en-tête source}")
@api_view(["PATCH"])
def fichier_correspondances(request, fichier):
    f = services.fichier_du_compte(request.user, fichier)
    corps = request.data.get("correspondance", request.data)
    if not isinstance(corps, dict):
        raise RefusMetier("Le corps doit être un objet {colonne: en-tête}")
    return Response(_fichier_dict(services.corriger_correspondance(f, dict(corps), compte=request.user)))


@extend_schema(methods=["POST"], request=CreationJeuSerializer, responses=OpenApiTypes.OBJECT,
               summary="Créer un jeu depuis deux fichiers envoyés (délégué : jeu de sa région ; DRH : jeu national), "
                       "calculer les scénarios de base")
@extend_schema(methods=["GET"], responses=OpenApiTypes.OBJECT, summary="Jeux visibles par le compte connecté")
@api_view(["GET", "POST"])
def jeux(request):
    if request.method == "GET":
        return Response([services.resume_jeu(j) for j in jeux_visibles(request.user).select_related("cree_par")])
    d = request.data
    ide, idn = d.get("fichier_etablissements"), d.get("fichier_enseignants")
    if not ide or not idn:
        raise RefusMetier("Fichiers manquants", ["fichier_etablissements et fichier_enseignants sont requis"])
    # Fichier des faits du Prince (facultatif) : vérifié avant la création, appliqué avant le premier calcul.
    f_prince, lignes_prince = None, []
    if d.get("fichier_prince"):
        from contextes.prince.services import code_requis_ok
        if not code_requis_ok(request):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Code d'accès Effet de Prince manquant ou invalide")
        f_prince, lignes_prince = services.preparer_fichier_prince(request.user, d["fichier_prince"])
    jeu = services.creer_jeu(d.get("nom", ""), ide, idn, compte=request.user, fichier_prince=f_prince,
                             annee_scolaire=d.get("annee_scolaire"), sens_annee_scolaire=d.get("sens_annee_scolaire"),
                             donnees_fictives=_oui(d.get("donnees_fictives")))
    bilan_prince = None
    if f_prince is not None:
        from contextes.audit.services import decision
        from contextes.prince.services import importer as importer_faits_prince
        bilan_prince = importer_faits_prince(jeu, lignes_prince)
        decision(jeu, "fait_prince", "import", f"Import de faits du Prince ({f_prince.nom_fichier})", request=request,
                 declencheur="Import de faits du Prince", objet=("fait_prince", "import"), apres=bilan_prince)
    from contextes.simulation.services import creer_scenarios_base
    creer_scenarios_base(jeu)
    _journal_creation(request, jeu, "Import des fichiers de la région" if request.user.est_delegue
                      else "Import de la base nationale")
    return Response({**services.resume_jeu(jeu), "qualite": jeu.rapport_qualite.contenu,
                     **({"prince": bilan_prince} if bilan_prince is not None else {})}, status=201)


@extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT,
               summary="Jeu de démonstration (régional pour un délégué, national pour le DRH)")
@api_view(["POST"])
def jeu_demonstration(request):
    d = request.data if isinstance(request.data, dict) else {}
    jeu = services.creer_demonstration(d.get("nom", ""), entier_param(d.get("graine"), "graine", defaut=2026),
                                       entier_param(d.get("nb_ecoles"), "nb_ecoles", defaut=60, minimum=1,
                                                    maximum=30000),
                                       entier_param(d.get("nb_enseignants"), "nb_enseignants", defaut=420, minimum=1,
                                                    maximum=100000), compte=request.user,
                                       annee_scolaire=d.get("annee_scolaire"),
                                       sens_annee_scolaire=d.get("sens_annee_scolaire"))
    from contextes.simulation.services import creer_scenarios_base
    creer_scenarios_base(jeu)
    _journal_creation(request, jeu, "Ouverture du jeu de démonstration")
    return Response(services.resume_jeu(jeu), status=201)


@extend_schema(methods=["GET"], responses=OpenApiTypes.OBJECT, summary="Détail d'un jeu")
@extend_schema(methods=["DELETE"], responses=None, summary="« Effacer les données » (cascade)")
@extend_schema(methods=["PATCH"], request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT,
               summary="Sens de l'année scolaire (donnees | rentree_preparee | non_confirme) et données fictives")
@api_view(["GET", "PATCH", "DELETE"])
def jeu_detail(request, jeu):
    j = jeu_autorise(request, jeu)
    if request.method == "PATCH":
        return Response(services.modifier_jeu(j, request.data if isinstance(request.data, dict) else {},
                                              request=request))
    if request.method == "DELETE":
        from contextes.diagnostic.services import invalider_cache
        invalider_cache(j)
        j.delete()
        return Response(status=204)
    return Response(services.resume_jeu(j))


@extend_schema(responses=OpenApiTypes.OBJECT, summary="Rapport de qualité des données")
@api_view(["GET"])
def qualite(request, jeu):
    return Response(jeu_autorise(request, jeu).rapport_qualite.contenu)


@extend_schema(parameters=GEO + PAGE + [OpenApiParameter(n, str) for n in ("zone", "securite", "sous_systeme", "q")],
               responses=OpenApiTypes.OBJECT, summary="Établissements (filtrés, paginés)")
@api_view(["GET"])
def etablissements(request, jeu):
    from contextes.diagnostic import services as diag
    from domaine.diagnostic.synthese import filtrer_ecoles
    q = request.query_params
    lignes = filtrer_ecoles(diag.ecoles_enrichies(jeu_autorise(request, jeu)),
                            perimetre=perimetre_depuis(request), zone=q.get("zone", ""),
                            securite=q.get("securite", ""), sous_systeme=q.get("sous_systeme", ""),
                            type_etab=q.get("type", ""), seulement=q.get("seulement", ""), q=q.get("q", ""))
    return Response(reponse_paginee(request, lignes, C.COL_ETAB_ID))


@extend_schema(responses=OpenApiTypes.OBJECT, summary="Fiche école avec diagnostic détaillé")
@api_view(["GET"])
def etablissement_detail(request, jeu, ident):
    from contextes.diagnostic import services as diag
    from domaine.diagnostic.synthese import raisons_priorite
    j = jeu_autorise(request, jeu)
    ecole = next((e for e in diag.ecoles_enrichies(j) if e[C.COL_ETAB_ID] == ident), None)
    if ecole is None:
        from django.http import Http404
        raise Http404("École introuvable")
    prep = diag.preparer(j)
    fournisseurs = [e.matricule for e in prep.vivier if e.ecole_attache == ident]
    return Response({
        "ecole": ecole, "raisons_priorite": raisons_priorite(ecole),
        "diagnostic": {"dotation_theorique": ecole["De"], "capacite_physique": ecole["BMAX"],
                       "capacite_effective": ecole["Ke"], "besoin_ouvert": ecole["be"],
                       "excedent_mobilisable": ecole["xe"], "salles_manquantes": ecole["se"],
                       "poids_poste": ecole["Up"], "vulnerabilite": ecole["Wp"],
                       "niveau_difficulte": ecole["niveau_difficulte"]},
        "enseignants_en_poste": [e.matricule for e in prep.enseignants.values() if e.ecole_attache == ident],
        "enseignants_du_vivier": fournisseurs,
    })


@extend_schema(parameters=GEO + PAGE + [OpenApiParameter("sous_systeme", str), OpenApiParameter("q", str),
                                        OpenApiParameter("dans_vivier", bool), OpenApiParameter("ecole", str)],
               responses=OpenApiTypes.OBJECT, summary="Enseignants (filtrés, paginés)")
@api_view(["GET"])
def enseignants(request, jeu):
    from contextes.diagnostic import services as diag
    j = jeu_autorise(request, jeu)
    q = request.query_params
    lignes = filtrer_lignes(diag.lignes_enseignants(diag.preparer(j)), perimetre_depuis(request),
                            "region_attache", "departement_attache",
                            "commune_attache")
    if q.get("sous_systeme"):
        lignes = [l for l in lignes if norm(l[C.COL_ENS_SS]) == norm(q["sous_systeme"])]
    if q.get("ecole"):
        lignes = [l for l in lignes if l[C.COL_ENS_ETAB] == q["ecole"]]
    if q.get("dans_vivier") is not None:
        voulu = q["dans_vivier"].lower() in ("1", "true", "oui")
        lignes = [l for l in lignes if l["dans_vivier"] == voulu]
    if q.get("q"):
        k = norm(q["q"])
        lignes = [l for l in lignes if k in norm(l[C.COL_ENS_ID]) or k in norm(l["nom"]) or k in norm(l["prenom"])]
    return Response(reponse_paginee(request, lignes, "-bareme"))


@extend_schema(responses=OpenApiTypes.OBJECT, summary="Barème détaillé, éligibilité, raison de non-mobilité")
@api_view(["GET"])
def enseignant_detail(request, jeu, matricule):
    from django.http import Http404
    from contextes.diagnostic import services as diag
    j = jeu_autorise(request, jeu)
    prep = diag.preparer(j)
    e = prep.enseignants.get(matricule)
    if e is None:
        raise Http404("Enseignant introuvable")
    ids_vivier = {x.matricule for x in prep.vivier}
    elig = diagnostiquer_eligibilite(e, prep.ecoles_par_id, prep.cfg, ids_vivier)
    if matricule in prep.exclus:
        elig = {"eligible": False, "code": "EXCLU", "raison": prep.exclus[matricule]}
    elif prep.application is not None and matricule in prep.application.deplaces:
        elig = {"eligible": False, "code": "FAIT_PRINCE",
                "raison": "Déplacé par un fait du Prince : exclu de la mobilité ordinaire"}
    rang = next((i + 1 for i, x in enumerate(prep.vivier) if x.matricule == matricule), None)
    return Response({"enseignant": e.vers_dict(), "bareme": detail_bareme(e, prep.cfg), "eligibilite": elig,
                     "rang_dans_vivier": rang, "taille_vivier": len(prep.vivier)})


def _recherche(request, jeu, cible):
    from contextes.diagnostic import services as diag
    j = jeu_autorise(request, jeu)
    q = request.query_params.get("q", "")
    lim = entier_param(request.query_params.get("limite"), "limite", defaut=10, minimum=1, maximum=200)
    items, cles = diag.index_recherche(diag.preparer(j), cible)
    return Response({"q": q, "resultats": rapprocher(q, items, cles=cles, limite=lim)})


@extend_schema(parameters=[OpenApiParameter("q", str), OpenApiParameter("limite", int)],
               responses=OpenApiTypes.OBJECT, summary="Rapprochement de saisie : enseignants")
@api_view(["GET"])
def recherche_enseignants(request, jeu):
    return _recherche(request, jeu, "enseignants")


@extend_schema(parameters=[OpenApiParameter("q", str), OpenApiParameter("limite", int)],
               responses=OpenApiTypes.OBJECT, summary="Rapprochement de saisie : établissements")
@api_view(["GET"])
def recherche_etablissements(request, jeu):
    return _recherche(request, jeu, "etablissements")


# --- Validation et actualisation ------------------------------------------------------------------------------

@extend_schema(methods=["GET"], responses=OpenApiTypes.OBJECT, summary="État de validation du jeu et contrôles")
@extend_schema(methods=["POST"], request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT,
               summary="Valider le jeu comme référence des projections {auteur} ; 422 si un contrôle bloquant échoue")
@api_view(["GET", "POST"])
def validation(request, jeu):
    from contextes.audit.services import auteur_de
    j = jeu_autorise(request, jeu)
    if request.method == "GET":
        return Response(services.validation(j))
    d = request.data if isinstance(request.data, dict) else {}
    return Response(services.valider(j, request=request, auteur=auteur_de(request, d.get("auteur")),
                                     reserve=d.get("reserve")))


@extend_schema(methods=["GET"], responses=OpenApiTypes.OBJECT, summary="Actualisations du jeu, la plus récente d'abord")
@extend_schema(methods=["POST"], request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT,
               summary="Délégué : remplacer les données par deux fichiers envoyés {etablissements, enseignants, auteur}")
@api_view(["GET", "POST"])
def actualisations(request, jeu):
    from contextes.audit.services import auteur_de
    j = jeu_autorise(request, jeu)
    if request.method == "GET":
        return Response([services.resume_actualisation(a) for a in j.actualisations.all()])
    d = request.data if isinstance(request.data, dict) else {}
    ide, idn = d.get("etablissements"), d.get("enseignants")
    if not ide or not idn:
        raise RefusMetier("Fichiers manquants", ["etablissements et enseignants (identifiants de fichiers) sont requis"])
    act = services.actualiser(j, ide, idn, compte=request.user, request=request,
                              auteur=auteur_de(request, d.get("auteur")))
    return Response(services.resume_actualisation(act), status=201)


@extend_schema(responses=OpenApiTypes.OBJECT, summary="Écarts introduits par une actualisation")
@api_view(["GET"])
def ecarts_actualisation(request, jeu, actualisation):
    from django.http import Http404
    j = jeu_autorise(request, jeu)
    a = j.actualisations.filter(pk=actualisation).first()
    if a is None:
        raise Http404("Cette actualisation n'existe pas")
    e = a.ecarts
    return Response({k: e.get(k, []) for k in ("arrivees", "departs", "changements_ecole", "decisions_invalidees")})
