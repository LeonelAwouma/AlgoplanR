"""Planification et nominations, domaine pur : paramètres DRH (codeSource), départs, projection, cycle de vie."""
import pytest

from domaine.donnees.modeles import Ecole, Enseignant
from domaine.nominations import cycle
from domaine.parametrage.config import defaut
from domaine.planification import parametres as par
from domaine.planification.projection import annee_depart, calculer_annees, projeter_ecoles
from domaine.planification.suivi import appliquer_suivi


def test_normaliser_drh_comme_codesource():
    p = par.normaliser_drh()
    assert p["A_AUT_PRI_PCT"] == pytest.approx(2.25) and p["A_AUT_MAT_PCT"] == 1.70
    p = par.normaliser_drh({"A_TOT_PRI_PCT": 150, "AGE_RETRAITE": 80, "ETAL_N": 0, "REM_REF_PRI": 1, "PLAF_PRI": -3})
    assert (p["A_TOT_PRI_PCT"], p["AGE_RETRAITE"], p["ETAL_N"], p["REM_REF_PRI"], p["PLAF_PRI"]) == (100, 75, 1, 5, 0)
    assert p["A_AUT_MAT_PCT"] == pytest.approx(min(100.0, round(1.70 * 100 / 3.33, 2)))
    assert par.normaliser_drh({"A_AUT_PRI_PCT_EXPLICIT": 1.5})["A_AUT_PRI_PCT"] == 1.5


def test_hypotheses_par_defaut_et_validation():
    h = par.hypotheses_par_defaut(defaut())
    assert h["attrition"]["taux_unique"] == pytest.approx(2.25) and h["retraite"]["age_legal"] == 60
    assert h["attrition"]["par_region"]["Centre"] == pytest.approx(3.0 - 1.08)
    ok, erreurs = par.valider_hypotheses(h)
    assert erreurs == [] and ok["drh"] == h["drh"]
    _, erreurs = par.valider_hypotheses({**h, "horizon": 0, "vivier": {**h["vivier"], "sources": ["inconnue"]}})
    assert any(e.startswith("horizon") for e in erreurs) and any(e.startswith("vivier") for e in erreurs)


def _hyp(**drh):
    h = par.hypotheses_par_defaut(defaut())
    h["attrition"]["taux_unique"] = 0
    h["drh"].update({"G_PRI_PCT": 0, "DIR_NOM_AN": 0, "PLAF_PRI": 0, "ETAL_N": 1, **drh})
    return h


def test_annee_de_depart():
    h = _hyp()
    assert annee_depart(59, h) == 1 and annee_depart(56, h) == 4 and annee_depart(55, h) is None
    assert annee_depart(62, h) == 0 and annee_depart(None, h) is None
    assert annee_depart(62, _hyp(CORR_60=False)) is None
    h["retraite"]["date_reference"] = "fin_annee_civile"
    assert annee_depart(59, h) == 0


def _jeu():
    ecole = Ecole(id="E1", region="Centre", departement="Mfoundi", commune="Yaounde", effectif_eleves=100,
                  enseignants_actuels=4, salles_simple_flux=6)          # De = 6, BMAX = 6, K = 6 : déficit initial 2
    ens = [Enseignant(matricule="A", ecole_attache="E1", age=59), Enseignant(matricule="B", ecole_attache="E1", age=62),
           Enseignant(matricule="C", ecole_attache="E1", age=30)]
    return [ecole], ens


def test_projection_calculee_a_la_main():
    ecoles, ens = _jeu()
    p, departs = projeter_ecoles(ecoles, ens, defaut(), _hyp())
    assert [d.matricule for d in departs] == ["A", "B"] and [d.annee for d in departs] == [1, 0]
    e = p[0]
    assert (e.effectif_initial, e.deficit_initial) == (4, 2)
    assert e.effectifs == [3, 2, 2, 2, 2] and e.besoins == [3, 4, 4, 4, 4] and e.cibles == [6] * 5
    a = calculer_annees(p, _hyp())
    # N+1 : besoin 3 (déficit initial 2 + retraite 1), rattrapé en un an ; quotas supposés recrutés.
    assert [x["besoin"] for x in a] == [3, 1, 0, 0, 0]
    assert [x["quota_calcule"] for x in a] == [3, 1, 0, 0, 0]
    assert [x["effectif_debut"] for x in a] == [4, 6, 6, 6, 6]
    # Rattrapage sur deux ans (ETAL_N) : le déficit initial se répartit.
    assert [x["quota_calcule"] for x in calculer_annees(p, _hyp(ETAL_N=2))][:2] == [2, 2]
    # Plafond rapporté à l'effectif (PLAF_PRI × 4 / 44 232 = 1), jamais sous les retraites de l'année.
    assert calculer_annees(p, _hyp(PLAF_PRI=11058))[0]["quota_calcule"] == 1
    # Croissance des élèves : la cible remonte (100 → 141 élèves, Pe = 3, K inchangé car De = 6).
    p2, _ = projeter_ecoles(ecoles, ens, defaut(), _hyp(G_PRI_PCT=41))
    assert p2[0].cibles[0] == 6


