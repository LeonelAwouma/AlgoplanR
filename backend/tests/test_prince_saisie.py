"""Saisie des faits du Prince : plus limitée au vivier, atomique, aperçu calculé par le serveur ; effectifs réconciliés."""
from pathlib import Path

import pytest

from domaine.diagnostic.indicateurs import enrichir_ecoles
from domaine.donnees.modeles import Ecole, Enseignant
from domaine.donnees.validation import controles_validation
from domaine.parametrage.config import defaut
from domaine.prince.faits import MOTIF_FAIT_ACTIF, motifs_de_refus
from domaine.prince.projection import APPLIQUE_AVEC_ALERTE, appliquer_effets_prince
from domaine.qualite.rapport import controler, reconcilier_effectifs

B = "/api/v1/"
DOSSIER = Path(__file__).resolve().parents[1] / "jeux_de_test" / "nominations"


# --- domaine -------------------------------------------------------------------------------------------------------

def _ecole(ident, eleves, enseignants, salles=7):
    return Ecole(id=ident, sous_systeme="Francophone", region="Centre", departement="Mfoundi", commune="Yaoundé",
                 effectif_eleves=eleves, enseignants_actuels=enseignants, salles_simple_flux=salles, nom=ident)


def _ens(mat, ecole, anciennete=10):
    return Enseignant(matricule=mat, ecole_attache=ecole, sous_systeme="Francophone", anciennete_poste=anciennete,
                      age=40)


def test_les_rejets_du_pretraitement_deviennent_des_motifs_de_refus():
    assert motifs_de_refus(["Décision en doublon pour ce matricule"]) == [MOTIF_FAIT_ACTIF]
    assert motifs_de_refus(["Plusieurs décisions contradictoires pour ce matricule",
                            "Décision en doublon pour ce matricule"]) == [MOTIF_FAIT_ACTIF]
    assert motifs_de_refus(["École de destination inconnue : X"]) == ["École de destination inconnue : X"]


def test_l_ecole_de_destination_qui_passe_en_excedent_est_signalee():
    cfg = defaut()
    # B (180 élèves) a déjà 6 maîtres pour une dotation de 6 : un de plus la fait passer en excédent.
    ecoles = enrichir_ecoles([_ecole("A", 240, 5), _ecole("B", 180, 6)], cfg)
    assert ecoles[1].ind.xe == 0
    app = appliquer_effets_prince(ecoles, [_ens("X", "A")], [{"id_ens": "X", "id_etab": "B", "motif": "d"}], cfg)
    d = app.decisions[0]
    assert d.statut == APPLIQUE_AVEC_ALERTE
    assert any("destination passe en excédent" in a for a in d.alertes)
    # Une école de destination en déficit n'a pas cette alerte.
    ecoles = enrichir_ecoles([_ecole("A", 240, 5), _ecole("B", 180, 3)], cfg)
    app = appliquer_effets_prince(ecoles, [_ens("X", "A")], [{"id_ens": "X", "id_etab": "B", "motif": "d"}], cfg)
    assert not any("passe en excédent" in a for a in app.decisions[0].alertes)


def test_les_ecarts_des_ecoles_touchees_sont_bloquants_pour_la_validation():
    cfg = defaut()
    ecoles = enrichir_ecoles([_ecole("A", 240, 5), _ecole("B", 180, 3)], cfg)
    app = appliquer_effets_prince(ecoles, [_ens("X", "A")], [{"id_ens": "X", "id_etab": "B", "motif": "d"}], cfg)
    assert app.ecarts_effectifs and all(e["bloquant"] for e in app.ecarts_effectifs)
    controles = {c["code"]: c for c in controles_validation(ecoles, [_ens("X", "A")], None, app.ecarts_effectifs)}
    assert controles["effectifs_prince"]["bloquant"] and not controles["effectifs_prince"]["ok"]
    propres = {c["code"]: c for c in controles_validation(ecoles, [_ens("X", "A")], None, [])}
    assert propres["effectifs_prince"]["ok"]


