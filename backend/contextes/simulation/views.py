from django.http import Http404, HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response

from contextes.acces.perimetre import jeu_autorise
from contextes.commun.erreurs import RefusMetier
from contextes.commun.outils import entier_param, perimetre_depuis, reponse_paginee
from contextes.donnees import depots
from contextes.donnees.services import exiger_nominatif
from contextes.donnees.lecteur import ecrire_excel
from contextes.planification import services as pl
from domaine.donnees import colonnes as C
from domaine.diagnostic.territoires import restreindre_resultat
from domaine.mobilite import analyses as an
from domaine.mobilite.scenarios import comparer
from rest_framework.negotiation import BaseContentNegotiation
from rest_framework.decorators import api_view

from . import services as sim

GEO = [OpenApiParameter(n, str) for n in ("region", "departement", "commune")]
PAGE = [OpenApiParameter("page", int), OpenApiParameter("taille", int), OpenApiParameter("tri", str)]
OBJ = OpenApiTypes.OBJECT


FONCTION_MOBILITE = "Simulation de mobilité des enseignants"


def _ctx(request, jeu, sid, *, nominatif=True):
    """Jeu, scénario et résultat restreint au périmètre. Par défaut la fonction exige des agents identifiés : un jeu
    sans fichier nominatif la refuse explicitement plutôt que d'afficher un résultat vide qui passerait pour réel."""
    j = jeu_autorise(request, jeu)
    if nominatif:
        exiger_nominatif(j, FONCTION_MOBILITE)
    sc = sim.scenario_du_jeu(j, sid)
    return j, sc, restreindre_resultat(sim.charger_resultat(sc), perimetre_depuis(request))


@extend_schema(request=None, responses=OBJ, summary="Calcule (ou recalcule) les 3 scénarios géographiques de base")
@extend_schema(methods=["POST"], request=OBJ, responses=OBJ,
               summary="Créer un scénario {code | nom, parametres} puis le calculer")
@api_view(["GET", "POST"])
def scenarios(request, jeu):
    j = jeu_autorise(request, jeu)
    if request.method == "GET":
        return Response([sim.resume_scenario(s) for s in j.scenarios.all()])
    exiger_nominatif(j, FONCTION_MOBILITE)
    d = request.data
    if not isinstance(d.get("parametres") or {}, dict):
        raise RefusMetier("Paramètres invalides", ["« parametres » doit être un objet"])
    sc = sim.creer_scenario(j, code=d.get("code", ""), nom=d.get("nom", ""), description=d.get("description", ""),
                            parametres=d.get("parametres") or {})
    return Response(sim.resume_scenario(sc), status=201)


@extend_schema(request=None, responses=OBJ, summary="Calcule (ou recalcule) les 3 scénarios géographiques de base")
@api_view(["POST"])
def scenarios_base(request, jeu):
    j = jeu_autorise(request, jeu)
    return Response([sim.resume_scenario(s) for s in sim.creer_scenarios_base(j)], status=201)


@extend_schema(methods=["GET"], responses=OBJ)
@extend_schema(methods=["DELETE"], responses=None)
@api_view(["GET", "DELETE"])
def scenario_detail(request, jeu, sid):
    j = jeu_autorise(request, jeu)
    sc = sim.scenario_du_jeu(j, sid)
    if request.method == "DELETE":
        sc.delete()
        return Response(status=204)
    return Response({**sim.resume_scenario(sc), "configuration": sim.config_resultat(sc)})


@extend_schema(request=None, responses=OBJ, summary="Relance du calcul")
@api_view(["POST"])
def executer(request, jeu, sid):
    j = jeu_autorise(request, jeu)
    exiger_nominatif(j, FONCTION_MOBILITE)
    sc = sim.scenario_du_jeu(j, sid)
    sim.calculer(sc)
    return Response(sim.resume_scenario(sc))


