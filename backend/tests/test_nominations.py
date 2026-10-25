"""Routes reliées depuis codeSource : vivier, postes ouverts, cycle de vie des nominations, registre, validation et
actualisation des jeux."""
import io

import pytest

pytestmark = pytest.mark.django_db
B = "/api/v1/"


@pytest.fixture
def c(drh):
    return drh


@pytest.fixture
def jeu(c):
    """Jeu de démonstration, scénario départemental retenu (sans extension régionale, il laisse au vivier des
    enseignants compatibles avec des postes restés ouverts, comme le jeu de référence)."""
    r = c.post(B + "jeux/demonstration/", {"nb_ecoles": 40, "nb_enseignants": 300}, content_type="application/json")
    assert r.status_code == 201, r.content
    ident = r.json()["id"]
    sc = next(s for s in get(c, f"jeux/{ident}/scenarios/") if s["code"] == "geo_departement")
    r = c.put(B + f"jeux/{ident}/scenario-retenu/", {"scenario": str(sc["id"])}, content_type="application/json")
    assert r.status_code == 200, r.content
    return ident


def get(c, url, **kw):
    r = c.get(B + url, kw)
    assert r.status_code == 200, (url, r.status_code, r.content[:500])
    return r.json()


def envoyer(c, url, corps=None, attendu=200):
    r = c.post(B + url, corps or {}, content_type="application/json")
    assert r.status_code == attendu, (url, r.status_code, r.content[:500])
    return r.json()


def test_vivier_postes_et_rapprochements(c, jeu):
    vivier = get(c, f"jeux/{jeu}/vivier/", taille=500)
    assert vivier["count"] > 0 and all(p["disponibilite"] == "libre" for p in vivier["resultats"])
    assert {p["source"] for p in vivier["resultats"]} == {"excedentaire"}
    personne = vivier["resultats"][0]
    fiche = get(c, f"jeux/{jeu}/vivier/{personne['id']}/")
    assert fiche["detail_bareme"]["total"] == pytest.approx(personne["bareme"]) and fiche["historique"] == []
    compatibles = get(c, f"jeux/{jeu}/vivier/{personne['id']}/postes-compatibles/")
    assert compatibles and "_poste" not in compatibles[0]["poste"]
    rangs = [(not x["compatible"], -x["score"]["total"]) for x in compatibles]
    assert rangs == sorted(rangs)
    postes = get(c, f"jeux/{jeu}/postes-ouverts/", taille=500)
    assert postes["count"] > 0 and all(p["statut"] == "libre" for p in postes["resultats"])
    cand = get(c, f"jeux/{jeu}/postes-ouverts/{postes['resultats'][0]['id']}/candidats/")
    assert len(cand) == vivier["count"]


def test_cycle_de_vie_et_registre(c, jeu):
    vivier = get(c, f"jeux/{jeu}/vivier/", taille=500)["resultats"]
    personne = vivier[0]
    choix = next(x for x in get(c, f"jeux/{jeu}/vivier/{personne['id']}/postes-compatibles/") if x["compatible"])
    corps = {"personne": personne["id"], "poste": choix["poste"]["id"], "annee": "N+1", "auteur": "Agent"}
    envoyer(c, f"jeux/{jeu}/nominations/", {**corps, "motif": ""}, 422)
    n = envoyer(c, f"jeux/{jeu}/nominations/", {**corps, "motif": "Choix de la commission"}, 201)
    assert n["statut"] == "proposee" and n["personne"]["disponibilite"] == "proposee"
    # Une seule nomination active par personne.
    envoyer(c, f"jeux/{jeu}/nominations/", {**corps, "motif": "Doublon"}, 409)
    ni = f"jeux/{jeu}/nominations/{n['id']}/"
    envoyer(c, ni + "mettre-en-oeuvre/", {"auteur": "Agent"}, 409)
    v = envoyer(c, ni + "valider/", {"reference": "DEC-1", "auteur": "Agent"})
    assert v["statut"] == "validee" and v["poste"]["statut"] == "reserve" and v["reference_decision"] == "DEC-1"
    mvts = get(c, f"jeux/{jeu}/mouvements/", type="nomination")["resultats"]
    assert [m["id"] for m in mvts] == [f"nom-{n['id']}"] and mvts[0]["statut"] == "prevu"
    m = envoyer(c, f"jeux/{jeu}/mouvements/nom-{n['id']}/mettre-en-oeuvre/",
                {"date_effet": "2027-09-01", "reference_acte": "ACTE-1", "auteur": "Agent"})
    assert m["statut"] == "realise" and m["realise_le"] == "2027-09-01"
    fin = get(c, ni)
    assert fin["statut"] == "mise_en_oeuvre" and [h["vers"] for h in fin["historique"]] == [
        "proposee", "validee", "mise_en_oeuvre"]
    envoyer(c, ni + "annuler/", {"motif": "x", "auteur": "Agent"}, 409)   # définitive
    t = get(c, f"jeux/{jeu}/planification/")
    assert t["annees"][0]["nominations_realisees"] == 1
    synth = get(c, f"jeux/{jeu}/nominations/synthese/")
    assert synth["par_statut"]["mise_en_oeuvre"] == 1 and len(synth["par_annee"]) == 5
    assert get(c, f"jeux/{jeu}/personnes/{personne['matricule']}/mouvements/")[0]["type"] == "nomination"
    hist = get(c, f"jeux/{jeu}/journal-audit/", type="nomination", objet=f"nomination:{n['id']}")["resultats"]
    assert [e["action"] for e in hist] == ["mise_en_oeuvre", "validee", "proposee"]