def test_reconciliation_des_effectifs_de_toutes_les_ecoles():
    lignes_etab = [{"Identifiant_Ecole": "A", "Enseignants_Actuels": 3}, {"Identifiant_Ecole": "B", "Enseignants_Actuels": 1},
                   {"Identifiant_Ecole": "C", "Enseignants_Actuels": 2}, {"Identifiant_Ecole": "D", "Enseignants_Actuels": ""}]
    lignes_ens = [{"Matricule_Enseignant": f"M{i}", "Ecole_Attache_Actuelle": e}
                  for i, e in enumerate(["A", "A", "B", "B", "C", "C"])]
    r = reconcilier_effectifs(lignes_etab, lignes_ens)
    assert (r["ecoles_comparees"], r["ecoles_en_ecart"], r["ecoles_sans_effectif_declare"]) == (3, 2, 1)
    assert {e["id_ecole"]: e["ecart"] for e in r["ecoles"]} == {"A": 1, "B": -1}
    assert r["ecart_total"] == 0 and r["ecart_absolu_total"] == 2
    rapport = controler(lignes_etab, lignes_ens, defaut())
    assert rapport["valide"] and any(a["code"] == "ECART_EFFECTIFS" for a in rapport["avertissements"])
    assert rapport["reconciliation_effectifs"]["ecoles_en_ecart"] == 2
    # Sans colonne d'effectif, la comparaison n'est pas possible (et n'est pas inventée).
    assert reconcilier_effectifs([{"Identifiant_Ecole": "A"}], lignes_ens) is None


# --- API -----------------------------------------------------------------------------------------------------------

@pytest.fixture
def jeu(drh):
    def envoyer(nom, type_fichier):
        with open(DOSSIER / nom, "rb") as f:
            r = drh.post(B + "fichiers/", {"fichier": f, "type": type_fichier})
        assert r.status_code == 201, r.content
        return r.json()["id"]
    r = drh.post(B + "jeux/", {"fichier_etablissements": envoyer("etablissements.xlsx", "etablissements"),
                               "fichier_enseignants": envoyer("enseignants.xlsx", "enseignants"), "nom": "Saisie"})
    assert r.status_code == 201, r.content
    return r.json()["id"]


def _post(c, jeu, chemin, corps):
    return c.post(B + f"jeux/{jeu}/{chemin}", corps, content_type="application/json")


@pytest.mark.django_db
def test_un_fait_hors_vivier_est_accepte_avec_alertes(drh, jeu):
    # MAT00001 : école d'attache non excédentaire, ancienneté faible. Refusé quand le fait se limitait au vivier.
    r = _post(drh, jeu, "faits-prince/", {"id_ens": "MAT00001", "id_etab": "ECO011", "motif": "Décision"})
    assert r.status_code == 201, r.content
    alertes = " | ".join(r.json()["alertes"])
    assert "n'a pas d'enseignant excédentaire" in alertes and "Ancienneté" in alertes
    # Les impossibilités matérielles restent refusées.
    assert _post(drh, jeu, "faits-prince/", {"id_ens": "MAT00001", "id_etab": "ECO014"}).status_code == 422
    for corps in ({"id_ens": "MAT99999", "id_etab": "ECO011"}, {"id_ens": "MAT00130", "id_etab": "ECO999"},
                  {"id_ens": "MAT00002", "id_etab": "ECO999"}):
        r = _post(drh, jeu, "faits-prince/", corps)
        assert r.status_code == 422 and r.json()["motifs"], corps
    deja = _post(drh, jeu, "faits-prince/", {"id_ens": "MAT00001", "id_etab": "ECO014"})
    assert MOTIF_FAIT_ACTIF in deja.json()["motifs"]


@pytest.mark.django_db
def test_apercu_calcule_par_le_serveur(drh, jeu):
    r = _post(drh, jeu, "faits-prince/impact/", {"id_ens": "MAT00001", "id_etab": "ECO011"})
    assert r.status_code == 200, r.content
    d = r.json()
    assert d["enregistre"] is False and d["origine"]["id"] == "ECO019" and d["destination"]["id"] == "ECO011"
    for ecole, variation in ((d["origine"], -1), (d["destination"], +1)):
        assert ecole["apres"]["effectif"] == ecole["avant"]["effectif"] + variation
        assert {"effectif", "besoin", "excedent", "nom"} <= set(ecole["avant"])
    assert d["alertes"] and "ecart" in d
    # Les chiffres de l'aperçu sont ceux que le serveur applique ensuite.
    assert drh.get(B + f"jeux/{jeu}/faits-prince/").json() == []
    assert _post(drh, jeu, "faits-prince/", {"id_ens": "MAT00001", "id_etab": "ECO011"}).status_code == 201
    app = drh.get(B + f"jeux/{jeu}/faits-prince/application/").json()
    d1 = app["decisions"][0]
    assert d1["Enseignants_Destination_Apres"] == d["destination"]["apres"]["effectif"]
    assert d1["Besoin_Destination_Apres"] == d["destination"]["apres"]["besoin"]
    assert d1["Besoin_Origine_Apres"] == d["origine"]["apres"]["besoin"]


