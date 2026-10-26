"""Audit des projections sur cinq ans : plancher des retraites (PLANCHER_RET), vivier sans double comptage, départs
nominatifs (matricules uniques, âges jamais inventés, année de mesure des âges) et distinction entre besoin calculé,
quota plafonné, quota retenu et recrutement réalisé."""
import pytest

from domaine.donnees.modeles import Ecole, Enseignant
from domaine.parametrage.config import defaut
from domaine.planification.parametres import STOCK_NATIONAL_PRIMAIRE, valider_hypotheses
from domaine.planification.previsionnel import audit_retraites
from domaine.planification.projection import (annee_depart, calculer_annees, decalage_ages, ligne_fiabilite,
                                              matricules_uniques, projeter_ecoles)
from tests.test_domaine_planification import _hyp


def _excedentaire():
    """10 enseignants déclarés pour un besoin de 6 ; trois retraités en N+1 : le besoin calculé est nul."""
    ecole = Ecole(id="E1", region="Centre", departement="Mfoundi", commune="Yaounde", effectif_eleves=100,
                  enseignants_actuels=10, salles_simple_flux=6, multigrade="0")
    ens = [Enseignant(matricule=m, ecole_attache="E1", age=62) for m in "ABC"]
    return [ecole], ens


def _deficitaire():
    """4 enseignants pour un besoin de 6 ; trois retraités en N+1 : le besoin calculé dépasse les retraites."""
    ecole = Ecole(id="E1", region="Centre", departement="Mfoundi", commune="Yaounde", effectif_eleves=100,
                  enseignants_actuels=4, salles_simple_flux=6, multigrade="0")
    ens = [Enseignant(matricule=m, ecole_attache="E1", age=62) for m in "ABC"]
    return [ecole], ens


def _annees(jeu, **drh):
    ecoles, ens = jeu
    p, _ = projeter_ecoles(ecoles, ens, defaut(), _hyp(**drh))
    return p, calculer_annees(p, _hyp(**drh))


def test_retraites_superieures_au_besoin_calcule_plancher_actif():
    _, a = _annees(_excedentaire())
    n1 = a[0]
    assert (n1["departs_retraite"], n1["besoin"], n1["quota_avant_plafond"]) == (3, 0, 0)
    # Q ≥ R : le plancher porte le quota au niveau des retraites ; il est signalé comme appliqué.
    assert n1["quota_calcule"] == 3 and n1["plancher_retraites"] == 3 and n1["plancher_applique"] is True
    # Un quota calculé n'est ni retenu ni réalisé tant qu'aucune décision n'est saisie.
    assert n1["quota_retenu"] is None and n1["nominations_realisees"] == 0


def test_retraites_superieures_au_besoin_calcule_plancher_desactive():
    _, a = _annees(_excedentaire(), PLANCHER_RET=False)
    n1 = a[0]
    assert n1["quota_calcule"] == 0 and n1["plancher_retraites"] is None and n1["plancher_applique"] is False


def test_plafond_inferieur_aux_retraites():
    plaf = round(STOCK_NATIONAL_PRIMAIRE / 4)            # plafond ramené au périmètre : round(PLAF × 4 / 44232) = 1
    _, a = _annees(_deficitaire(), PLAF_PRI=plaf)
    n1 = a[0]
    assert n1["plafond"] == 1 and n1["departs_retraite"] == 3
    assert n1["quota_avant_plafond"] > n1["departs_retraite"] > n1["plafond"]
    # Le plancher l'emporte sur le plafond : le quota remplace les retraites, sans couvrir tout le besoin.
    assert n1["quota_calcule"] == 3 and n1["plancher_applique"] is True
    _, a = _annees(_deficitaire(), PLAF_PRI=plaf, PLANCHER_RET=False)
    assert a[0]["quota_calcule"] == 1 and a[0]["plancher_applique"] is False


def test_plancher_sans_effet_quand_le_besoin_depasse_les_retraites():
    _, a = _annees(_deficitaire())
    n1 = a[0]
    assert n1["quota_calcule"] == n1["quota_avant_plafond"] > n1["departs_retraite"]
    assert n1["plancher_applique"] is False


def test_vivier_apres_retraites_sans_double_comptage():
    p, a = _annees(_excedentaire())
    e = p[0]
    # Excédent avant retraites 10 − 6 = 4 ; après les trois retraites de N+1, 7 − 6 = 1 seulement.
    assert e.excedent_sur_initial == 4 and e.excedents_surs[0] == 1
    assert a[0]["ressources_vivier"] == 1
    assert all(x["ressources_vivier"] == 0 for x in a[1:])


