"""Référentiel d'octobre 2026 : REM de référence 74,4, tolérance de 20 élèves, minimum pédagogique max(3, G),
lecture numérique de Classes_Multigrades et mode « non renseigné » (rapport MINEDUB, projections 2027-2029)."""
import dataclasses

import pytest

from domaine.diagnostic.indicateurs import (ESTIME, INDETERMINE, MESSAGE_MULTIGRADES_NON_RENSEIGNES, OBSERVE, SECOURS,
                                            besoin_rem, calculer_indicateurs, lire_multigrades)
from domaine.donnees import colonnes as C
from domaine.donnees.modeles import Ecole, Enseignant, construire_ecole
from domaine.mobilite.vivier import construire_vivier
from domaine.parametrage.config import (NORME_HISTORIQUE, ParametresInvalides, config_historique, defaut,
                                        valider)


def _ecole(eleves=402, enseignants=6, simple=8, double=0, multigrade="", **kw):
    return Ecole(id="E", effectif_eleves=eleves, enseignants_actuels=enseignants, salles_simple_flux=simple,
                 salles_double_flux=double, multigrade=multigrade, **kw)


def _ind(**kw):
    cfg = kw.pop("cfg", None) or defaut()
    return calculer_indicateurs(_ecole(**kw), cfg)


# --- 1, 2 : P avec 74,4 et la tolérance de 20 ---------------------------------------------------------------------

def test_pe_avec_la_norme_de_74_4_et_la_tolerance_de_20():
    assert defaut()["besoin"]["norme_eleves_par_maitre"] == 74.4
    assert defaut()["besoin"]["effectif_premiere_section"] == 20
    assert _ind(eleves=402).Pe == 6               # ⌈382 ÷ 74,4⌉ = ⌈5,13⌉
    assert _ind(eleves=20).Pe == 1 and _ind(eleves=5).Pe == 1
    assert _ind(eleves=94).Pe == 1                # ⌈74 ÷ 74,4⌉ = 1
    assert _ind(eleves=95).Pe == 2                # ⌈75 ÷ 74,4⌉ = 2 : la décimale compte


def test_la_norme_garde_sa_precision_decimale():
    cfg, _ = valider({"besoin": {"norme_eleves_par_maitre": 74.4}})
    assert cfg["besoin"]["norme_eleves_par_maitre"] == 74.4
    # 94,4 élèves : exactement une norme au-dessus de la tolérance, pas deux (aucune erreur d'arrondi flottant).
    assert calculer_indicateurs(_ecole(eleves=94.4), defaut()).Pe == 1
    assert calculer_indicateurs(_ecole(eleves=95), {**defaut(), "besoin": {**defaut()["besoin"],
                                                                           "norme_eleves_par_maitre": 75}}).Pe == 1


def test_besoin_selon_le_rem_distinct_du_besoin_pedagogique():
    i = _ind(eleves=402)
    assert i.Ce == besoin_rem(402, 74.4) == 6         # ⌈402 ÷ 74,4⌉ = ⌈5,40⌉
    i = _ind(eleves=80)
    assert (i.Ce, i.Pe) == (2, 1)                     # ⌈80 ÷ 74,4⌉ = 2, mais ⌈60 ÷ 74,4⌉ = 1
    # Effectif inconnu : Ce n'est pas calculé, et le besoin est provisoire (jamais un effectif nul).
    i = calculer_indicateurs(_ecole(eleves=0, effectif_connu=False, multigrade="0"), defaut())
    assert i.Ce is None and i.statut_besoin == "provisoire"


# --- 3 à 6 : m = max(3, G) et Classes_Multigrades -----------------------------------------------------------------

@pytest.mark.parametrize("valeur,groupes,minimum", [(0, 6, 6), (1, 5, 5), (2, 4, 4), (3, 3, 3),
                                                    ("2", 4, 4), (2.0, 4, 4), ("3,0", 3, 3)])
def test_classes_multigrades_numeriques(valeur, groupes, minimum):
    i = _ind(eleves=100, multigrade=valeur)
    assert (i.Ge, i.me, i.Ge_provenance, i.Me) == (groupes, minimum, ESTIME, int(float(str(valeur).replace(",", "."))))
    assert i.multigrades_statut == "renseigne" and not i.minimum_provisoire


def test_deux_ou_trois_classes_multigrades_ne_sont_plus_lues_comme_aucune():
    # Avant : est_oui("2") était faux, l'école passait pour « sans multigrade » (m = 6).
    assert _ind(eleves=60, multigrade="2").me == 4
    assert _ind(eleves=60, multigrade="3").me == 3


