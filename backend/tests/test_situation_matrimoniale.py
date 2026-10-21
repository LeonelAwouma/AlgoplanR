"""Composante matrimoniale du barème (C3) : une situation vide ou non reconnue vaut 0 point — elle n'est jamais assimilée
à « célibataire » (règle v2, à valider par le métier) ; elle est signalée par le contrôle qualité ; les scénarios calculés
sous l'ancienne règle sont signalés obsolètes sans toucher aux décisions déjà validées."""
import pytest

from contextes.simulation import services as sim
from contextes.simulation.models import ResultatSimulation, Scenario
from domaine.donnees import colonnes as C
from domaine.donnees.modeles import Enseignant
from domaine.mobilite.bareme import REGLE_SITUATION_VERSION, categorie_situation, composantes_bareme, points_situation
from domaine.parametrage.config import defaut
from domaine.qualite.rapport import controler

B = "/api/v1/"


@pytest.mark.parametrize("valeur,categorie,points", [
    ("Célibataire", "celibataire", 10), ("celibataire", "celibataire", 10), ("CELIBATAIRE", "celibataire", 10),
    ("Marié(e)", "marie", 5), ("Mariée", "marie", 5), ("Divorcé", "divorce", 8), ("Veuve", "veuf", 8),
    ("Veuf", "veuf", 8),
    ("", None, 0), ("   ", None, 0), (None, None, 0), ("séparé(e)", None, 0), ("Union libre", None, 0),
    ("N/A", None, 0),
])
def test_points_de_la_composante_matrimoniale(valeur, categorie, points):
    assert categorie_situation(valeur) == categorie
    assert points_situation(valeur, defaut()) == points


def test_les_autres_composantes_de_c3_ne_changent_pas():
    cfg = defaut()
    avec_enfants = Enseignant(matricule="A", situation="Marié(e)", enfants=3, age=40)
    sans_situation = Enseignant(matricule="B", situation="", enfants=3, age=40)
    assert composantes_bareme(avec_enfants, cfg)["C3_charges_familiales"] == 5 - 2.0 * 3
    # Sans situation : 0 point matrimonial, la charge d'enfants (−2 par enfant) s'applique comme avant.
    assert composantes_bareme(sans_situation, cfg)["C3_charges_familiales"] == 0 - 2.0 * 3
    # C1, C2, C4, C5 identiques à ceux d'un agent dont la situation est renseignée.
    a, b = composantes_bareme(avec_enfants, cfg), composantes_bareme(sans_situation, cfg)
    assert all(a[k] == b[k] for k in a if k != "C3_charges_familiales")


def test_le_controle_qualite_signale_les_situations_absentes_ou_inconnues():
    ens = [{C.COL_ENS_ID: "1", C.COL_ENS_SITU: "Célibataire"}, {C.COL_ENS_ID: "2", C.COL_ENS_SITU: ""},
           {C.COL_ENS_ID: "3", C.COL_ENS_SITU: "Union libre"}, {C.COL_ENS_ID: "4"},
           {C.COL_ENS_ID: "5", C.COL_ENS_SITU: "Marié(e)"}]
    rapport = controler([{C.COL_ETAB_ID: "E"}], ens, defaut())
    avertissement = next(a for a in rapport["avertissements"] if a["code"] == "ENS_SITUATION_ABSENTE_OU_INCONNUE")
    assert "3 enseignant(s)" in avertissement["message"] and "Union libre" in avertissement["message"]
    assert "pas comptés comme « célibataire »" in avertissement["message"]
    propre = controler([{C.COL_ETAB_ID: "E"}], [{C.COL_ENS_ID: "1", C.COL_ENS_SITU: "Veuf"}], defaut())
    assert not any(a["code"] == "ENS_SITUATION_ABSENTE_OU_INCONNUE" for a in propre["avertissements"])


@pytest.mark.django_db
def test_un_scenario_calcule_sous_l_ancienne_regle_est_obsolete_sans_toucher_aux_decisions(drh):
    jeu = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 120},
                   content_type="application/json").json()["id"]
    scenarios = list(Scenario.objects.filter(jeu_id=jeu))
    assert scenarios and not any(sim.est_obsolete(s) for s in scenarios)       # calculés sous la règle courante
    avant = {s.pk: s.resultat.donnees for s in scenarios}
    # Résultat calculé avant la règle : marque absente ou d'une autre version.
    r = ResultatSimulation.objects.get(scenario=scenarios[0])
    config = dict(r.config)
    config["_regles_du_calcul"] = {"situation_matrimoniale": REGLE_SITUATION_VERSION - 1}
    r.config = config
    r.save(update_fields=["config"])
    assert sim.est_obsolete(Scenario.objects.get(pk=scenarios[0].pk))
    resume = drh.get(B + f"jeux/{jeu}/scenarios/").json()
    assert any(s.get("obsolete") for s in resume)
    # Une nouvelle décision exige un scénario à jour ; le résultat déjà stocké n'a pas été modifié rétroactivement.
    with pytest.raises(Exception) as exc:
        sim.exiger_a_jour(Scenario.objects.get(pk=scenarios[0].pk))
    assert "obsolète" in str(exc.value)
    assert ResultatSimulation.objects.get(scenario=scenarios[0]).donnees == avant[scenarios[0].pk]
    # Le recalcul rétablit la marque.
    sim.calculer(Scenario.objects.get(pk=scenarios[0].pk))
    assert not sim.est_obsolete(Scenario.objects.get(pk=scenarios[0].pk))
