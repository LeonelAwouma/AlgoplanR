"""Jeu de test « nominations » (backend/jeux_de_test/nominations) : import complet puis cycle de vie.

Si ce test échoue après un changement du moteur, regénérer le jeu (`jeux_de_test/nominations/generer.py`) et
ajuster `NOMINATIONS` dans ce fichier-là ainsi que le LISEZ-MOI.
"""
from pathlib import Path

import pytest

pytestmark = pytest.mark.django_db
B = "/api/v1/"
DOSSIER = Path(__file__).resolve().parents[1] / "jeux_de_test" / "nominations"
SOURCES = ["excedentaire", "laureat_sans_poste", "reintegration", "disponibilite", "fin_detachement", "autre"]


def get(c, url, **kw):
    r = c.get(B + url, kw)
    assert r.status_code == 200, (url, r.status_code, r.content[:500])
    return r.json()


def envoyer(c, url, nom, attendu, **extra):
    with open(DOSSIER / nom, "rb") as f:
        r = c.post(B + url, {"fichier": f, **extra})
    assert r.status_code == attendu, (url, nom, r.status_code, r.content[:500])
    return r.json()


@pytest.fixture
def jeu(drh):
    c = drh
    e = envoyer(c, "fichiers/", "etablissements.xlsx", 201, type="etablissements")
    n = envoyer(c, "fichiers/", "enseignants.xlsx", 201, type="enseignants")
    r = c.post(B + "jeux/", {"fichier_etablissements": e["id"], "fichier_enseignants": n["id"], "nom": "Nominations"})
    assert r.status_code == 201, r.content
    ident = r.json()["id"]
    assert r.json()["qualite"]["statistiques"]["nb_erreurs"] == 0
    # Ce jeu a été conçu avec des redéploiements entre régions : on garde la règle des régions désactivée
    # (le comportement par défaut, régions étanches, est couvert par test_regions_etanches.py). Ses chiffres sont
    # calibrés sur la norme historique de 60 élèves par maître (référentiel d'avant octobre 2026) : on la garde.
    r = c.patch(B + f"jeux/{ident}/parametres/", {"regles_dreb": {"regions_etanches": False},
                                                   "besoin": {"norme_eleves_par_maitre": 60}},
                content_type="application/json")
    assert r.status_code == 200, r.content
    r = c.post(B + f"jeux/{ident}/scenarios/base/")
    assert r.status_code in (200, 201), r.content
    sc = next(s for s in get(c, f"jeux/{ident}/scenarios/") if s["code"] == "geo_departement")
    r = c.put(B + f"jeux/{ident}/scenario-retenu/", {"scenario": str(sc["id"])}, content_type="application/json")
    assert r.status_code == 200, r.content
    return ident


def charger_sources(c, jeu):
    recrues = envoyer(c, f"jeux/{jeu}/recrues/import/", "recrues.xlsx", 201)
    assert recrues["acceptees"] == 8 and [x["motif"] for x in recrues["refusees"]] == [
        "Identifiant de recrue manquant", "Doublon dans le fichier"]
    prince = envoyer(c, f"jeux/{jeu}/faits-prince/import/", "faits_prince.xlsx", 200)
    assert [x["id_ens"] for x in prince["acceptees"]] == ["MAT00229", "MAT00094"]
    # Refus matériels seulement : matricule inconnu, école inconnue, agent déjà dans l'école de destination.
    assert {x["id_ens"]: x["motifs"] for x in prince["refusees"]} == {
        "MAT99999": ["Enseignant introuvable dans la base : MAT99999"],
        "MAT00130": ["École de destination inconnue : ECO999"],
        "MAT00001": ["L'enseignant est déjà rattaché à cette école"]}
    assert prince["manquantes"] == ["ECO999", "MAT99999"]
    attendu = {"reintegration": (4, 2), "disponibilite": (3, 0), "fin_detachement": (2, 0), "autre": (2, 0)}
    for source, (ajoutees, refus) in attendu.items():
        r = envoyer(c, f"jeux/{jeu}/vivier/import/", f"vivier_{source}.xlsx", 201, source=source, auteur="DRH")
        assert (r["ajoutees"], len(r["refus"])) == (ajoutees, refus), (source, r)
    h = get(c, f"jeux/{jeu}/hypotheses/")
    corps = {k: v for k, v in h.items() if k not in ("version", "modifiees_le", "modifiees_par")}
    corps["vivier"] = {**corps["vivier"], "sources": SOURCES}
    r = c.put(B + f"jeux/{jeu}/hypotheses/", {**corps, "motif": "Toutes les sources", "auteur": "DRH"},
              content_type="application/json")
    assert r.status_code == 200, r.content