def test_le_plancher_pedagogique_est_configurable():
    cfg = defaut()
    cfg["besoin"]["plancher_pedagogique"] = 4
    assert calculer_indicateurs(_ecole(eleves=60, multigrade=3), cfg).me == 4
    cfg["besoin"]["plancher_pedagogique"] = 3
    assert calculer_indicateurs(_ecole(eleves=60, multigrade=3), cfg).me == 3


def test_zero_et_cellule_vide_ne_sont_pas_confondus():
    zero, vide = _ind(eleves=100, multigrade=0), _ind(eleves=100, multigrade="")
    assert zero.multigrades_statut == "renseigne" and zero.Me == 0 and zero.Ge_provenance == ESTIME
    assert vide.multigrades_statut == "non_renseigne" and vide.Me is None and vide.Ge_provenance == SECOURS
    assert vide.minimum_provisoire and not zero.minimum_provisoire
    assert lire_multigrades(None, defaut()["besoin"]) == (None, "non_renseigne")
    assert lire_multigrades(float("nan"), defaut()["besoin"]) == (None, "non_renseigne")


@pytest.mark.parametrize("valeur,statut", [(-1, "invalide"), (1.5, "invalide"), ("deux", "invalide"),
                                           (4, "incoherent"), (6, "incoherent")])
def test_valeurs_negatives_fractionnaires_ou_incoherentes_signalees(valeur, statut):
    i = _ind(eleves=100, multigrade=valeur)
    assert i.multigrades_statut == statut
    assert i.Ge_provenance == INDETERMINE and i.minimum_provisoire and i.me == 6   # secours, jamais « 0 multigrade »


def test_anciens_fichiers_oui_non_restent_lisibles():
    oui, non = _ind(eleves=100, multigrade="Oui"), _ind(eleves=100, multigrade="Non")
    assert (oui.me, oui.multigrades_statut) == (3, "historique_oui")
    assert (non.me, non.multigrades_statut) == (6, "historique_non")


def test_classes_ouvertes_ignorees_par_defaut():
    # Tant que la définition métier de Classes_Ouvertes n'est pas validée, la colonne ne compte pas comme le nombre
    # observé de groupes pédagogiques : l'estimation par Classes_Multigrades s'applique.
    assert defaut()["besoin"]["groupes_depuis_classes_ouvertes"] is False
    i = _ind(eleves=100, multigrade=2, classes_ouvertes=5)
    assert (i.Ge, i.Ge_provenance) == (4, ESTIME)
    sans_mg = _ind(eleves=100, classes_ouvertes=5)
    assert (sans_mg.Ge, sans_mg.Ge_provenance, sans_mg.minimum_provisoire) == (6, SECOURS, True)


def test_classes_ouvertes_lues_si_le_reglage_est_active():
    cfg = defaut()
    cfg["besoin"]["groupes_depuis_classes_ouvertes"] = True
    i = calculer_indicateurs(_ecole(eleves=100, multigrade=2, classes_ouvertes=5), cfg)
    assert (i.Ge, i.Ge_provenance, i.me, i.statut_besoin) == (5, OBSERVE, 5, "confirme")
    # Les salles et les enseignants ne prouvent jamais le nombre de groupes.
    assert _ind(eleves=100, simple=2, enseignants=2).Ge == 6


# --- 7 à 11 : mode non renseigné ----------------------------------------------------------------------------------

def test_mode_non_renseigne_hypothese_de_secours():
    i = _ind(eleves=100)                               # base nationale actuelle : Classes_Multigrades vide
    assert (i.Ge, i.me, i.Ge_provenance) == (6, 6, SECOURS)
    assert i.minimum_provisoire and not i.minimum_observe and i.statut_besoin == "provisoire"
    cfg = defaut()
    cfg["besoin"]["groupes_secours"] = 4
    assert calculer_indicateurs(_ecole(eleves=100), cfg).me == 4


def test_message_du_mode_non_renseigne():
    assert MESSAGE_MULTIGRADES_NON_RENSEIGNES == (
        "Le nombre de classes multigrades n'est pas renseigné. Le besoin en enseignants est provisoire et sera "
        "recalculé lorsque cette information sera disponible.")


def test_un_besoin_fixe_par_l_effectif_reste_confirme_sans_multigrades():
    i = _ind(eleves=600)                              # P = ⌈580 ÷ 74,4⌉ = 8 > m = 6
    assert i.Pe == 8 and i.De == 8 and i.statut_besoin == "confirme"


