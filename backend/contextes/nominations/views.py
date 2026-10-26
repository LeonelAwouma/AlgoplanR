from django.http import Http404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from contextes.acces.controle_import import verifier_fichier
from contextes.acces.perimetre import jeu_autorise, region_imposee
from contextes.audit.services import auteur_de, journaliser
from contextes.commun.erreurs import RefusMetier
from contextes.commun.outils import reponse_paginee
from contextes.donnees.lecteur import FichierIllisible, lire_classeur_numerote
from contextes.donnees.services import exiger_nominatif
from contextes.simulation import services as sim
from domaine.commun.texte import nombre_ou_none, norm, texte
from domaine.nominations import cycle
from domaine.planification.parametres import SOURCES_VIVIER

from . import services as nom
from .models import PersonneVivier

OBJ = OpenApiTypes.OBJECT
PAGE = [OpenApiParameter("page", int), OpenApiParameter("taille", int), OpenApiParameter("tri", str)]
GEO = [OpenApiParameter("region", str), OpenApiParameter("departement", str)]


def _oui(valeur) -> bool:
    """Reconnaissance explicite (booléen ou « true », « 1 », « oui ») ; absente ou autre = non."""
    if isinstance(valeur, bool):
        return valeur
    return str(valeur or "").strip().lower() in ("1", "true", "oui", "yes")


def _corps(request) -> dict:
    return request.data if hasattr(request.data, "get") else {}


def _territoire(request, ligne: dict, cle_region="region", cle_dept="departement") -> bool:
    q = request.query_params
    region = region_imposee(request) or q.get("region", "")
    if region and norm(ligne.get(cle_region)) != norm(region):
        return False
    if q.get("departement") and norm(ligne.get(cle_dept)) != norm(q["departement"]):
        return False
    return True


def _registre(request, jeu, ecriture=None):
    return nom.registre(jeu_autorise(request, jeu, ecriture=ecriture))


def _lire_fichier(request):
    up = request.FILES.get("fichier")
    if up is None:
        raise RefusMetier("Aucun fichier reçu", ["Champ multipart « fichier » manquant"])
    try:
        _, _, entetes, lignes, numeros = lire_classeur_numerote(up.read(), up.name, request.data.get("feuille") or None)
    except FichierIllisible as exc:
        raise RefusMetier(str(exc), code="fichier_illisible")
    verifier_fichier(request, entetes, lignes, numeros, up.name)
    return entetes, lignes, numeros


def _colonne(entetes, *noms):
    normes = {norm(e).replace(" ", "_"): e for e in entetes}
    return next((normes[n] for n in noms if n in normes), None)


# --- Vivier et postes ouverts ----------------------------------------------------------------------------------

@extend_schema(parameters=PAGE + GEO + [OpenApiParameter("source", str, many=True),
                                        OpenApiParameter("disponibilite", str), OpenApiParameter("sous_systeme", str),
                                        OpenApiParameter("q", str)],
               responses=OBJ, summary="Vivier consolidé (excédentaires, lauréats sans poste, autres sources)")
@api_view(["GET"])
def vivier(request, jeu):
    reg = _registre(request, jeu)
    q = request.query_params
    sources = q.getlist("source")
    recherche = norm(q.get("q", ""))
    lignes = [nom.public(v) for v in reg.vivier
              if _territoire(request, v)
              and (not sources or v["source"] in sources)
              and (not q.get("disponibilite") or v["disponibilite"] == q["disponibilite"])
              and (not q.get("sous_systeme") or v["sous_systeme"] == q["sous_systeme"])
              and (not recherche or recherche in norm(f"{v['matricule'] or ''} {v['nom']} {v['prenom']}"))]
    return Response(reponse_paginee(request, lignes))


@extend_schema(request={"multipart/form-data": OBJ}, responses=OBJ,
               summary="Ajouter au vivier des personnes d'une autre source {fichier, source, auteur}")