@extend_schema(parameters=GEO, responses=OBJ, summary="Résultat complet restreint au territoire (synthèse + listes)")
@api_view(["GET"])
def resultat(request, jeu, sid):
    j, sc, r = _ctx(request, jeu, sid, nominatif=False)
    return Response({"scenario": sim.resume_scenario(sc), "perimetre": r["perimetre"], "synthese": r["synthese"],
                     "nominatif_disponible": j.nominatif_disponible,
                     "nb": {k: len(r[k]) for k in ("affectations", "non_affectes", "postes_non_pourvus", "vivier",
                                                  "ecoles_en_besoin", "projections_n3", "journal_audit")},
                     "synthese_sous_systeme": an.synthese_sous_systeme_avant_apres(r, pl.hypotheses_dict(j))})


def _liste(cle, titre, tri=None, filtre=None, *, nominatif=True):
    @extend_schema(parameters=GEO + PAGE, responses=OBJ, summary=titre)
    @api_view(["GET"])
    def vue(request, jeu, sid):
        _, sc, r = _ctx(request, jeu, sid, nominatif=nominatif)
        lignes = r[cle]
        if filtre:
            lignes = filtre(request, lignes)
        return Response({"scenario": sc.pk, "synthese": r["synthese"], **reponse_paginee(request, lignes, tri)})
    vue.__name__ = cle
    return vue


def _par_phase(request, l):
    ph = request.query_params.get("phase")
    return [a for a in l if a["phase"] == ph] if ph else l


affectations = _liste("affectations", "Propositions d'affectation (filtre ?phase=)", filtre=_par_phase)
non_affectes = _liste("non_affectes", "Enseignants non affectés", "-bareme")
vivier = _liste("vivier", "Vivier de redéploiement", "-bareme")
postes = _liste("postes_non_pourvus", "Postes ouverts non pourvus")
postes_non_couverts = _liste("postes_non_pourvus", "Postes non couverts (regroupés dans `groupes` ci-dessous)")
postes_rouge = _liste("postes_rouge_non_pourvus", "Postes non pourvus en zone rouge")
ecoles_besoin = _liste("ecoles_en_besoin", "Écoles en besoin", "-Up", nominatif=False)
ecoles_fournisseurs = _liste("ecoles_fournisseurs", "Écoles fournissant le vivier", "-nb_enseignants_vivier")
journal = _liste("journal_audit", "Journal des tours de l'appariement")
# OBSOLÈTE : projection N à N+3 du moteur d'affectation (domaine/mobilite/projection.py), à taux d'attrition fixe de 2 %.
# Aucun écran ni rapport ne la lit plus ; les projections font foi dans la planification (jeux/{jeu}/planification/).
projections = _liste("projections_n3", "OBSOLÈTE — projections N à N+3 du moteur (attrition fixe) ; voir planification/")


@extend_schema(parameters=GEO, responses=OBJ, summary="Postes non couverts regroupés par sous-système, région, département")
@api_view(["GET"])
def postes_non_couverts_groupes(request, jeu, sid):
    _, sc, r = _ctx(request, jeu, sid)
    groupes = {}
    for p in r["postes_non_pourvus"]:
        k = (p.get(C.COL_ETAB_SS), p.get(C.COL_ETAB_REGION), p.get(C.COL_ETAB_DEPT))
        g = groupes.setdefault(k, {"sous_systeme": k[0], "region": k[1], "departement": k[2], "postes": 0,
                                   "zone_rouge": 0})
        g["postes"] += 1
        g["zone_rouge"] += 1 if p.get("est_zone_rouge") else 0
    return Response({"scenario": sc.pk, "total": len(r["postes_non_pourvus"]),
                     "groupes": sorted(groupes.values(), key=lambda g: -g["postes"]),
                     "rt_par_sous_systeme": r["synthese"]["rt_par_sous_systeme"]})


@extend_schema(responses=OBJ, summary="Explication d'une proposition (barème, score, alternatives)")
@api_view(["GET"])
def explication(request, jeu, sid, matricule):
    j = jeu_autorise(request, jeu)
    exiger_nominatif(j, FONCTION_MOBILITE)
    sc = sim.scenario_du_jeu(j, sid)
    out = an.expliquer_proposition(sim.charger_resultat(sc), matricule, sim.config_resultat(sc))
    if out is None:
        raise Http404("Aucune affectation pour ce matricule dans ce scénario")
    return Response(out)


