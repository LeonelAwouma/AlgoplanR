"""Protection des décisions réelles : une simulation reste librement consultable, mais figer des quotas ou valider un
mouvement individuel exige que les réserves qui pèsent sur le résultat soient reconnues explicitement."""
import pytest

from contextes.donnees.models import JeuDeDonnees
from contextes.nominations.services import sources_discordantes
from contextes.planification import services as pl
from tests.outils_acces import B
from tests.test_import_flexible import J, _jeu_complet, _jeu_seul

pytestmark = pytest.mark.django_db


def _valider(client, jeu, **corps):
    return client.post(B + f"jeux/{jeu}/quotas/valider/", {"annee": "N+1", "auteur": "DRH", **corps}, content_type=J)


def _detail(client, jeu, type_, action):
    liste = client.get(B + f"jeux/{jeu}/journal-audit/", {"type": type_}).json()["resultats"]
    ident = next(e["id"] for e in liste if e["action"] == action)
    return client.get(B + f"jeux/{jeu}/journal-audit/{ident}/").json()


def _quotas_n1(client, jeu):
    return client.get(B + f"jeux/{jeu}/quotas/", {"annee": "N+1"}).json()


def test_consultations_et_simulations_exploratoires_ne_sont_jamais_bloquees(drh):
    """Résultats provisoires ou conditionnels : tout reste consultable, seule la décision est protégée."""
    j, _, _ = _jeu_seul(drh)
    jid = j["id"]
    for url in ("planification/", "planification/previsionnel/", "planification/rapport/", "quotas/", "indicateurs/",
                "rapports/territorial/", "synthese/", "diagnostic/", "priorites/"):
        assert drh.get(B + f"jeux/{jid}/{url}").status_code == 200, url
    assert drh.post(B + f"jeux/{jid}/planification/recalculer/", {}, content_type=J).status_code == 200
    assert drh.put(B + f"jeux/{jid}/hypotheses/", {}, content_type=J).status_code in (200, 422)   # pas un blocage nominatif


def test_valider_des_quotas_sans_retraites_calculables_exige_la_reconnaissance(drh):
    j, _, _ = _jeu_seul(drh)
    jid = j["id"]
    r = _valider(drh, jid)
    assert r.status_code == 422 and r.json()["code"] == "validation_reserves", r.content
    reserves = {x["code"]: x for x in r.json()["details"]["reserves"]}
    assert "retraites_non_calculables" in reserves
    assert "indisponible" in reserves["retraites_non_calculables"]["detail"]
    assert all(q["statut"] != "valide" for q in _quotas_n1(drh, jid))        # rien n'est figé
    # Reconnaître une réserve ne suffit pas : toutes celles qui pèsent sur les quotas doivent l'être.
    autres = [c for c in reserves if c != "retraites_non_calculables"]
    if autres:
        r = _valider(drh, jid, reserves_reconnues=["retraites_non_calculables"])
        assert r.status_code == 422
        marques = {x["code"]: x["reconnue"] for x in r.json()["details"]["reserves"]}
        assert marques["retraites_non_calculables"] is True and not any(marques[c] for c in autres)
    r = _valider(drh, jid, reserves_reconnues=list(reserves))
    assert r.status_code == 200, r.content
    assert all(q["statut"] == "valide" for q in _quotas_n1(drh, jid))
    # Trace : réserves reconnues au journal et à l'historique des quotas.
    evt = [e for e in drh.get(B + f"jeux/{jid}/journal-audit/", {"type": "quota"}).json()["resultats"]
           if e["action"] == "validation"]
    assert evt
    hist = drh.get(B + f"jeux/{jid}/quotas/historique/", {"annee": "N+1"}).json()
    assert any("retraites_non_calculables" in (h["motif"] or "") for h in hist if h["evenement"] == "validation")