def test_suivi_des_decisions():
    ecoles, ens = _jeu()
    p, _ = projeter_ecoles(ecoles, ens, defaut(), _hyp())
    a = calculer_annees(p, _hyp())
    lieu = p[0].lieu()
    quotas = [{"annee": "N+1", "territoire": "Centre", "sous_systeme": "francophone", "retenu": 5, "statut": "ajuste"}]
    s = appliquer_suivi(a, {}, quotas=quotas, nominations=[{"annee": "N+1", "statut": "validee", "lieu": lieu}],
                        mouvements=[{"type": "redeploiement", "annee": "N+1", "statut": "realise", "lieu": lieu}],
                        recrutements_supposes=True)
    assert s[0]["quota_retenu"] == 5 and s[0]["nominations_prevues"] == 1 and s[0]["deploiements_realises"] == 1
    assert s[1]["effectif_debut"] == a[1]["effectif_debut"] + 2      # quota retenu 5 au lieu de 3
    assert s[0]["besoin_restant"] == 0
    assert appliquer_suivi(a, {"departement": "Mfoundi"}, quotas=quotas, nominations=[], mouvements=[],
                           recrutements_supposes=True)[0]["quota_retenu"] is None


def test_cycle_des_nominations():
    assert cycle.refus_transition("proposee", "validee") is None
    assert "définitive" in cycle.refus_transition("mise_en_oeuvre", "annulee")
    assert cycle.refus_transition("rejetee", "validee")
    assert cycle.disponibilite(["rejetee", "proposee"]) == "proposee"
    assert cycle.disponibilite(["mise_en_oeuvre"]) == "nommee" and cycle.statut_poste(["validee"]) == "reserve"
    ctl = cycle.controler_mouvements([{"id": "a", "matricule": "M", "poste": "P1", "decision": {"id": "1"}},
                                      {"id": "b", "matricule": "M", "poste": "P2", "decision": {"id": ""}}])
    assert {x["code"] for x in ctl["anomalies"]} == {"personne_comptee_deux_fois", "mouvement_sans_decision"}


# --- Rapport DRH : arrondi, ATTR_REG, scénarios, priorités ---------------------------------------------------------

def test_arrondi_des_autres_departs_comme_le_rapport():
    from domaine.planification.projection import arrondi
    assert arrondi(44232 * 2.25 / 100) == 995 and arrondi(2.5) == 3 and arrondi(0.49) == 0


def test_attr_reg_et_methode_designent_le_meme_choix():
    h = par.hypotheses_par_defaut(defaut())
    ok, _ = par.valider_hypotheses({**h, "attrition": {**h["attrition"], "methode": "par_region"}})
    assert ok["drh"]["ATTR_REG"] is True
    sans_methode = {k: v for k, v in h["attrition"].items() if k != "methode"}
    ok, _ = par.valider_hypotheses({**h, "attrition": sans_methode, "drh": {**h["drh"], "ATTR_REG": True}})
    assert ok["attrition"]["methode"] == "par_region"
    ok, _ = par.valider_hypotheses(h)
    assert ok["drh"]["ATTR_REG"] is False and ok["attrition"]["methode"] == "taux_unique"


def _jeu_regions():
    ecoles = [Ecole(id="N1", region="Nord", departement="Benoue", commune="Garoua", effectif_eleves=600,
                    enseignants_actuels=3, salles_simple_flux=6),
              Ecole(id="C1", region="Centre", departement="Mfoundi", commune="Yaounde", effectif_eleves=60,
                    enseignants_actuels=8, salles_simple_flux=6),
              Ecole(id="C2", region="Centre", departement="Mfoundi", commune="Yaounde", effectif_eleves=500,
                    enseignants_actuels=2, salles_simple_flux=6)]
    ens = [Enseignant(matricule=f"T{i}", ecole_attache=e, age=a, anciennete_poste=p)
           for i, (e, a, p) in enumerate([("N1", 58, 6), ("C1", 59, 2), ("C1", 62, 10), ("C1", 40, 5), ("C2", 30, 1)])]
    return ecoles, ens