@extend_schema(responses=OBJ, summary="Taux d'encadrement et turnover, avant (fichier d'origine) et après le scénario")
@api_view(["GET"])
def encadrement(request, jeu, sid):
    from contextes.diagnostic.services import preparer
    j = jeu_autorise(request, jeu)
    exiger_nominatif(j, "Turnover et encadrement par enseignant")
    sc = sim.scenario_du_jeu(j, sid)
    perimetre = perimetre_depuis(request)
    res = restreindre_resultat(sim.charger_resultat(sc), perimetre)       # le périmètre s'applique comme ailleurs
    ids = {e["Identifiant_Ecole"] for e in res["etab_enrichi"]}
    enseignants = [t for t in depots.charger_enseignants(j) if t.ecole_attache in ids]
    # « Avant » : effectifs déclarés des bases importées, avant les faits du Prince et avant l'algorithme.
    importes = {e.id: e.enseignants_actuels for e in preparer(j).avant().ecoles}
    return Response({"scenario": sc.pk, **an.comparer_encadrement_turnover(
        res, enseignants, sim.config_resultat(sc), effectifs_import=importes,
        libelle="National" if perimetre.national else perimetre.titre)})


@extend_schema(parameters=PAGE, responses=OBJ, summary="Vœux et leur statut")
@api_view(["GET"])
def candidatures(request, jeu, sid):
    _, sc, r = _ctx(request, jeu, sid)
    lignes = an.candidatures(r, sim.config_resultat(sc))
    q = request.query_params
    if q.get("statut"):
        lignes = [l for l in lignes if l["statut"] == q["statut"]]
    if q.get("id_ens"):
        lignes = [l for l in lignes if l["id_ens"] == q["id_ens"]]
    return Response(reponse_paginee(request, lignes))


@extend_schema(parameters=PAGE + [OpenApiParameter("options", int)], responses=OBJ,
               summary="Options proposées aux commissions pour les non-affectés")
@api_view(["GET"])
def combinaisons(request, jeu, sid):
    j = jeu_autorise(request, jeu)
    exiger_nominatif(j, FONCTION_MOBILITE)
    sc = sim.scenario_du_jeu(j, sid)
    r = restreindre_resultat(sim.charger_resultat(sc), perimetre_depuis(request))
    lignes = an.combinaisons(r, sim.config_resultat(sc), entier_param(request.query_params.get("options"), "options", defaut=3, minimum=1, maximum=10))
    return Response(reponse_paginee(request, lignes))


@extend_schema(responses=OBJ, summary="Contrôle des invariants du résultat")
@api_view(["GET"])
def invariants(request, jeu, sid):
    j = jeu_autorise(request, jeu)
    ctl = an.verifier_invariants(sim.charger_resultat(sim.scenario_du_jeu(j, sid)))
    return Response({"tous_respectes": all(c["ok"] for c in ctl), "controles": ctl})


@extend_schema(parameters=GEO, responses=OBJ, summary="Déploiement des recrues sur les postes vacants")
@api_view(["GET"])
def recrutes(request, jeu, sid):
    j, sc, r = _ctx(request, jeu, sid)
    rec = [{"id_recrue": x.id_recrue, "nom": x.nom, "prenom": x.prenom, "sous_systeme": x.sous_systeme,
            "region_souhaitee": x.region_souhaitee, "rang": x.rang} for x in j.recrues.all()]
    return Response(an.deployer_recrues(rec, r["postes_non_pourvus"]))


@extend_schema(parameters=[OpenApiParameter("niveau", str, description="region | departement | commune")],
               responses=OBJ, summary="Flux entre territoires : reçus, sortants, internes, solde")
@api_view(["GET"])
def flux(request, jeu, sid):
    j = jeu_autorise(request, jeu)
    exiger_nominatif(j, FONCTION_MOBILITE)
    niveau = request.query_params.get("niveau", "region")
    try:
        lignes = an.calculer_flux(sim.charger_resultat(sim.scenario_du_jeu(j, sid))["affectations"], niveau)
    except ValueError as exc:
        raise RefusMetier(str(exc))
    return Response({"niveau": niveau, "flux": lignes})