def test_un_depassement_du_plafond_exige_une_reference_administrative(drh, monkeypatch):
    j, _, _ = _jeu_complet(drh)
    jid = j["id"]
    avant = pl.annees

    def avec_depassement(ctx, p, ecoles=None, suivi=True):
        lignes = avant(ctx, p, ecoles, suivi=suivi)
        return [{**l, "plafond": 64, "plancher_retraites": 84, "depassement_plafond": 20} for l in lignes]
    monkeypatch.setattr(pl, "annees", avec_depassement)
    r = _valider(drh, jid)
    assert r.status_code == 422
    assert r.json()["details"]["reference_requise"] is True
    codes = [x["code"] for x in r.json()["details"]["reserves"]]
    assert "depassement_plafond" in codes
    r = _valider(drh, jid, reserves_reconnues=codes)             # reconnu mais sans référence : refusé
    assert r.status_code == 422 and any("référence" in m for m in r.json()["motifs"])
    r = _valider(drh, jid, reserves_reconnues=codes, reference_administrative="Décision budgétaire 12/2027")
    assert r.status_code == 200, r.content
    ev = _detail(drh, jid, "quota", "validation")
    assert ev["apres"]["reference_administrative"] == "Décision budgétaire 12/2027"
    assert "depassement_plafond" in ev["apres"]["reserves_reconnues"]


def test_annee_non_confirmee_est_une_reserve(drh):
    j, _, _ = _jeu_complet(drh)
    jeu = JeuDeDonnees.objects.get(pk=j["id"])
    jeu.sens_annee_scolaire = "non_confirme"
    jeu.save()
    r = _valider(drh, j["id"])
    assert "annee_non_confirmee" in [x["code"] for x in r.json()["details"]["reserves"]]


def test_delegue_valide_ses_quotas_avec_les_memes_reserves(centre):
    from tests.test_import_flexible import _fichier
    r = centre.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 120}, content_type=J)
    jid = r.json()["id"]
    r = _valider(centre, jid)
    assert r.status_code == 422 and r.json()["code"] == "validation_reserves"
    codes = [x["code"] for x in r.json()["details"]["reserves"]]
    r = _valider(centre, jid, reserves_reconnues=codes)
    assert r.status_code in (200, 422)               # 422 seulement si une référence de dépassement manque
    if r.status_code == 422:
        assert any("référence" in m for m in r.json()["motifs"])


# --- D6 : sources discordantes et décision individuelle --------------------------------------------------------

def test_sources_discordantes_detectees_ecole_par_ecole(drh):
    j, etab, ens = _jeu_complet(drh)
    jeu = JeuDeDonnees.objects.get(pk=j["id"])
    ids = [l["Identifiant_Ecole"] for l in etab]
    ecarts = sources_discordantes(jeu, ids)
    assert ecarts and all(e["stock_declare"] != e["agents_nominatifs"] for e in ecarts)
    sans = _jeu_seul(drh)[0]
    assert sources_discordantes(JeuDeDonnees.objects.get(pk=sans["id"]), ids) == []     # rien à comparer


def test_valider_une_nomination_sur_sources_discordantes_exige_une_verification(drh):
    jid = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 40, "nb_enseignants": 300}, content_type=J).json()["id"]
    sc = next(s for s in drh.get(B + f"jeux/{jid}/scenarios/").json() if s["code"] == "geo_departement")
    drh.put(B + f"jeux/{jid}/scenario-retenu/", {"scenario": str(sc["id"])}, content_type=J)
    bilan = drh.post(B + f"jeux/{jid}/nominations/generer/", {"annee": "N+1", "auteur": "A"}, content_type=J).json()
    assert bilan["proposees"] > 0
    noms = drh.get(B + f"jeux/{jid}/nominations/", {"statut": "proposee", "taille": 100}).json()["resultats"]
    refusees = ok = 0
    for n in noms[:8]:
        r = drh.post(B + f"jeux/{jid}/nominations/{n['id']}/valider/", {"reference": "D", "auteur": "A"},
                     content_type=J)
        if r.status_code == 422:
            assert r.json()["code"] == "verification_sources_requise" and r.json()["details"]["ecoles"]
            refusees += 1
            r = drh.post(B + f"jeux/{jid}/nominations/{n['id']}/valider/",
                         {"reference": "D", "auteur": "A", "verification_sources": True}, content_type=J)
            assert r.status_code in (200, 409)
        else:
            ok += 1
    assert refusees > 0                                       # le jeu de démonstration a des écoles discordantes
    liste = drh.get(B + f"jeux/{jid}/journal-audit/", {"type": "nomination", "taille": 50}).json()["resultats"]
    details = [drh.get(B + f"jeux/{jid}/journal-audit/{e['id']}/").json() for e in liste if e["action"] == "validee"]
    assert any("verification_sources_reconnue" in (d["apres"] or {}) for d in details)