def test_vivier_et_postes_ouverts(drh, jeu):
    c = drh
    charger_sources(c, jeu)
    vivier = get(c, f"jeux/{jeu}/vivier/", taille=500)["resultats"]
    par_source = {}
    for v in vivier:
        par_source[v["source"]] = par_source.get(v["source"], 0) + 1
    assert par_source == {"excedentaire": 18, "laureat_sans_poste": 1, "reintegration": 4, "disponibilite": 3,
                          "fin_detachement": 2, "autre": 2}
    assert {v["id"] for v in vivier} >= {"ens-MAT00207", "imp-REI-0001", "imp-DET-0001", "laureat-LAU-008"}
    postes = get(c, f"jeux/{jeu}/postes-ouverts/", taille=500)["resultats"]
    assert len(postes) == 11 and all(p["statut"] == "libre" for p in postes)
    rouges = sorted(p["id"] for p in postes if p["zone_securite"] == "rouge")
    assert rouges == ["ECO026_P2", "ECO040_P4"]
    types = {m["type"] for m in get(c, f"jeux/{jeu}/mouvements/", taille=500)["resultats"]}
    assert types == {"fait_prince", "redeploiement", "deploiement_recrue"}


def test_import_des_decisions_et_cycle_de_vie(drh, jeu):
    c = drh
    charger_sources(c, jeu)
    bilan = envoyer(c, f"jeux/{jeu}/nominations/import/", "nominations.xlsx", 201, auteur="Agent")
    assert bilan["importees"] == 6 and bilan["manquantes"] == []
    motifs = " | ".join(bilan["refus"])
    for attendu in ("MAT99998 n'est pas dans le vivier", "aucun poste ouvert libre correspondant",
                    "statut « rejetee » non importable", "déjà engagé(e)", "déjà réservé ou pourvu",
                    "Une règle bloque cette nomination", "Année du plan invalide", "matricule vide"):
        assert attendu in motifs, (attendu, bilan["refus"])
    assert len(bilan["refus"]) == 9

    noms = get(c, f"jeux/{jeu}/nominations/", taille=100)["resultats"]
    assert len(noms) == 6 and {n["origine"] for n in noms} == {"import"}
    synthese = get(c, f"jeux/{jeu}/nominations/synthese/")["par_statut"]
    assert synthese["mise_en_oeuvre"] == 1 and synthese["validee"] == 3 and synthese["proposee"] == 2
    par_personne = {n["personne"]["matricule"] or n["personne"]["id"]: n for n in noms}
    assert par_personne["MAT00207"]["statut"] == "mise_en_oeuvre"
    assert par_personne["MAT00207"]["reference_acte"] == "ACTE-2027-001"
    assert par_personne["DET-0001"]["poste"]["id"] == "ECO012_P4"      # résolu par l'identifiant de l'école

    postes = {p["id"]: p["statut"] for p in get(c, f"jeux/{jeu}/postes-ouverts/", taille=500)["resultats"]}
    assert postes["ECO012_P2"] == "pourvu"
    assert postes["ECO012_P3"] == postes["ECO011_P3"] == postes["ECO012_P4"] == "reserve"
    assert postes["ECO008_P2"] == "libre"          # deux propositions concurrentes, aucune validée

    # Proposition concurrente : la première validation gagne, la seconde est refusée.
    concurrentes = [n for n in noms if n["poste"]["id"] == "ECO008_P2"]
    assert len(concurrentes) == 2
    r = c.post(B + f"jeux/{jeu}/nominations/{concurrentes[0]['id']}/valider/", {"reference": "DEC-X", "auteur": "A"},
               content_type="application/json")
    assert r.status_code == 200, r.content
    r = c.post(B + f"jeux/{jeu}/nominations/{concurrentes[1]['id']}/valider/", {"reference": "DEC-Y", "auteur": "A"},
               content_type="application/json")
    assert r.status_code == 409, r.content

    mouvements = get(c, f"jeux/{jeu}/mouvements/", type="nomination", taille=100)["resultats"]
    assert len(mouvements) == 5 and sum(1 for m in mouvements if m["statut"] == "realise") == 1
    assert get(c, f"jeux/{jeu}/mouvements/controles/")["ok"] is True


def test_generation_automatique_sur_le_jeu(drh, jeu):
    c = drh
    charger_sources(c, jeu)
    r = c.post(B + f"jeux/{jeu}/nominations/generer/", {"annee": "N+1", "auteur": "Agent"},
               content_type="application/json")
    assert r.status_code == 200, r.content
    bilan = r.json()
    # 9 postes verts : jamais de zone rouge, jamais d'anglophone sur un poste francophone.
    assert bilan["proposees"] == 9 and bilan["postes_sans_candidat"] == 2
    proposees = get(c, f"jeux/{jeu}/nominations/", statut="proposee", taille=100)["resultats"]
    assert all(n["poste"]["zone_securite"] != "rouge" for n in proposees)
    assert all(n["personne"]["sous_systeme"] == "francophone" for n in proposees)
