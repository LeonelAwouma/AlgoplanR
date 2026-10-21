"""Validation normale ou avec réserve DRH, faits du Prince réévalués après actualisation, aperçu complet."""
from pathlib import Path
from types import SimpleNamespace

import pytest

B = "/api/v1/"
DOSSIER = Path(__file__).resolve().parents[1] / "jeux_de_test" / "nominations"
pytestmark = pytest.mark.django_db


@pytest.fixture
def jeu(drh):
    def envoyer(nom, type_fichier):
        with open(DOSSIER / nom, "rb") as f:
            r = drh.post(B + "fichiers/", {"fichier": f, "type": type_fichier})
        assert r.status_code == 201, r.content
        return r.json()["id"]
    r = drh.post(B + "jeux/", {"fichier_etablissements": envoyer("etablissements.xlsx", "etablissements"),
                               "fichier_enseignants": envoyer("enseignants.xlsx", "enseignants"), "nom": "Réserve"})
    assert r.status_code == 201, r.content
    return r.json()["id"]


def _post(c, chemin, corps):
    return c.post(B + chemin, corps, content_type="application/json")


def _controles(c, jeu):
    return {x["code"]: x for x in c.get(B + f"jeux/{jeu}/validation/").json()["controles"]}


def _fait_avec_ecart(c, jeu):
    """Un fait du Prince vers une école dont l'effectif déclaré diffère des matricules (cas de presque toutes ici)."""
    assert _post(c, f"jeux/{jeu}/faits-prince/", {"id_ens": "MAT00229", "id_etab": "ECO011"}).status_code == 201
    assert not _controles(c, jeu)["effectifs_prince"]["ok"]


def test_validation_normale_sans_ecart(drh, jeu):
    c = _controles(drh, jeu)
    assert c["effectifs_prince"]["derogeable"] is True
    assert all(not x["derogeable"] for k, x in c.items() if k != "effectifs_prince")
    r = _post(drh, f"jeux/{jeu}/validation/", {"auteur": "DRH"})
    assert r.status_code == 200, r.content
    assert r.json()["statut"] == "valide" and r.json()["reserve"] is None


def test_un_ecart_bloque_sans_reserve_mais_la_derogation_est_proposee(drh, jeu):
    _fait_avec_ecart(drh, jeu)
    r = _post(drh, f"jeux/{jeu}/validation/", {"auteur": "DRH"})
    assert r.status_code == 422 and r.json()["code"] == "validation_bloquee"
    assert r.json()["details"]["derogation_possible"] is True
    # Un motif vide ou blanc ne vaut pas justification.
    assert _post(drh, f"jeux/{jeu}/validation/", {"auteur": "DRH", "reserve": "   "}).status_code == 422
    assert drh.get(B + f"jeux/{jeu}/validation/").json()["statut"] == "brouillon"


def test_validation_avec_reserve_tracee_et_reprise_dans_le_rapport(drh, jeu):
    _fait_avec_ecart(drh, jeu)
    r = _post(drh, f"jeux/{jeu}/validation/", {"auteur": "Chef DRH", "reserve": "Liste nominative en cours de mise à jour"})
    assert r.status_code == 200, r.content
    v = r.json()
    assert v["statut"] == "valide"
    assert v["reserve"]["motif"] == "Liste nominative en cours de mise à jour" and v["reserve"]["auteur"] == "Chef DRH"
    assert [x["code"] for x in v["reserve"]["controles"]] == ["effectifs_prince"]
    rapport = drh.get(B + f"jeux/{jeu}/rapport/").json()
    assert rapport["jeu"]["statut"] == "valide" and rapport["jeu"]["reserve_drh"]["motif"].startswith("Liste nominative")
    from contextes.audit.models import EvenementAudit
    assert EvenementAudit.objects.filter(jeu_id=jeu, resume__startswith="Jeu validé avec réserve DRH").exists()


def test_la_reserve_est_reservee_a_la_drh(drh, jeu):
    from contextes.commun.erreurs import RefusMetier
    from contextes.donnees import services
    from contextes.donnees.models import JeuDeDonnees
    _fait_avec_ecart(drh, jeu)
    j = JeuDeDonnees.objects.get(id=jeu)
    delegue = SimpleNamespace(user=SimpleNamespace(est_drh=False))
    with pytest.raises(RefusMetier) as exc:
        services.valider(j, request=delegue, auteur="Délégué", reserve="Je passe outre")
    assert exc.value.code == "derogation_reservee_drh"
    j.refresh_from_db()
    assert j.statut == "brouillon" and j.validation_reserve is None


def test_une_incoherence_structurelle_ne_se_deroge_jamais(drh, jeu):
    """Fait impossible (matricule inconnu) : refus même avec réserve motivée."""
    from contextes.prince.models import FaitPrince
    from contextes.donnees.models import JeuDeDonnees
    FaitPrince.objects.create(jeu=JeuDeDonnees.objects.get(id=jeu), id_ens="MAT_FANTOME", id_etab="ECO011", motif="x")
    assert not _controles(drh, jeu)["faits_prince"]["ok"]
    r = _post(drh, f"jeux/{jeu}/validation/", {"auteur": "DRH", "reserve": "Je veux passer"})
    assert r.status_code == 422 and r.json()["details"]["derogation_possible"] is False
    assert "faits du Prince" in str(r.json()).lower() or "Prince" in str(r.json())