def test_recalcul_quand_une_base_renseigne_les_multigrades():
    avant = construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_NE: 100, C.COL_ETAB_EE: 6, C.COL_ETAB_SSF: 6,
                              C.COL_ETAB_MULTIGRADE: None})
    apres = construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_NE: 100, C.COL_ETAB_EE: 6, C.COL_ETAB_SSF: 6,
                              C.COL_ETAB_MULTIGRADE: 2.0})
    a, b = calculer_indicateurs(avant, defaut()), calculer_indicateurs(apres, defaut())
    assert (a.me, a.De, a.Ke, a.xe) == (6, 6, 6, 0)
    assert (b.me, b.De, b.Ke, b.xe, b.Ge_provenance) == (4, 4, 4, 2, ESTIME)


def _agents(ecole, n):
    return [Enseignant(matricule=f"M{k}", ecole_attache=ecole, age=40, anciennete_poste=8) for k in range(n)]


def test_aucune_sortie_automatique_fondee_sur_un_excedent_incertain():
    cfg = defaut()
    cfg["besoin"]["groupes_secours"] = 3               # hypothèse de secours abaissée : m = 3 au lieu de 6
    e = _ecole(eleves=100, enseignants=6)
    e.ind = calculer_indicateurs(e, cfg)
    assert e.ind.xe == 3 and e.ind.xe_sur == 0 and e.ind.xe_a_verifier == 3
    assert construire_vivier(_agents("E", 6), [e], cfg) == []
    # Avec Classes_Multigrades renseigné (3 classes : m = 3 estimé), l'excédent repose sur le regroupement supposé :
    # il reste à vérifier tant que l'école peut avoir besoin d'un maître par année.
    f = _ecole(eleves=100, enseignants=6, multigrade=3)
    f.id = "F"
    f.ind = calculer_indicateurs(f, cfg)
    assert f.ind.xe == 3 and f.ind.xe_sur == 0 and f.ind.xe_a_verifier == 3
    assert construire_vivier(_agents("F", 6), [f], cfg) == []
    # Ancien « Oui » sans nombre : excédent à vérifier.
    g = _ecole(eleves=100, enseignants=6, multigrade="Oui")
    g.ind = calculer_indicateurs(g, defaut())
    assert g.ind.xe == 3 and g.ind.xe_sur == 1 and g.ind.xe_a_verifier == 2


def test_excedent_sur_avec_l_hypothese_par_defaut():
    # Secours = 6 groupes, le maximum plausible : l'excédent calculé est sûr, rien n'est retenu.
    i = _ind(eleves=100, enseignants=9)
    assert i.xe == 3 and i.xe_sur == 3 and i.xe_a_verifier == 0


def test_excedent_issu_de_groupes_estimes_reste_a_verifier():
    # G = 6 − M = 4 : excédent théorique 2, mais aucun enseignant n'est mobilisable sans validation administrative.
    e = _ecole(eleves=100, enseignants=6, multigrade=2)
    e.ind = calculer_indicateurs(e, defaut())
    assert (e.ind.Ge, e.ind.Ge_provenance, e.ind.xe) == (4, ESTIME, 2)
    assert e.ind.xe_sur == 0 and e.ind.xe_a_verifier == 2
    assert construire_vivier(_agents("E", 6), [e], defaut()) == []
    # Validation administrative (réglage mobiliser_excedent_incertain) : l'excédent estimé devient mobilisable.
    cfg = defaut()
    cfg["besoin"]["mobiliser_excedent_incertain"] = True
    e.ind = calculer_indicateurs(e, cfg)
    assert e.ind.xe_sur == 2 and len(construire_vivier(_agents("E", 6), [e], cfg)) == 2


def test_excedent_sur_au_dela_de_six_groupes():
    # Au-delà d'un maître par année, l'excédent est sûr quelle que soit l'organisation : il reste mobilisable.
    i = _ind(eleves=100, enseignants=9, multigrade=2)
    assert (i.xe, i.xe_sur, i.xe_a_verifier) == (5, 3, 2)
    zero = _ind(eleves=100, enseignants=9, multigrade=0)          # aucune classe multigrade : G = 6, sans hypothèse
    assert (zero.xe, zero.xe_sur, zero.statut_besoin) == (3, 3, "confirme")


# --- 3 (fiabilité) : minimum provisoire ≠ besoin final incertain -----------------------------------------------------

def test_minimum_provisoire_sans_effet_sur_le_besoin_final():
    # Classes_Multigrades vide, mais P = 8 l'emporte sur toute organisation plausible (3 à 6 groupes).
    par_effectif = _ind(eleves=600, enseignants=5)
    assert par_effectif.minimum_provisoire and par_effectif.statut_besoin == "confirme"
    assert not par_effectif.besoin_final_incertain and par_effectif.be_min == par_effectif.be_max == 3
    # Deux salles seulement : K = BMAX = 2 pour 3 comme pour 6 groupes, le besoin final est certain.
    par_salles = _ind(eleves=100, enseignants=0, simple=2)
    assert par_salles.minimum_provisoire and par_salles.statut_besoin == "confirme" and par_salles.be == 2