@api_view(["POST"])
def vivier_import(request, jeu):
    j = jeu_autorise(request, jeu)
    source = str(request.data.get("source") or "")
    if source not in SOURCES_VIVIER or source == "excedentaire":
        raise RefusMetier("Source du vivier invalide",
                          ["Les excédentaires viennent du calcul ; sources importables : "
                           + ", ".join(s for s in SOURCES_VIVIER if s != "excedentaire")])
    entetes, lignes, numeros = _lire_fichier(request)
    c_nom = _colonne(entetes, "nom", "nom_enseignant", "nom_complet")
    manquantes = [] if c_nom else ["nom"]
    if manquantes:
        return Response({"ajoutees": 0, "refus": [], "manquantes": manquantes})
    cols = {k: _colonne(entetes, *alias) for k, alias in {
        "matricule": ("matricule", "matricule_enseignant"), "prenom": ("prenom", "prénom"),
        "sous_systeme": ("sous_systeme", "sous-systeme", "sous_systeme_formation"), "region": ("region", "région"),
        "departement": ("departement", "département"), "commune": ("commune",), "note": ("note", "note_admission"),
    }.items()}
    existants = set(j.personnes_vivier.values_list("ident", flat=True))
    nouvelles, refus = [], []
    for i, l in enumerate(lignes):
        ligne = numeros[i] if i < len(numeros) else i + 2
        nom_p = texte(l.get(c_nom))
        if not nom_p:
            refus.append(f"Ligne {ligne} : nom manquant")
            continue
        matricule = texte(l.get(cols["matricule"])) if cols["matricule"] else ""
        ident = matricule or f"{source}-{ligne}"
        if ident in existants:
            refus.append(f"Ligne {ligne} : {ident} déjà au vivier")
            continue
        existants.add(ident)
        region = texte(l.get(cols["region"])) if cols["region"] else ""
        nouvelles.append(PersonneVivier(
            jeu=j, ident=ident, matricule=matricule or None, nom=nom_p, source=source,
            prenom=texte(l.get(cols["prenom"])) if cols["prenom"] else "",
            sous_systeme=texte(l.get(cols["sous_systeme"])) if cols["sous_systeme"] else "",
            region=region or (region_imposee(request) or ""),
            departement=texte(l.get(cols["departement"])) if cols["departement"] else "",
            commune=texte(l.get(cols["commune"])) if cols["commune"] else "",
            note=nombre_ou_none(l.get(cols["note"])) if cols["note"] else None,
            ajoutee_par=auteur_de(request, request.data.get("auteur"))))
    PersonneVivier.objects.bulk_create(nouvelles)
    if nouvelles:
        journaliser(j, "nomination", "import vivier", f"{len(nouvelles)} personne(s) ajoutée(s) au vivier ({source})",
                    request=request, auteur=auteur_de(request, request.data.get("auteur")),
                    objet=("vivier", source), apres={"ajoutees": len(nouvelles)})
        nom._obsolete(j, "Ajout de personnes au vivier")
    return Response({"ajoutees": len(nouvelles), "refus": refus, "manquantes": []}, status=201)


def _personne(reg, ident):
    p = reg.vivier_par_id.get(ident)
    if p is None:
        raise Http404("Cette personne n'est pas dans le vivier")
    return p


@extend_schema(responses=OBJ, summary="Fiche d'une personne du vivier : barème et historique")
@api_view(["GET"])
def personne(request, jeu, personne):
    from domaine.mobilite.bareme import detail_bareme
    from domaine.mobilite.rehydratation import enseignant_depuis_dict
    reg = _registre(request, jeu)
    p = _personne(reg, personne)
    detail = detail_bareme(enseignant_depuis_dict(p["_ens"]), reg.cfg) if p.get("_ens") else None
    historique = [nom.nomination_dict(reg, n) for n in reg.nominations if n.personne_id == personne]
    return Response({**nom.public(p), "detail_bareme": detail, "historique": historique})


@extend_schema(responses=OBJ, summary="Postes ouverts classés pour une personne")
@api_view(["GET"])
def postes_compatibles(request, jeu, personne):
    reg = _registre(request, jeu)
    p = _personne(reg, personne)
    return Response([{**{k: v for k, v in r.items() if k != "poste"}, "poste": nom.public(r["poste"])}
                     for r in nom.rapprochements_personne(reg, p)])


@extend_schema(parameters=PAGE + GEO + [OpenApiParameter("statut", str)], responses=OBJ,
               summary="Postes vacants après redéploiement : libre, réservé ou pourvu")