def test_generation_lot_et_controles(c, jeu):
    bilan = envoyer(c, f"jeux/{jeu}/nominations/generer/", {"annee": "N+1", "auteur": "Agent"})
    assert bilan["proposees"] > 0
    proposees = get(c, f"jeux/{jeu}/nominations/", statut="proposee", taille=500)["resultats"]
    assert len(proposees) == bilan["proposees"]
    assert len({n["poste"]["id"] for n in proposees}) == len(proposees)   # un poste par proposition
    ids = [n["id"] for n in proposees[:3]] + ["999999"]
    lot = envoyer(c, f"jeux/{jeu}/nominations/lot/", {"action": "valider", "nominations": ids, "auteur": "Agent"})
    assert lot["traitees"] == 3 and lot["refus"][0]["nomination"] == "999999"
    rejet = envoyer(c, f"jeux/{jeu}/nominations/{proposees[3]['id']}/rejeter/", {"motif": "Contrainte familiale"})
    assert rejet["statut"] == "rejetee" and rejet["personne"]["disponibilite"] == "libre"
    ctl = get(c, f"jeux/{jeu}/mouvements/controles/")
    assert ctl["ok"] is True, ctl
    redeploiement = get(c, f"jeux/{jeu}/mouvements/", type="redeploiement", taille=1)["resultats"][0]
    r = envoyer(c, f"jeux/{jeu}/mouvements/{redeploiement['id']}/mettre-en-oeuvre/",
                {"date_effet": "2027-09-01", "reference_acte": "A", "auteur": "Agent"})
    assert r["statut"] == "realise"
    envoyer(c, f"jeux/{jeu}/mouvements/{redeploiement['id']}/mettre-en-oeuvre/", {"date_effet": "x"}, 409)


def test_import_vivier_et_nominations(c, jeu):
    f = io.BytesIO("nom,prenom,matricule,sous_systeme,region,note\nAtangana,Marie,R-1,Francophone,Centre,14\n"
                   ",Sans nom,R-2,Francophone,Centre,12\n".encode("utf-8"))
    f.name = "vivier.csv"
    r = c.post(B + f"jeux/{jeu}/vivier/import/", {"fichier": f, "source": "reintegration", "auteur": "Agent"})
    assert r.status_code == 201, r.content
    assert r.json()["ajoutees"] == 1 and len(r.json()["refus"]) == 1
    # La source doit être retenue par les hypothèses pour entrer au vivier.
    assert get(c, f"jeux/{jeu}/vivier/", source="reintegration")["count"] == 0
    h = get(c, f"jeux/{jeu}/hypotheses/")
    corps = {k: v for k, v in h.items() if k not in ("version", "modifiees_le", "modifiees_par")}
    corps["vivier"] = {**corps["vivier"], "sources": ["excedentaire", "laureat_sans_poste", "reintegration"]}
    r = c.put(B + f"jeux/{jeu}/hypotheses/", {**corps, "motif": "Réintégrations", "auteur": "DRH"},
              content_type="application/json")
    assert r.status_code == 200, r.content
    assert get(c, f"jeux/{jeu}/vivier/", source="reintegration")["resultats"][0]["id"] == "imp-R-1"

    personne = get(c, f"jeux/{jeu}/vivier/", taille=1)["resultats"][0]
    poste = next(x["poste"] for x in get(c, f"jeux/{jeu}/vivier/{personne['id']}/postes-compatibles/")
                 if x["compatible"])
    g = io.BytesIO(f"matricule,poste,statut,reference\n{personne['matricule']},{poste['id']},MISE_EN_OEUVRE,ACTE-9\n"
                   "INCONNU,X,validee,\n".encode("utf-8"))
    g.name = "nominations.csv"
    r = c.post(B + f"jeux/{jeu}/nominations/import/", {"fichier": g, "auteur": "Agent"})
    assert r.status_code == 201, r.content
    assert r.json()["importees"] == 1 and len(r.json()["refus"]) == 1
    n = get(c, f"jeux/{jeu}/nominations/", statut="mise_en_oeuvre")["resultats"][0]
    assert n["origine"] == "import" and n["reference_acte"] == "ACTE-9"