@extend_schema(request=None, responses=OBJ, summary="Compare les scénarios géographiques existants (lecture seule, ne crée aucun scénario)")
@api_view(["GET"])
def comparaison(request, jeu):
    j = jeu_autorise(request, jeu)
    scs = list(j.scenarios.filter(geographique=True))     # lecture seule : aucun scénario n'est créé ici
    return Response({"scenarios": comparer({s.code or str(s.pk): sim.charger_resultat(s) for s in scs}),
                     "obsoletes": [s.pk for s in scs if sim.est_obsolete(s)]})

@extend_schema(request=OBJ, responses=OBJ,
               summary="Retenir le scénario dont les mouvements alimentent la planification et les nominations {scenario}")
@api_view(["PUT"])
def scenario_retenu(request, jeu):
    from contextes.audit.services import journaliser
    from contextes.donnees.services import resume_jeu
    from contextes.planification.services import marquer_obsolete

    from .models import ResultatSimulation
    j = jeu_autorise(request, jeu)
    exiger_nominatif(j, "Retenue d'un scénario de mobilité")
    d = request.data if isinstance(request.data, dict) else {}
    ident = str(d.get("scenario") or "")
    sc = j.scenarios.filter(pk=ident).first() if ident.isdigit() else None
    if sc is None:
        raise RefusMetier("Ce scénario n'existe pas", code="scenario_inconnu")
    if not ResultatSimulation.objects.filter(scenario=sc).exists():
        raise RefusMetier("Seul un scénario calculé peut être retenu pour la planification.", code="scenario_non_calcule")
    avant = str(j.scenario_retenu_id) if j.scenario_retenu_id else None
    j.scenario_retenu = sc
    j.save(update_fields=["scenario_retenu"])
    journaliser(j, "scenario_retenu", "retenu", f"Scénario retenu : {sc.nom}", request=request,
                objet=("scenario", sc.pk), avant={"scenario": avant}, apres={"scenario": str(sc.pk)})
    marquer_obsolete(j, "Changement du scénario retenu")
    return Response(resume_jeu(j))


class _SansNegociation(BaseContentNegotiation):
    """L'export renvoie un fichier : on accepte tout type demandé."""

    def select_parser(self, request, parsers):
        return parsers[0]

    def select_renderer(self, request, renderers, format_suffix=None):
        return (renderers[0], renderers[0].media_type)
@extend_schema(parameters=GEO, responses={(200, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"): OpenApiTypes.BINARY},
               summary="Export Excel du résultat (route ajoutée : issue de export_excel_bytes)")
@api_view(["GET"])
#@content_negotiation_class(_SansNegociation)
def exporter(request, jeu, sid):
    _, sc, r = _ctx(request, jeu, sid)
    feuilles = {"Synthese_Region": [{k: str(v) if isinstance(v, (dict, list)) else v
                                     for k, v in r["synthese"].items()}],
                "Ecoles_Necessiteuses": r["ecoles_en_besoin"], "Ecoles_Fournisseurs": r["ecoles_fournisseurs"],
                "Affectations": r["affectations"]}
    prince = [a for a in r["affectations"] if a["phase"] == "effet_de_prince"]
    if prince:
        feuilles["Effet_De_Prince"] = prince
    feuilles.update({"Non_Affectes": r["non_affectes"], "Postes_Non_Pourvus": r["postes_non_pourvus"],
                     "Vivier_Detail": r["vivier"]})
    if r["postes_rouge_non_pourvus"]:
        feuilles["Postes_Zone_Rouge"] = r["postes_rouge_non_pourvus"]
    if r["journal_audit"]:
        feuilles["Journal_Audit"] = r["journal_audit"]
    rep = HttpResponse(ecrire_excel(feuilles),
                       content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    rep["Content-Disposition"] = f'attachment; filename="algoplanr_scenario_{sc.pk}.xlsx"'
    return rep
exporter.cls.content_negotiation_class = _SansNegociation