@api_view(["GET"])
def postes_ouverts(request, jeu):
    reg = _registre(request, jeu)
    statut = request.query_params.get("statut")
    return Response(reponse_paginee(request, [nom.public(p) for p in reg.postes if _territoire(request, p)
                                              and (not statut or p["statut"] == statut)]))


@extend_schema(responses=OBJ, summary="Personnes du vivier classées pour un poste")
@api_view(["GET"])
def candidats(request, jeu, poste):
    reg = _registre(request, jeu)
    p = reg.postes_par_id.get(poste)
    if p is None:
        raise Http404("Ce poste n'est pas ouvert")
    return Response([{**{k: v for k, v in r.items() if k != "personne"}, "personne": nom.public(r["personne"])}
                     for r in nom.candidats_poste(reg, p)])


# --- Nominations ------------------------------------------------------------------------------------------------

@extend_schema(methods=["GET"], parameters=PAGE + GEO + [OpenApiParameter("statut", str, many=True),
                                                         OpenApiParameter("annee", str), OpenApiParameter("source", str)],
               responses=OBJ, summary="Nominations, des plus récentes aux plus anciennes")
@extend_schema(methods=["POST"], request=OBJ, responses=OBJ,
               summary="Proposer une personne sur un poste {personne, poste, annee, motif, auteur}")
@api_view(["GET", "POST"])
def nominations(request, jeu):
    j = jeu_autorise(request, jeu)
    reg = nom.registre(j)
    if request.method == "POST":
        exiger_nominatif(j, "Nomination individuelle")
        d = _corps(request)
        motif = str(d.get("motif") or "").strip()
        if not motif:
            raise RefusMetier("Une nomination manuelle doit être motivée.", code="motif_manquant")
        n = nom.proposer(reg, str(d.get("personne") or ""), str(d.get("poste") or ""), str(d.get("annee") or "N+1"),
                         motif, origine="manuelle", request=request, auteur=auteur_de(request, d.get("auteur")))
        return Response(nom.nomination_dict(reg, n), status=201)
    q = request.query_params
    statuts, source = q.getlist("statut"), q.get("source")
    lignes = []
    for n in reg.nominations:
        d = nom.nomination_dict(reg, n)
        if (statuts and n.statut not in statuts) or (q.get("annee") and n.annee != q["annee"]):
            continue
        if source and d["personne"].get("source") != source:
            continue
        if not _territoire(request, d["poste"]):
            continue
        lignes.append(d)
    return Response(reponse_paginee(request, lignes))


@extend_schema(request=OBJ, responses=OBJ, summary="Propositions automatiques {annee, region?, departement?, auteur}")
@api_view(["POST"])
def generer(request, jeu):
    j = jeu_autorise(request, jeu)
    exiger_nominatif(j, "Propositions automatiques de nomination")
    d = _corps(request)
    region = region_imposee(request) or str(d.get("region") or "")
    reg = nom.registre(j)
    sim.exiger_a_jour(reg.scenario)
    bilan = nom.generer(reg, str(d.get("annee") or "N+1"), region=region,
                        departement=str(d.get("departement") or ""), request=request,
                        auteur=auteur_de(request, d.get("auteur")))
    return Response(bilan)


@extend_schema(request=OBJ, responses=OBJ,
               summary="Valider ou rejeter un lot {action, nominations, reference?, motif?, auteur}")
@api_view(["POST"])
def lot(request, jeu):
    j = jeu_autorise(request, jeu)
    exiger_nominatif(j, "Validation de nominations")
    d = _corps(request)
    action = d.get("action")
    if action not in ("valider", "rejeter"):
        raise RefusMetier("Action inconnue", ["action : valider ou rejeter"])
    reg = nom.registre(j)
    if action == "valider":
        sim.exiger_a_jour(reg.scenario)
    auteur = auteur_de(request, d.get("auteur"))
    bilan = {"traitees": 0, "refus": []}
    for ident in d.get("nominations") or []:
        n = next((x for x in reg.nominations if str(x.pk) == str(ident)), None)
        if n is None:
            bilan["refus"].append({"nomination": str(ident), "motif": "Nomination inconnue."})
            continue
        try:
            if action == "valider":
                nom.changer_statut(reg, n, "validee", request=request, auteur=auteur, reference=d.get("reference"),
                                   verification_sources=_oui(d.get("verification_sources")))
            else:
                nom.changer_statut(reg, n, "rejetee", request=request, auteur=auteur, motif=d.get("motif"))
            bilan["traitees"] += 1
        except RefusMetier as exc:
            bilan["refus"].append({"nomination": str(ident), "motif": exc.message})
    return Response(bilan)