def test_rapport_scenarios_et_tableaux():
    from domaine.planification import rapport as rap
    ecoles, ens = _jeu_regions()
    h = _hyp(DIR_NOM_AN=856)
    h["attrition"]["taux_unique"] = 2.25
    proj, _ = projeter_ecoles(ecoles, ens, defaut(), h)
    r = rap.construire(proj, ens, h, 3)
    assert r["annees"] == ["N+1", "N+2", "N+3"]
    for reg in rap.regions(proj).values():
        t = rap.trajectoires(reg, h, 3)
        for k, l in enumerate(t["min"]):
            assert l["recrutement"] == l["departs_retraite"]
        for l in t["maintien"]:
            assert l["recrutement"] == l["departs_retraite"] + l["departs_attrition"] + l["directeurs_decharges"]
        for s in rap.SCENARIOS:
            for a, b in zip(t[s], t[s][1:]):       # le stock suivant reprend départs et recrutements
                assert b["effectif_debut"] == rap.stock_fin(a)
        assert all(l["recrutement"] >= l["departs_retraite"] for l in t["besoin"])
    # Retraites : la somme des régions donne le national.
    ret = r["retraites_regions"]
    assert [sum(x) for x in zip(*(l["annees"] for l in ret["lignes"]))] == ret["national"]["annees"]
    assert ret["national"]["total"] == 3                  # T0 (N+3), T1 (N+2), T2 (N+1, CORR_60)
    # Cohorte « ≥ 5 ans » : T0, T2, T3 ; redéployable limité à l'arrondissement.
    red = r["redeploiement"]
    assert red["national"]["cohorte"] == 3
    centre = next(l for l in red["lignes"] if l["territoire"] == "Centre")
    assert centre["redeployable_arrondissement"] == min(centre["excedents"], centre["deficits"])
    # Priorités : le Nord (REM 200) est en déficit structurel, le Centre (REM 56) au-dessus de la norme.
    prio = {f["region"]: f for f in r["priorites"]}
    assert prio["Nord"]["priorite"] == 1 and prio["Nord"]["problemes"][0]["titre"] == "Déficit structurel d'encadrement"
    assert prio["Centre"]["priorite"] in (2, 3) and "pourvoyeuse" in prio["Centre"]["orientation"]
    assert r["priorites"][0]["region"] == "Nord"
    lignes = {l["libelle"]: l["valeurs"] for l in r["national"]["lignes"]}
    assert lignes["Recrutement S-min"][1:] == ret["national"]["annees"]
    assert any("CORR_60" in x for x in r["limites"]) is False   # aucun agent signalé à la construction


def test_classement_des_regions():
    from domaine.planification.rapport import classer
    assert classer(127.5, 4.7, 74.4, 7)[0] == 1
    assert classer(76.0, 13.9, 74.4, 7)[1].startswith("Encadrement proche de la norme")
    assert classer(48.1, 10.0, 74.4, 7)[:2] == (2, "Encadrement au-dessus de la norme ; vague de retraites")
    assert classer(48.1, 5.0, 74.4, 7)[0] == 3


def _annees_chainees():
    ecoles, ens = _jeu()
    p, _ = projeter_ecoles(ecoles, ens, defaut(), _hyp())
    return p, calculer_annees(p, _hyp())


def test_suivi_effectif_fin_chaine_les_annees_avec_et_sans_quota_retenu():
    p, a = _annees_chainees()
    quotas = [{"annee": "N+1", "territoire": "Centre", "sous_systeme": "francophone", "retenu": 1, "statut": "ajuste"}]
    for retenus in ([], quotas):                      # quota retenu inférieur au quota calculé (3), puis aucun
        s = appliquer_suivi(a, {}, quotas=retenus, nominations=[], mouvements=[], recrutements_supposes=True)
        for x, y in zip(s, s[1:]):
            assert y["effectif_debut"] == x["effectif_fin"]
    assert s[0]["recrutement"] == 1 and s[0]["quota_calcule"] == 3


def test_suivi_sans_recrutements_supposes_le_quota_retenu_ne_modifie_pas_les_effectifs():
    p, a = _annees_chainees()
    quotas = [{"annee": "N+1", "territoire": "Centre", "sous_systeme": "francophone", "retenu": 9, "statut": "ajuste"}]
    s = appliquer_suivi(a, {}, quotas=quotas, nominations=[], mouvements=[], recrutements_supposes=False)
    assert [x["effectif_debut"] for x in s] == [x["effectif_debut"] for x in a]
    assert s[0]["quota_retenu"] == 9 and s[0]["recrutement"] == a[0]["recrutement"]


def test_suivi_un_perimetre_d_ecole_n_a_pas_de_quota_retenu():
    p, a = _annees_chainees()
    quotas = [{"annee": "N+1", "territoire": "Centre", "sous_systeme": "francophone", "retenu": 9, "statut": "ajuste"}]
    s = appliquer_suivi(a, {"ecole": "E1"}, quotas=quotas, nominations=[], mouvements=[], recrutements_supposes=True)
    assert s[0]["quota_retenu"] is None and s[0]["recrutement"] == a[0]["recrutement"]