def test_effectifs_negatifs_non_derogeables():
    from domaine.donnees.modeles import Ecole
    from domaine.donnees.validation import controles_validation
    controles = {c["code"]: c for c in controles_validation([Ecole(id="E", enseignants_actuels=-2)], [])}
    assert controles["effectifs_negatifs"]["bloquant"] and not controles["effectifs_negatifs"]["ok"]
    assert controles["effectifs_negatifs"]["derogeable"] is False


def test_un_fait_devenu_impossible_est_invalide_et_signale(drh, jeu):
    """Après actualisation, un fait que les nouvelles données rendent impossible n'est pas appliqué en silence."""
    from contextes.donnees import services
    from contextes.donnees.models import JeuDeDonnees
    from contextes.prince.models import FaitPrince
    j = JeuDeDonnees.objects.get(id=jeu)
    bon = FaitPrince.objects.create(jeu=j, id_ens="MAT00229", id_etab="ECO011", motif="valide")
    # MAT00001 est déjà rattaché à ECO019 : la décision est impossible (l'agent est déjà dans l'école de destination).
    mauvais = FaitPrince.objects.create(jeu=j, id_ens="MAT00001", id_etab="ECO019", motif="devenu impossible")
    invalidees = services._reevaluer_faits_prince(j)
    bon.refresh_from_db(), mauvais.refresh_from_db()
    assert [i["id"] for i in invalidees] == [str(mauvais.pk)]
    assert bon.statut == "ACTIF" and mauvais.statut == "INVALIDE"
    assert "déjà rattaché" in mauvais.motif_invalidite
    liste = {f["id"]: f for f in drh.get(B + f"jeux/{jeu}/faits-prince/").json()}
    assert liste[mauvais.pk]["statut"] == "INVALIDE" and "déjà rattaché" in liste[mauvais.pk]["motif_invalidite"]
    assert [f["id_ens"] for f in __import__("contextes.simulation.services", fromlist=["x"]).faits_prince_actifs(j)] == ["MAT00229"]


def test_apercu_liste_aussi_les_enseignants_qui_perdent_leur_affectation(drh, jeu):
    """L'agent déplacé prend un poste ouvert : un autre agent du vivier qui l'aurait eu perd son affectation."""
    sc = next(s for s in drh.get(B + f"jeux/{jeu}/scenarios/").json() if s["code"] == "geo_region")
    viv = drh.get(B + f"jeux/{jeu}/scenarios/{sc['id']}/vivier/", {"taille": 500}).json()["resultats"]
    cibles = {a["id_etab"] for a in drh.get(
        B + f"jeux/{jeu}/scenarios/{sc['id']}/affectations/", {"taille": 500}).json()["resultats"]}
    trouve = None
    for v in viv[:40]:
        for ecole in sorted(cibles)[:6]:
            r = _post(drh, f"jeux/{jeu}/faits-prince/impact/", {"id_ens": v["Matricule_Enseignant"], "id_etab": ecole})
            if r.status_code != 200:
                continue
            perdants = [m for m in r.json()["affectations_modifiees"] if m["apres"] is None]
            if perdants:
                trouve = (r.json(), perdants)
                break
        if trouve:
            break
    if trouve is None:
        pytest.skip("aucun fait de ce jeu ne fait perdre son affectation à un autre agent")
    _, perdants = trouve
    assert all(m["avant"] for m in perdants)


def test_base_enseignants_distingue_region_initiale_et_region_apres_decision(drh, jeu):
    from contextes.donnees import depots
    from contextes.donnees.models import JeuDeDonnees
    j = JeuDeDonnees.objects.get(id=jeu)
    ecoles = {e.id: e for e in depots.charger_ecoles(j)}
    ens = {t.matricule: t for t in depots.charger_enseignants(j)}
    mat, origine = next((m, t.ecole_attache) for m, t in ens.items() if t.ecole_attache in ecoles)
    destination = next(e.id for e in ecoles.values() if e.region != ecoles[origine].region)
    r_init, r_apres = ecoles[origine].region, ecoles[destination].region
    assert _post(drh, f"jeux/{jeu}/faits-prince/", {"id_ens": mat, "id_etab": destination}).status_code == 201

    def ligne(region):
        page = drh.get(B + f"jeux/{jeu}/faits-prince/bases/enseignants/", {"region": region, "q": mat}).json()
        return next((x for x in page["resultats"] if x["Matricule_Enseignant"] == mat), None)

    # L'agent reste visible dans sa région initiale ET dans la région de destination, avec les deux régions en colonnes.
    for region in (r_init, r_apres):
        l = ligne(region)
        assert l is not None, region
        assert l["Region_Initiale"] == r_init and l["Region_Apres_Decision"] == r_apres
        assert l["Ecole_Initiale"] == origine and l["Ecole_Attache_Actuelle"] == destination