@extend_schema(request={"multipart/form-data": OBJ}, responses=OBJ,
               summary="Importer des nominations décidées hors de l'application {fichier, auteur}")
@api_view(["POST"])
def importer(request, jeu):
    j = jeu_autorise(request, jeu)
    exiger_nominatif(j, "Import de nominations")
    entetes, lignes, numeros = _lire_fichier(request)
    c_mat = _colonne(entetes, "matricule", "matricule_enseignant", "personne")
    c_poste = _colonne(entetes, "poste", "id_poste")
    c_ecole = _colonne(entetes, "identifiant_ecole", "id_ecole", "ecole")
    manquantes = (["matricule"] if not c_mat else []) + (["poste ou identifiant_ecole"] if not (c_poste or c_ecole) else [])
    if manquantes:
        return Response({"importees": 0, "refus": [], "manquantes": manquantes})
    c_annee, c_statut = _colonne(entetes, "annee", "année"), _colonne(entetes, "statut")
    c_ref, c_date = _colonne(entetes, "reference", "référence", "reference_acte"), _colonne(entetes, "date_effet")
    c_motif = _colonne(entetes, "motif")
    reg = nom.registre(j)
    sim.exiger_a_jour(reg.scenario)        # sinon chaque ligne serait refusée une à une
    auteur = auteur_de(request, request.data.get("auteur"))
    importees, refus = 0, []
    for i, l in enumerate(lignes):
        ligne = numeros[i] if i < len(numeros) else i + 2
        mat = texte(l.get(c_mat))
        personne = reg.vivier_par_id.get(mat) or reg.vivier_par_id.get(f"ens-{mat}") or reg.vivier_par_id.get(f"imp-{mat}")
        poste = reg.postes_par_id.get(texte(l.get(c_poste))) if c_poste else None
        if poste is None and c_ecole:
            ecole = texte(l.get(c_ecole))
            poste = next((p for p in reg.postes if p["id_ecole"] == ecole and p["statut"] == "libre"), None)
        statut = cycle.DEPUIS_CODESOURCE.get(texte(l.get(c_statut)).upper(), norm(l.get(c_statut))) if c_statut else ""
        statut = statut or "validee"
        if personne is None:
            refus.append(f"Ligne {ligne} : {mat or 'matricule vide'} n'est pas dans le vivier")
            continue
        if poste is None:
            refus.append(f"Ligne {ligne} : aucun poste ouvert libre correspondant")
            continue
        if statut not in ("proposee", "validee", "mise_en_oeuvre"):
            refus.append(f"Ligne {ligne} : statut « {statut} » non importable")
            continue
        try:
            n = nom.proposer(reg, personne["id"], poste["id"], texte(l.get(c_annee)) if c_annee else "N+1",
                             texte(l.get(c_motif)) if c_motif else "Décision importée", origine="import",
                             request=request, auteur=auteur)
            ref = texte(l.get(c_ref)) if c_ref else ""
            if statut in ("validee", "mise_en_oeuvre"):
                nom.changer_statut(reg, n, "validee", request=request, auteur=auteur, reference=ref,
                                   decision_externe=True)
            if statut == "mise_en_oeuvre":
                nom.changer_statut(reg, n, "mise_en_oeuvre", request=request, auteur=auteur, reference=ref,
                                   date_effet=texte(l.get(c_date)) if c_date else None)
            importees += 1
        except RefusMetier as exc:
            refus.append(f"Ligne {ligne} : {exc.message}")
    return Response({"importees": importees, "refus": refus, "manquantes": []}, status=201)


@extend_schema(responses=OBJ, summary="Décomptes par statut, territoire et année")
@api_view(["GET"])
def synthese(request, jeu):
    return Response(nom.synthese(_registre(request, jeu)))


def _nomination(reg, ident):
    n = next((x for x in reg.nominations if str(x.pk) == str(ident)), None)
    if n is None:
        raise Http404("Cette nomination n'existe pas")
    return n