@pytest.mark.django_db
def test_ajout_atomique_si_le_recalcul_echoue(drh, jeu, monkeypatch):
    from contextes.donnees.models import JeuDeDonnees
    from contextes.prince import services
    from contextes.prince.models import FaitPrince
    from contextes.simulation import services as sim

    j = JeuDeDonnees.objects.get(id=jeu)

    def echec(_jeu):
        raise RuntimeError("recalcul impossible")
    monkeypatch.setattr(sim, "recalculer_scenarios", echec)
    with pytest.raises(RuntimeError):
        services.ajouter(j, "MAT00001", "ECO011", "Décision")
    assert FaitPrince.objects.filter(jeu=j).count() == 0


@pytest.mark.django_db
def test_import_atomique_et_un_seul_recalcul(drh, jeu, monkeypatch):
    from contextes.donnees.models import JeuDeDonnees
    from contextes.prince import services
    from contextes.prince.models import FaitPrince
    from contextes.simulation import services as sim

    j = JeuDeDonnees.objects.get(id=jeu)
    lignes = [{"id_ens": "MAT00229", "id_etab": "ECO011", "motif": "a"},
              {"id_ens": "MAT00094", "id_etab": "ECO014", "motif": "b"},
              {"id_ens": "MAT00001", "id_etab": "ECO011", "motif": "c"}]
    appels = []
    reel = sim.recalculer_scenarios
    monkeypatch.setattr(sim, "recalculer_scenarios", lambda x: appels.append(1) or reel(x))
    bilan = services.importer(j, lignes)
    assert len(bilan["acceptees"]) == 3 and len(appels) == 1
    assert FaitPrince.objects.filter(jeu=j).count() == 3

    FaitPrince.objects.filter(jeu=j).delete()

    def echec(_jeu):
        raise RuntimeError("recalcul impossible")
    monkeypatch.setattr(sim, "recalculer_scenarios", echec)
    with pytest.raises(RuntimeError):
        services.importer(j, lignes)
    assert FaitPrince.objects.filter(jeu=j).count() == 0


@pytest.mark.django_db
def test_import_avec_matricule_repete_une_correction_apres_une_erreur_est_retenue(drh, jeu):
    from contextes.donnees.models import JeuDeDonnees
    from contextes.prince import services
    j = JeuDeDonnees.objects.get(id=jeu)
    bilan = services.importer(j, [
        {"id_ens": "MAT00229", "id_etab": "ECO999", "motif": "erreur de saisie"},     # école inconnue : rejetée
        {"id_ens": "MAT00229", "id_etab": "ECO011", "motif": "correction"},           # la correction est retenue
        {"id_ens": "MAT00094", "id_etab": "ECO014", "motif": "a"},
        {"id_ens": "MAT00094", "id_etab": "ECO012", "motif": "doublon"},              # doublon d'une ligne retenue
    ])
    assert [(l["id_ens"], l["id_etab"]) for l in bilan["acceptees"]] == [("MAT00229", "ECO011"), ("MAT00094", "ECO014")]
    refus = {(l["id_ens"], l["id_etab"]): l["motifs"][0] for l in bilan["refusees"]}
    assert "École de destination inconnue" in refus[("MAT00229", "ECO999")]
    assert refus[("MAT00094", "ECO012")].startswith("Doublon dans le fichier") and "ligne" in refus[("MAT00094", "ECO012")]
    assert len(bilan["refusees"]) == 2