def test_validation_du_jeu(c, jeu):
    v = get(c, f"jeux/{jeu}/validation/")
    assert v["statut"] == "brouillon" and {x["code"] for x in v["controles"]} >= {"rattachement", "date_naissance"}
    ok = envoyer(c, f"jeux/{jeu}/validation/", {"auteur": "DRH"})
    assert ok["statut"] == "valide" and ok["valide_par"] == "DRH"
    assert get(c, f"jeux/{jeu}/")["statut"] == "valide"
    assert get(c, f"jeux/{jeu}/journal-audit/", type="validation_donnees")["count"] == 1
    assert get(c, f"jeux/{jeu}/actualisations/") == []


def _envoyer_fichiers(c, etab, ens):
    import pandas as pd
    ids = {}
    for typ, rows in (("etablissements", etab), ("enseignants", ens)):
        buf = io.BytesIO()
        pd.DataFrame(rows).to_excel(buf, index=False)
        buf.name = f"{typ}.xlsx"
        buf.seek(0)
        r = c.post(B + "fichiers/", {"type": typ, "fichier": buf})
        assert r.status_code == 201, r.content
        ids[typ] = r.json()["id"]
    return ids


def test_actualisation(centre):
    from domaine.donnees.demonstration import construire_jeu_demonstration
    c = centre
    e, n = construire_jeu_demonstration(1, 20, 100)
    for ligne in e:
        ligne["Region"] = "Centre"
    ids = _envoyer_fichiers(c, e, n)
    jeu = c.post(B + "jeux/", {"nom": "Centre", "fichier_etablissements": ids["etablissements"],
                              "fichier_enseignants": ids["enseignants"]}, content_type="application/json").json()["id"]
    assert envoyer(c, f"jeux/{jeu}/validation/", {"auteur": "Délégué"})["statut"] == "valide"
    mobilisable = get(c, f"jeux/{jeu}/enseignants/", dans_vivier="true", taille=1)["resultats"][0]
    parti = next(x for x in n if x["Matricule_Enseignant"] == mobilisable["Matricule_Enseignant"])
    change = next(x for x in n if x is not parti)
    # Le Fait de Prince est fermé au délégué par l'API : le fait est posé directement, comme un fait antérieur
    # à la fermeture de l'écran, pour vérifier que l'actualisation l'invalide.
    from contextes.donnees.models import JeuDeDonnees
    from contextes.prince import services as prince
    prince.ajouter(JeuDeDonnees.objects.get(pk=jeu), parti["Matricule_Enseignant"], e[0]["Identifiant_Ecole"],
                   "Décision")
    autre_ecole = next(x["Identifiant_Ecole"] for x in e if x["Identifiant_Ecole"] != change["Ecole_Attache_Actuelle"])
    n2 = [{**x, "Ecole_Attache_Actuelle": autre_ecole} if x is change else dict(x) for x in n if x is not parti]
    n2.append({**change, "Matricule_Enseignant": "NOUVEAU-1"})
    ids = _envoyer_fichiers(c, e, n2)
    act = envoyer(c, f"jeux/{jeu}/actualisations/", {"etablissements": ids["etablissements"],
                                                     "enseignants": ids["enseignants"], "auteur": "Délégué"}, 201)
    assert act["resume"] == {"arrivees": 1, "departs": 1, "changements_ecole": 1, "decisions_invalidees": 1}
    ecarts = get(c, f"jeux/{jeu}/actualisations/{act['id']}/ecarts/")
    assert ecarts["departs"][0]["matricule"] == parti["Matricule_Enseignant"]
    assert ecarts["decisions_invalidees"][0]["type"] == "fait_prince"
    assert get(c, f"jeux/{jeu}/")["statut"] == "brouillon"
    assert JeuDeDonnees.objects.get(pk=jeu).faits_prince.first().statut == "ANNULE"
    est = envoyer(c, f"jeux/{jeu}/hypotheses/attrition/estimer/")
    assert est["taux_propose"] is not None