@extend_schema(responses=OBJ, summary="Détail d'une nomination et historique de ses statuts")
@api_view(["GET"])
def nomination(request, jeu, nomination):
    reg = _registre(request, jeu)
    return Response(nom.nomination_dict(reg, _nomination(reg, nomination)))


def _transition(vers: str, titre: str):
    @extend_schema(request=OBJ, responses=OBJ, summary=titre)
    @api_view(["POST"])
    def vue(request, jeu, nomination):
        reg = _registre(request, jeu)
        n = _nomination(reg, nomination)
        d = _corps(request)
        nom.changer_statut(reg, n, vers, request=request, auteur=auteur_de(request, d.get("auteur")),
                           motif=d.get("motif"), reference=d.get("reference") or d.get("reference_acte"),
                           date_effet=d.get("date_effet"), verification_sources=_oui(d.get("verification_sources")))
        return Response(nom.nomination_dict(reg, n))
    vue.__name__ = f"nomination_{vers}"
    return vue


valider = _transition("validee", "Proposée → validée {reference, auteur} : le poste est réservé")
rejeter = _transition("rejetee", "Proposée → rejetée {motif, auteur}")
mettre_en_oeuvre = _transition("mise_en_oeuvre", "Validée → mise en œuvre {date_effet, reference_acte, auteur}")
annuler = _transition("annulee", "Proposée ou validée → annulée {motif, auteur}")


# --- Registre des mouvements ------------------------------------------------------------------------------------

def _mouvement_public(m: dict) -> dict:
    return nom.public(m)


@extend_schema(parameters=PAGE + GEO + [OpenApiParameter("type", str, many=True), OpenApiParameter("statut", str),
                                        OpenApiParameter("annee", str)],
               responses=OBJ, summary="Registre : redéploiements, faits du Prince, recrues, nominations")
@api_view(["GET"])
def mouvements(request, jeu):
    reg = _registre(request, jeu)
    q = request.query_params
    types = q.getlist("type")
    lignes = [_mouvement_public(m) for m in nom.mouvements(reg)
              if (not types or m["type"] in types) and (not q.get("statut") or m["statut"] == q["statut"])
              and (not q.get("annee") or m["annee"] == q["annee"]) and _territoire(request, m["_lieu"])]
    return Response(reponse_paginee(request, lignes))


@extend_schema(responses=OBJ, summary="Doubles comptages du registre")
@api_view(["GET"])
def controles(request, jeu):
    reg = _registre(request, jeu)
    return Response(cycle.controler_mouvements([
        {"id": m["id"], "matricule": m["personne"]["matricule"], "poste": m["_poste"], "decision": m["decision"]}
        for m in nom.mouvements(reg) if _territoire(request, m["_lieu"])]))


def _mvt(reg, ident):
    m = next((x for x in nom.mouvements(reg) if x["id"] == ident), None)
    if m is None:
        raise Http404("Ce mouvement n'existe pas")
    return m


@extend_schema(responses=OBJ, summary="Détail d'un mouvement")
@api_view(["GET"])
def mouvement(request, jeu, mouvement):
    return Response(_mouvement_public(_mvt(_registre(request, jeu), mouvement)))


@extend_schema(request=OBJ, responses=OBJ, summary="Marquer un mouvement réalisé {date_effet, reference_acte, auteur}")
@api_view(["POST"])
def realiser(request, jeu, mouvement):
    reg = _registre(request, jeu)
    m = _mvt(reg, mouvement)
    d = _corps(request)
    nom.realiser_mouvement(reg, m, date_effet=str(d.get("date_effet") or ""),
                           reference_acte=str(d.get("reference_acte") or ""), request=request,
                           auteur=auteur_de(request, d.get("auteur")),
                           verification_sources=_oui(d.get("verification_sources")))
    return Response(_mouvement_public(_mvt(nom.registre(reg.jeu), mouvement)))


@extend_schema(responses=OBJ, summary="Tous les mouvements d'une personne")
@api_view(["GET"])
def mouvements_personne(request, jeu, matricule):
    reg = _registre(request, jeu)
    return Response([_mouvement_public(m) for m in nom.mouvements(reg) if m["personne"]["matricule"] == matricule])