def test_scenarios_et_quota_retenu_distincts():
    p, _ = _annees(_excedentaire())
    traj = {s: calculer_annees(p, _hyp(), scenario=s) for s in ("min", "maintien", "besoin", "plafond")}
    assert traj["min"][0]["recrutement"] == 3
    assert traj["besoin"][0]["recrutement"] == max(traj["besoin"][0]["quota_avant_plafond"], 3)
    for lignes in traj.values():
        # S(t+1) = S(t) − R(t) − A(t) + Q(t) ; U(t) = S(t) − H(t).
        for k, x in enumerate(lignes):
            assert x["effectif_fin"] == x["effectif_debut"] - x["departs_retraite"] - x["departs_attrition"] \
                + x["recrutement"]
            assert x["disponibles_fin"] == x["effectif_fin"] - x["decharges_cumulees"]
            if k:
                assert x["effectif_debut"] == lignes[k - 1]["effectif_fin"]


def test_quotas_non_supposes_realises_ne_recrutent_pas():
    h = _hyp()
    h["quotas"]["annees_precedentes_realisees"] = False
    ecoles, ens = _excedentaire()
    p, _ = projeter_ecoles(ecoles, ens, defaut(), h)
    a = calculer_annees(p, h)
    assert a[0]["quota_calcule"] == 3 and all(x["recrutement"] == 0 for x in a)


def test_matricule_en_double_compte_une_seule_fois():
    ecoles, ens = _excedentaire()
    ens = ens + [Enseignant(matricule="A", ecole_attache="E1", age=62)]
    uniques, doublons = matricules_uniques(ens)
    assert len(uniques) == 3 and doublons == 1
    p, departs = projeter_ecoles(ecoles, ens, defaut(), _hyp())
    assert sorted(d.matricule for d in departs) == ["A", "B", "C"] and p[0].retraites[0] == 3


def test_age_suppose_jamais_compte_comme_retraite():
    ecoles, _ = _excedentaire()
    ens = [Enseignant(matricule="X", ecole_attache="E1", age=35, age_connu=False),
           Enseignant(matricule="Y", ecole_attache="E1", age=62)]
    p, departs = projeter_ecoles(ecoles, ens, defaut(), _hyp())
    assert [d.matricule for d in departs] == ["Y"]
    assert ligne_fiabilite("Centre", p, ens)["taux_date_naissance"] == 0.5
    audit = audit_retraites(p, ens, departs, _hyp(), 5)
    assert audit["sans_age"] == 1 and audit["deja_eligibles_debut"] == 1


def test_deja_eligibles_et_age_legal_atteint():
    ecoles, _ = _excedentaire()
    ens = [Enseignant(matricule="A", ecole_attache="E1", age=63), Enseignant(matricule="B", ecole_attache="E1", age=59),
           Enseignant(matricule="C", ecole_attache="E1", age=30)]
    p, departs = projeter_ecoles(ecoles, ens, defaut(), _hyp())
    par = {d.matricule: d for d in departs}
    assert set(par) == {"A", "B"}
    assert (par["A"].annee, par["A"].deja_eligible) == (0, True)
    assert (par["B"].annee, par["B"].deja_eligible) == (1, False)
    audit = audit_retraites(p, ens, departs, _hyp(), 5)
    assert [x["departs"] for x in audit["lignes"]] == [1, 1, 0, 0, 0]
    assert audit["lignes"][0]["deja_eligibles"] == 1 and audit["lignes"][1]["atteignant_age_legal"] == 1
    assert audit["doublons"] == 0 and audit["personnels_nominatifs"] == 3 and "1,08" in audit["methode"]
    # Chaque agent n'est compté qu'une année : la somme des départs est celle des agents partants.
    assert sum(x["departs"] for x in audit["lignes"]) == len(departs)


def test_annee_de_mesure_des_ages():
    h = _hyp()
    assert decalage_ages(h, "2024-2025") == 0
    h["retraite"]["annee_ages"] = "2026-2027"
    # Base 2024-2025, N+1 = 2025-2026 : des âges mesurés en 2026-2027 ont un an de trop.
    assert decalage_ages(h, "2024-2025") == 1
    assert annee_depart(60, h, 1) == annee_depart(59, h) == 1
    assert annee_depart(61, h, 1) == 0
    assert decalage_ages(h, "") == 0


def test_annee_des_ages_validee():
    h = _hyp()
    h["retraite"]["annee_ages"] = "2026/2027"
    ok, erreurs = valider_hypotheses(h)
    assert erreurs == [] and ok["retraite"]["annee_ages"] == "2026-2027"
    h["retraite"]["annee_ages"] = "bientôt"
    _, erreurs = valider_hypotheses(h)
    assert any(e.startswith("retraite.annee_ages") for e in erreurs)
    h["retraite"]["annee_ages"] = ""
    ok, erreurs = valider_hypotheses(h)
    assert erreurs == [] and ok["retraite"]["annee_ages"] is None


@pytest.mark.parametrize("plancher", [True, False])
def test_plancher_jamais_sous_les_retraites_quand_actif(plancher):
    for jeu in (_excedentaire(), _deficitaire()):
        _, a = _annees(jeu, PLANCHER_RET=plancher, PLAF_PRI=round(STOCK_NATIONAL_PRIMAIRE / 4))
        for x in a:
            if plancher:
                assert x["quota_calcule"] >= x["departs_retraite"]
            else:
                assert x["quota_calcule"] <= (x["plafond"] if x["plafond"] is not None else x["quota_avant_plafond"])
