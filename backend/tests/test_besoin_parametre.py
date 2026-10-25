"""Les réglages du besoin (norme, première section, niveaux, double flux) sont lus par le moteur.

Les calculs chiffrés partent du référentiel historique (norme de 60, `config_historique`) pour garder la trace des
règles d'origine ; le référentiel d'octobre 2026 (74,4) est vérifié dans tests/test_referentiel_2026.py."""
import copy

import pytest

from domaine.diagnostic.indicateurs import calculer_indicateurs
from domaine.donnees.modeles import Ecole
from domaine.parametrage.config import ParametresInvalides, config_historique, defaut, valider


def _ecole(eleves=250, enseignants=2, simple=6, double=0, multigrade="Non"):
    return Ecole(id="E", effectif_eleves=eleves, enseignants_actuels=enseignants, salles_simple_flux=simple,
                 salles_double_flux=double, multigrade=multigrade)


def _avec(**besoin):
    cfg = config_historique()
    cfg["besoin"].update(besoin)
    return cfg


def test_valeurs_par_defaut_du_moteur_d_origine():
    # 250 élèves : P = ceil((250 - 20) / 60) = 4 ; école ordinaire : m = 6 niveaux ; multigrade : ceil(6 / 2) = 3.
    ind = calculer_indicateurs(_ecole(), config_historique())
    assert (ind.Pe, ind.me, ind.De, ind.BMAX) == (4, 6, 6, 6)
    assert calculer_indicateurs(_ecole(multigrade="Oui"), config_historique()).me == 3
    # Première section : 20 élèves ou moins = un poste.
    assert calculer_indicateurs(_ecole(eleves=20), config_historique()).Pe == 1
    assert calculer_indicateurs(_ecole(eleves=21), config_historique()).Pe == 1
    assert calculer_indicateurs(_ecole(eleves=81), config_historique()).Pe == 2


def test_la_norme_d_encadrement_change_le_nombre_de_postes():
    assert calculer_indicateurs(_ecole(), _avec(norme_eleves_par_maitre=50)).Pe == 5      # ceil(230 / 50)
    assert calculer_indicateurs(_ecole(), _avec(norme_eleves_par_maitre=120)).Pe == 2     # ceil(230 / 120)


def test_l_effectif_de_la_premiere_section_est_la_tolerance_d_arrondi():
    assert calculer_indicateurs(_ecole(), _avec(effectif_premiere_section=0)).Pe == 5     # ceil(250 / 60)
    assert calculer_indicateurs(_ecole(), _avec(effectif_premiere_section=50)).Pe == 4    # ceil(200 / 60)
    assert calculer_indicateurs(_ecole(eleves=30), _avec(effectif_premiere_section=40)).Pe == 1


def test_niveaux_et_regroupement_multigrade():
    assert calculer_indicateurs(_ecole(), _avec(nombre_niveaux=4)).me == 4
    assert calculer_indicateurs(_ecole(multigrade="Oui"), _avec(niveaux_par_maitre_multigrade=3)).me == 2
    assert calculer_indicateurs(_ecole(multigrade="Oui"), _avec(niveaux_par_maitre_multigrade=1)).me == 6
    # Sans minimum « selon multigrades », le regroupement s'applique à toutes les écoles.
    assert calculer_indicateurs(_ecole(), _avec(minimum_selon_multigrades=False)).me == 3


def test_le_double_flux_compte_pour_deux_maitres_quand_il_est_autorise():
    ecole = _ecole(simple=3, double=2)
    assert calculer_indicateurs(ecole, config_historique()).BMAX == 7
    assert calculer_indicateurs(ecole, _avec(double_flux_autorise=False)).BMAX == 5


def test_un_reglage_modifie_le_besoin_et_l_excedent():
    base = calculer_indicateurs(_ecole(enseignants=2), config_historique())
    plus_exigeant = calculer_indicateurs(_ecole(enseignants=2), _avec(norme_eleves_par_maitre=30, nombre_niveaux=3))
    assert plus_exigeant.De != base.De or plus_exigeant.be != base.be
    # Une configuration enregistrée avant l'ajout du bloc retombe sur les valeurs d'origine.
    ancienne = defaut()
    del ancienne["besoin"]
    assert calculer_indicateurs(_ecole(), ancienne) == calculer_indicateurs(_ecole(), defaut())


def test_validation_des_reglages_du_besoin():
    cfg, _ = valider({"besoin": {"norme_eleves_par_maitre": 45, "effectif_premiere_section": 15}})
    assert cfg["besoin"]["norme_eleves_par_maitre"] == 45
    for mauvais in ({"norme_eleves_par_maitre": 0}, {"effectif_premiere_section": 80},
                    {"nombre_niveaux": 0}, {"niveaux_par_maitre_multigrade": 0}, {"plancher_pedagogique": 0},
                    {"groupes_secours": 0}, {"plancher_pedagogique": 2.5}):
        with pytest.raises(ParametresInvalides):
            valider({"besoin": mauvais})
    with pytest.raises(ParametresInvalides):
        valider({"besoin": {"inconnu": 1}})
    assert copy.deepcopy(defaut())["besoin"]["double_flux_autorise"] is True
