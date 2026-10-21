"""Taux d'encadrement projeté (N+1 à N+5) : population commune — élèves ET enseignants des seules écoles à effectif
d'élèves connu — sans répartir artificiellement les recrutements entre écoles. Quand le taux ne peut pas être calculé
fiablement sur cette population : « non disponible », avec sa raison. L'arrondi n'intervient qu'à la restitution."""
import pytest

from domaine.donnees.modeles import Ecole, Enseignant
from domaine.parametrage.config import defaut
from domaine.planification import parametres as par
from domaine.planification import rapport as rap
from domaine.planification.projection import SCENARIOS, calculer_annees, projeter_ecoles
from domaine.planification.suivi import appliquer_suivi


def _hyp():
    h = par.hypotheses_par_defaut(defaut())
    h["attrition"]["taux_unique"] = 0
    h["drh"].update({"G_PRI_PCT": 0, "DIR_NOM_AN": 0, "PLAF_PRI": 0, "ETAL_N": 1})
    return h


def _ecole(ident, eleves, enseignants, connu=True):
    return Ecole(id=ident, region="Centre", departement="Mfoundi", commune="Yaounde", effectif_eleves=eleves,
                 enseignants_actuels=enseignants, salles_simple_flux=6, effectif_connu=connu)


def _projection(ecoles):
    ens = [Enseignant(matricule=f"T{i}", ecole_attache=e.id, age=40) for i, e in enumerate(ecoles)]
    p, _ = projeter_ecoles(ecoles, ens, defaut(), _hyp())
    return p


def test_sans_ecole_inconnue_rien_ne_change():
    p = _projection([_ecole("A", 300, 10), _ecole("B", 100, 5)])
    lignes = calculer_annees(p, _hyp())
    assert all(l["population_complete"] and l["rem_raison"] is None for l in lignes)
    assert lignes[0]["rem"] == round(400 / 15, 1)                      # élèves ÷ stock de début, comme avant


def test_annee_1_restreinte_aux_ecoles_a_effectif_connu_puis_non_disponible():
    # A (300 élèves, 10 enseignants) est connue ; B (aucun effectif d'élèves, 20 enseignants) ne l'est pas.
    p = _projection([_ecole("A", 300, 10), _ecole("B", 0, 20, connu=False)])
    lignes = calculer_annees(p, _hyp())
    # N+1 : stock de début connu école par école -> population commune : 300 ÷ 10 (et non 300 ÷ 30 = 10,0).
    assert lignes[0]["rem"] == 30.0 and lignes[0]["rem_raison"] is None
    assert lignes[0]["rem_denominateur"] == 10
    # N+2 à N+5 : le stock suit des départs et des recrutements projetés pour le périmètre entier : pas de
    # répartition artificielle -> non disponible, avec la raison.
    for l in lignes[1:]:
        assert l["rem"] is None and "effectif d'élèves inconnu" in l["rem_raison"]
        assert l["population_complete"] is False


def test_taux_obtenu_apres_recrutements_non_disponible_si_ecole_inconnue():
    complet = _projection([_ecole("A", 300, 10), _ecole("B", 100, 5)])
    assert all(r is not None for r in rap.rems(calculer_annees(complet, _hyp(), scenario="min")))
    partiel = _projection([_ecole("A", 300, 10), _ecole("B", 0, 5, connu=False)])
    for s in SCENARIOS:
        lignes = calculer_annees(partiel, _hyp(), scenario=s)
        assert rap.rems(lignes) == [None] * 5
        assert rap.raison_rems(lignes)
    # La base (année 0) reste calculable sur la population commune : 300 ÷ 10.
    assert rap.rem_base(partiel) == 30.0


def test_le_suivi_ne_recalcule_pas_un_taux_non_disponible():
    partiel = _projection([_ecole("A", 300, 10), _ecole("B", 0, 5, connu=False)])
    a = calculer_annees(partiel, _hyp())
    s = appliquer_suivi(a, {}, quotas=[{"annee": "N+1", "territoire": "Centre", "sous_systeme": "francophone",
                                         "retenu": 3, "statut": "ajuste"}],
                        nominations=[], mouvements=[], recrutements_supposes=True)
    assert s[0]["rem"] == a[0]["rem"] == 30.0 and all(l["rem"] is None for l in s[1:])


def test_precision_preservee_pour_les_classements():
    # 1 : taux brut 84,49 -> arrondi 84,5 ; la priorité se décide sur 84,49 (jamais sur la valeur déjà arrondie).
    p = _projection([_ecole("A", 8449, 100)])
    assert rap.rem_base(p) == 84.5
    assert rap.rem_base_brut(p) == pytest.approx(84.49)
    # La fiche régionale expose la valeur arrondie ET la valeur brute utilisée pour classer.
    hyp = _hyp()
    traj = rap.trajectoires(p, hyp, 5)
    fiche = rap.fiche_region("Centre", p, traj, hyp, 5, {"attrition": 3.33, "sous_dotees": 0.0, "alea": None})
    assert fiche["rem_base"] == 84.5 and fiche["rem_base_brut"] == pytest.approx(84.49)
