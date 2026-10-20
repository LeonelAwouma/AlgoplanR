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