def test_besoin_final_incertain_et_sa_fourchette():
    i = _ind(eleves=100, enseignants=2)                  # secours : 3 à 6 groupes plausibles
    assert i.minimum_provisoire and i.besoin_final_incertain and i.statut_besoin == "provisoire"
    assert (i.be_min, i.be, i.be_max) == (1, 4, 4)
    j = _ind(eleves=100, enseignants=2, multigrade=2)     # G = 4 estimé, 6 si le regroupement n'est pas réel
    assert not j.minimum_provisoire and j.statut_besoin == "estime" and (j.be_min, j.be, j.be_max) == (2, 2, 4)


# --- 12 à 14 : cohérence D, BMAX, K, b, x, s ------------------------------------------------------------------------

def test_coherence_des_formules_du_diagnostic():
    i = _ind(eleves=402, enseignants=4, simple=3, double=1)
    assert i.De == max(i.Pe, i.me) == 6
    assert i.BMAX == 3 + 2 * 1 and i.Ke == min(i.De, i.BMAX) == 5
    assert i.be == max(0, i.Ke - 4) == 1 and i.xe == 0 and i.se == max(0, i.De - i.BMAX) == 1
    i = _ind(eleves=402, enseignants=9, simple=8)
    assert i.xe == 9 - 6 and i.be == 0


def test_ecole_a_effectif_inconnu():
    e = construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_EE: 3, C.COL_ETAB_SSF: 6, C.COL_ETAB_MULTIGRADE: 0})
    i = calculer_indicateurs(e, defaut())
    assert not e.effectif_connu and i.Ce is None and i.statut_besoin == "provisoire"


def test_salles_dont_le_flux_est_incertain():
    sans = construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_NE: 100, C.COL_ETAB_SSF: 6})
    avec = construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_NE: 100, C.COL_ETAB_SSF: 6, C.COL_ETAB_SDF: 0})
    assert calculer_indicateurs(sans, defaut()).bmax_incertain
    assert not calculer_indicateurs(avec, defaut()).bmax_incertain
    inconnues = construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_NE: 100})
    assert not calculer_indicateurs(inconnues, defaut()).bmax_incertain   # salles inconnues : signalé autrement


# --- 24, 25 ---------------------------------------------------------------------------------------------------------

def test_meme_calcul_pour_francophones_et_anglophones():
    for mg in ("", 0, 2, "Oui"):
        fr = calculer_indicateurs(_ecole(eleves=250, multigrade=mg, sous_systeme="Francophone"), defaut())
        en = calculer_indicateurs(_ecole(eleves=250, multigrade=mg, sous_systeme="Anglophone"), defaut())
        assert dataclasses.astuple(fr) == dataclasses.astuple(en)


def test_aucune_nouvelle_colonne_d_importation():
    assert C.COLONNES_ATTENDUES_ETAB == [
        "Identifiant_Ecole", "Sous_Systeme", "Region", "Departement", "Commune", "Circonscription_IAEB",
        "Effectif_Eleves_Attendus", "Enseignants_Actuels", "Salles_Simple_Flux", "Salles_Double_Flux",
        "Accessibilite_Zone", "Securite_Zone", "Classes_Multigrades"]
    assert C.COLONNES_OPTIONNELLES_ETAB == ["nom_etab", "type_etab", "latitude", "longitude", "Classes_Ouvertes"]
    tout = " ".join(C.COLONNES_ATTENDUES_ETAB + C.COLONNES_OPTIONNELLES_ETAB).lower()
    assert "groupes" not in tout and "Nombre_Groupes_Pedagogiques" not in tout


# --- Paramètres -----------------------------------------------------------------------------------------------------

def test_reglages_valides_et_historique_conserve():
    cfg, _ = valider({"besoin": {"plancher_pedagogique": 3, "groupes_secours": 6}})
    assert cfg["besoin"]["plancher_pedagogique"] == 3
    for mauvais in ({"plancher_pedagogique": 0}, {"groupes_secours": 31}, {"groupes_secours": 4.5}):
        with pytest.raises(ParametresInvalides):
            valider({"besoin": mauvais})
    h = config_historique()
    assert h["besoin"]["norme_eleves_par_maitre"] == NORME_HISTORIQUE == 60
    assert calculer_indicateurs(_ecole(eleves=402), h).Pe == 7     # ⌈382 ÷ 60⌉