@pytest.mark.django_db
def test_ecole_de_reference_et_destination_decidee(drh, jeu):
    assert _post(drh, jeu, "faits-prince/", {"id_ens": "MAT00001", "id_etab": "ECO011"}).status_code == 201
    liste = drh.get(B + f"jeux/{jeu}/enseignants/", {"q": "MAT00001"}).json()["resultats"]
    ligne = next(l for l in liste if l["Matricule_Enseignant"] == "MAT00001")
    assert ligne["fait_prince"] is True
    assert ligne["ecole_reference"] == "ECO019" and ligne["Ecole_Attache_Actuelle"] == "ECO011"
    assert ligne["nom_ecole_reference"]
    autre = drh.get(B + f"jeux/{jeu}/enseignants/", {"q": "MAT00002"}).json()["resultats"]
    ligne2 = next(l for l in autre if l["Matricule_Enseignant"] == "MAT00002")
    assert ligne2["fait_prince"] is False and ligne2["ecole_reference"] == ligne2["Ecole_Attache_Actuelle"]
    # L'affectation du fait porte aussi l'école d'origine (export Excel des faits du Prince).
    sc = next(s for s in drh.get(B + f"jeux/{jeu}/scenarios/").json() if s["code"] == "geo_departement")
    aff = drh.get(B + f"jeux/{jeu}/scenarios/{sc['id']}/affectations/", {"phase": "effet_de_prince", "taille": 50})
    item = next(a for a in aff.json()["resultats"] if a["id_ens"] == "MAT00001")
    assert item["id_etab_origine"] == "ECO019" and item["id_etab"] == "ECO011"


@pytest.mark.django_db
def test_validation_du_jeu_et_ecarts_d_effectifs_des_ecoles_touchees(drh, jeu):
    def controles():
        return {c["code"]: c for c in drh.get(B + f"jeux/{jeu}/validation/").json()["controles"]}
    avant = controles()
    assert avant["effectifs_prince"]["ok"] and avant["effectifs_prince"]["bloquant"]
    assert "effectifs" in avant and avant["effectifs"]["bloquant"] is False
    assert _post(drh, jeu, "faits-prince/", {"id_ens": "MAT00001", "id_etab": "ECO011"}).status_code == 201
    ecarts = drh.get(B + f"jeux/{jeu}/faits-prince/application/").json()["ecarts_effectifs"]
    apres = controles()["effectifs_prince"]
    # Le contrôle bloquant reflète exactement les écarts des écoles touchées par le fait.
    assert apres["ok"] is (not ecarts)
    assert all(e["bloquant"] for e in ecarts)


@pytest.mark.django_db
def test_rem_avant_est_celui_des_bases_importees_et_respecte_le_perimetre(drh, jeu):
    from collections import defaultdict
    from contextes.donnees import depots
    from contextes.donnees.models import JeuDeDonnees
    ecoles = depots.charger_ecoles(JeuDeDonnees.objects.get(id=jeu))
    declares = defaultdict(float)
    for e in ecoles:
        declares[e.region] += e.enseignants_actuels
    # MAT00229 -> ECO011 et MAT00094 -> ECO014 : deux faits du Prince qui déplacent des effectifs déclarés.
    for mat, ecole in (("MAT00229", "ECO011"), ("MAT00094", "ECO014"), ("MAT00001", "ECO011")):
        assert _post(drh, jeu, "faits-prince/", {"id_ens": mat, "id_etab": ecole}).status_code == 201
    sc = next(s for s in drh.get(B + f"jeux/{jeu}/scenarios/").json() if s["code"] == "geo_departement")
    url = B + f"jeux/{jeu}/scenarios/{sc['id']}/encadrement/"
    d = drh.get(url).json()
    # Avant = effectifs déclarés des bases importées, quels que soient les faits du Prince.
    assert d["national"]["enseignants_avant"] == round(sum(declares.values()))
    assert {r["territoire"]: r["enseignants_avant"] for r in d["par_region"]} == {
        (k or "Région non renseignée"): round(v) for k, v in declares.items()}
    # Après : le Prince déplace des effectifs d'une école à l'autre, sans changer le total national des faits.
    assert d["national"]["enseignants_apres"] != 0
    # Un périmètre restreint la comparaison à sa région, avec son libellé.
    region = ecoles[0].region
    r = drh.get(url, {"region": region}).json()
    assert r["national"]["territoire"] == region
    assert [x["territoire"] for x in r["par_region"]] == [region]
    assert r["national"]["enseignants_avant"] == round(declares[region])


@pytest.mark.django_db
def test_la_recherche_signale_un_agent_deja_deplace(drh, jeu):
    def item():
        r = drh.get(B + f"jeux/{jeu}/recherche/enseignants/", {"q": "MAT00001"}).json()
        return next(x for x in r["resultats"] if x["Matricule_Enseignant"] == "MAT00001")
    assert item()["fait_prince"] is False
    assert _post(drh, jeu, "faits-prince/", {"id_ens": "MAT00001", "id_etab": "ECO011"}).status_code == 201
    assert item()["fait_prince"] is True
