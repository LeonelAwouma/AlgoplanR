"""Méthode unique du besoin pédagogique : le minimum pédagogique commun.

    B = max(M ; max(1 ; ⌈(N − T) ÷ R⌉))     M = minimum commun, T = tolérance, R = norme d'encadrement

Aucune donnée multigrade n'intervient dans le besoin. Paramètres de référence : M = 3, R = 60, T = 20 ; la norme
de 74,4 du rapport MINEDUB s'obtient en modifiant la valeur dans le Référentiel."""
import dataclasses

import pytest

from domaine.diagnostic.indicateurs import besoin_rem, calculer_indicateurs, lire_multigrades
from domaine.donnees import colonnes as C
from domaine.donnees.modeles import Ecole, Enseignant, construire_ecole
from domaine.mobilite.vivier import construire_vivier
from domaine.parametrage import config as cfg_dom
from domaine.parametrage.config import ParametresInvalides, config_historique, defaut, valider


def _ecole(eleves=100, enseignants=3, simple=10, double=0, multigrade="", **kw):
    return Ecole(id="E", effectif_eleves=eleves, enseignants_actuels=enseignants, salles_simple_flux=simple,
                 salles_double_flux=double, multigrade=multigrade, **kw)


def _cfg(**besoin):
    cfg = defaut()
    cfg["besoin"].update(besoin)
    return cfg


def _ind(cfg=None, **kw):
    return calculer_indicateurs(_ecole(**kw), cfg or defaut())


# --- Valeurs de référence --------------------------------------------------------------------------------------------

def test_parametres_de_reference_par_defaut():
    b = defaut()["besoin"]
    assert (b["plancher_pedagogique"], b["norme_eleves_par_maitre"], b["effectif_premiere_section"]) == (3, 60, 20)


@pytest.mark.parametrize("eleves,besoin", [(50, 3), (100, 3), (200, 3), (300, 5), (500, 8)])
def test_exemples_du_cahier_des_charges(eleves, besoin):
    i = _ind(eleves=eleves)
    assert i.De == besoin
    assert i.me == 3


def test_le_minimum_n_est_pas_un_plafond():
    assert _ind(eleves=1000).De == 17           # ⌈980 ÷ 60⌉
    assert _ind(eleves=1000).De > _ind(eleves=1000).me


def test_formule_explicite():
    for n in (0, 5, 20, 21, 80, 81, 140, 141, 399, 400, 401, 1234):
        attendu = max(3, max(1, -(-(n - 20) // 60)))
        assert _ind(eleves=n).De == attendu, n


# --- Classes multigrades sans influence ------------------------------------------------------------------------------

@pytest.mark.parametrize("mg", ["", "Oui", "Non", 0, 1, 2, 3, 5, "n'importe quoi", -1, 1.5])
def test_le_statut_multigrade_ne_change_pas_le_besoin(mg):
    ref = _ind(multigrade="Non")
    i = _ind(multigrade=mg)
    for champ in ("Pe", "me", "De", "BMAX", "Ke", "be", "xe", "se", "ae", "xe_sur", "xe_a_verifier", "statut_besoin"):
        assert getattr(i, champ) == getattr(ref, champ), (mg, champ)


def test_classes_ouvertes_sans_influence():
    assert _ind(classes_ouvertes=2).De == _ind(classes_ouvertes=None).De == 3


def test_les_informations_multigrades_restent_lues_pour_les_statistiques():
    assert _ind(multigrade=2).Me == 2 and _ind(multigrade=2).multigrades_statut == "renseigne"
    assert lire_multigrades("Oui") == (None, "historique_oui")
    assert lire_multigrades("Non") == (0, "historique_non")
    assert lire_multigrades("") == (None, "non_renseigne")
    assert lire_multigrades(7)[1] == "incoherent" and lire_multigrades("x")[1] == "invalide"


def test_meme_calcul_pour_francophones_et_anglophones():
    for mg in ("", 0, 2, "Oui"):
        fr = _ind(eleves=250, multigrade=mg, sous_systeme="Francophone")
        en = _ind(eleves=250, multigrade=mg, sous_systeme="Anglophone")
        assert dataclasses.astuple(fr) == dataclasses.astuple(en)


# --- Excédents -------------------------------------------------------------------------------------------------------

def test_excedent_complet_avec_multigrade_vide():
    i = _ind(eleves=100, enseignants=8, multigrade="")
    assert (i.De, i.xe, i.xe_sur, i.xe_a_verifier, i.statut_besoin) == (3, 5, 5, 0, "confirme")
    assert i.est_excedentaire and not i.est_necessiteuse


def test_excedent_nul_si_effectif_inferieur_au_besoin():
    i = _ind(eleves=500, enseignants=6)
    assert (i.De, i.xe, i.be) == (8, 0, 2)


def test_effectif_inconnu_besoin_provisoire_et_excedent_non_mobilisable():
    e = construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_EE: 8, C.COL_ETAB_SSF: 10})
    i = calculer_indicateurs(e, defaut())
    assert not e.effectif_connu
    assert i.statut_besoin == "provisoire" and i.besoin_final_incertain
    assert i.De == 3 and i.xe == 5
    assert (i.xe_sur, i.xe_a_verifier) == (0, 5)
    assert i.Ce is None


def test_vivier_alimente_par_l_excedent_calcule_sur_effectifs_connus():
    ecole = _ecole(eleves=100, enseignants=8, multigrade="")
    ecole.ind = calculer_indicateurs(ecole, defaut())
    ens = [Enseignant(matricule=f"M{k}", ecole_attache="E", anciennete_poste=10, age=40) for k in range(8)]
    assert len(construire_vivier(ens, [ecole], defaut())) == 5


def test_vivier_exclut_les_ecoles_a_effectif_inconnu():
    ecole = construire_ecole({C.COL_ETAB_ID: "E", C.COL_ETAB_EE: 8, C.COL_ETAB_SSF: 10})
    ecole.ind = calculer_indicateurs(ecole, defaut())
    ens = [Enseignant(matricule=f"M{k}", ecole_attache="E", anciennete_poste=10, age=40) for k in range(8)]
    assert construire_vivier(ens, [ecole], defaut()) == []


def test_les_protections_individuelles_restent_appliquees():
    ecole = _ecole(eleves=100, enseignants=8)
    ecole.ind = calculer_indicateurs(ecole, defaut())
    ens = [Enseignant(matricule=f"M{k}", ecole_attache="E", anciennete_poste=1, age=40) for k in range(8)]
    assert construire_vivier(ens, [ecole], defaut()) == []        # ancienneté au poste inférieure au seuil
    ens = [Enseignant(matricule=f"M{k}", ecole_attache="E", anciennete_poste=10, age=40) for k in range(8)]
    retenus = construire_vivier(ens, [ecole], defaut(), exclus={"M0", "M1"})            # faits du Prince exclus
    assert len(retenus) == 5 and not {"M0", "M1"} & {e.matricule for e in retenus}


# --- Les paramètres changent réellement le résultat ----------------------------------------------------------------

def test_modifier_M_change_le_besoin():
    assert _ind(_cfg(plancher_pedagogique=4), eleves=100).De == 4
    assert _ind(_cfg(plancher_pedagogique=1), eleves=100).De == 2       # ⌈80 ÷ 60⌉


def test_modifier_R_change_le_besoin():
    assert _ind(_cfg(norme_eleves_par_maitre=74.4), eleves=500).De == 7     # ⌈480 ÷ 74,4⌉ = ⌈6,45⌉
    assert _ind(_cfg(norme_eleves_par_maitre=30), eleves=500).De == 16


def test_modifier_T_change_le_besoin():
    assert _ind(_cfg(effectif_premiere_section=80), eleves=500).De == 7     # ⌈420 ÷ 60⌉
    assert _ind(_cfg(effectif_premiere_section=0), eleves=500).De == 9      # ⌈500 ÷ 60⌉


def test_la_norme_garde_sa_precision_decimale():
    cfg, _ = valider({"besoin": {"norme_eleves_par_maitre": 74.4}})
    assert cfg["besoin"]["norme_eleves_par_maitre"] == 74.4
    assert calculer_indicateurs(_ecole(eleves=94.4), cfg).Pe == 1          # aucune erreur d'arrondi flottant
    assert calculer_indicateurs(_ecole(eleves=95), cfg).Pe == 2
    assert besoin_rem(402, 74.4) == 6


# --- Capacité des salles inchangée -------------------------------------------------------------------------------

def test_capacite_des_salles():
    i = _ind(eleves=500, enseignants=4, simple=3, double=1)
    assert i.De == 8 and i.BMAX == 5 and i.Ke == 5
    assert i.be == 1 and i.se == 3 and i.xe == 0
    assert _ind(_cfg(double_flux_autorise=False), eleves=500, simple=3, double=1).BMAX == 4
    assert i.De == max(i.Pe, i.me)


def test_salles_dont_le_flux_est_incertain():
    sans = construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_NE: 100, C.COL_ETAB_SSF: 6})
    avec = construire_ecole({C.COL_ETAB_ID: "A", C.COL_ETAB_NE: 100, C.COL_ETAB_SSF: 6, C.COL_ETAB_SDF: 0})
    assert calculer_indicateurs(sans, defaut()).bmax_incertain
    assert not calculer_indicateurs(avec, defaut()).bmax_incertain


# --- Paramétrage -------------------------------------------------------------------------------------------------

def test_validation_des_trois_parametres():
    for mauvais in ({"norme_eleves_par_maitre": 0}, {"effectif_premiere_section": 80}, {"plancher_pedagogique": 0},
                    {"plancher_pedagogique": 2.5}, {"plancher_pedagogique": 31}):
        with pytest.raises(ParametresInvalides):
            valider({"besoin": mauvais})
    with pytest.raises(ParametresInvalides):
        valider({"besoin": {"inconnu": 1}})


def test_reglages_multigrades_supprimes_mais_tolerees_dans_les_anciennes_configurations():
    anciens = {"minimum_selon_multigrades": True, "groupes_secours": 6, "nombre_niveaux": 6,
               "niveaux_par_maitre_multigrade": 2, "groupes_depuis_classes_ouvertes": False,
               "mobiliser_excedent_incertain": False, "plancher_pedagogique": 4}
    cfg, _ = valider({"besoin": anciens})
    assert cfg["besoin"]["plancher_pedagogique"] == 4
    assert not set(anciens) - {"plancher_pedagogique"} & set(cfg["besoin"])
    assert set(cfg["besoin"]) == {"norme_eleves_par_maitre", "effectif_premiere_section", "plancher_pedagogique",
                                  "double_flux_autorise"}
    # Une surcharge enregistrée avant la suppression ne casse pas la lecture de la configuration.
    lu = cfg_dom.fusionner(cfg_dom.DEFAULT_CONFIG, {"besoin": anciens})
    assert lu["besoin"]["plancher_pedagogique"] == 4 and "groupes_secours" not in lu["besoin"]


def test_configuration_historique_de_comparaison():
    h = config_historique()
    assert (h["besoin"]["norme_eleves_par_maitre"], h["besoin"]["effectif_premiere_section"],
            h["besoin"]["plancher_pedagogique"]) == (60, 20, 3)
    assert calculer_indicateurs(_ecole(eleves=402), h).Pe == 7


def test_aucune_nouvelle_colonne_d_importation():
    assert C.COLONNES_ATTENDUES_ETAB[-1] == "Classes_Multigrades"
    assert C.COLONNES_OPTIONNELLES_ETAB == ["nom_etab", "type_etab", "latitude", "longitude", "Classes_Ouvertes"]


# --- Enregistrement et application côté API ----------------------------------------------------------------------

@pytest.mark.django_db
def test_les_trois_parametres_enregistres_sont_appliques_par_le_backend(drh):
    import json
    B = "/api/v1/"
    J = "application/json"
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 30, "nb_enseignants": 200}, content_type=J)
    assert r.status_code == 201, r.content
    jeu = r.json()["id"]

    def ecoles():
        d = drh.get(B + f"jeux/{jeu}/diagnostic/", {"taille": 500}).json()
        return d["ecoles"]["resultats"]

    # Valeurs initiales de référence, restituées par le backend.
    b = drh.get(B + f"jeux/{jeu}/parametres/").json()
    besoin = (b.get("parametres") or b)["besoin"]
    assert (besoin["plancher_pedagogique"], besoin["norme_eleves_par_maitre"],
            besoin["effectif_premiere_section"]) == (3, 60, 20)
    avant = ecoles()

    # Enregistrer M = 5, R = 74,4, T = 30 : scénarios obsolètes, besoin recalculé avec les valeurs enregistrées.
    r = drh.patch(B + f"jeux/{jeu}/parametres/", json.dumps({"besoin": {
        "plancher_pedagogique": 5, "norme_eleves_par_maitre": 74.4, "effectif_premiere_section": 30}}),
        content_type=J)
    assert r.status_code == 200, r.content
    assert r.json()["scenarios_obsoletes"] > 0
    recharge = drh.get(B + f"jeux/{jeu}/parametres/").json()
    besoin = (recharge.get("parametres") or recharge)["besoin"]
    assert (besoin["plancher_pedagogique"], besoin["norme_eleves_par_maitre"],
            besoin["effectif_premiere_section"]) == (5, 74.4, 30)
    apres = ecoles()
    assert apres != avant
    for e in apres:
        n = e["Effectif_Eleves_Attendus"]
        attendu = max(5, max(1, -(-int((n - 30) * 10) // 744))) if n > 30 else 5
        assert e["De"] == attendu, (e["Identifiant_Ecole"], n, e["De"], attendu)

    # Une ancienne surcharge (réglages multigrades) est tolérée et n'a plus aucun effet.
    r = drh.patch(B + f"jeux/{jeu}/parametres/", json.dumps({"besoin": {
        "minimum_selon_multigrades": True, "groupes_secours": 6, "mobiliser_excedent_incertain": True}}),
        content_type=J)
    assert r.status_code == 200, r.content
    assert ecoles() == apres


@pytest.mark.django_db
def test_une_simulation_archivee_avec_l_ancienne_methode_reste_identifiable(drh):
    from contextes.simulation import services as sim
    from contextes.simulation.models import ResultatSimulation, Scenario
    B = "/api/v1/"
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 100}, content_type="application/json")
    jeu = r.json()["id"]
    sc = Scenario.objects.filter(jeu_id=jeu).first()
    sim.calculer(sc)
    sc.refresh_from_db()
    assert sc.resultat.config[sim.MARQUE_REGLES]["besoin"] == sim.METHODE_BESOIN
    assert not sim.est_obsolete(sc)
    # Résultat archivé avant la méthode unique : conservé, mais signalé obsolète et non présenté comme récent.
    res = sc.resultat
    config = dict(res.config)
    config[sim.MARQUE_REGLES] = {k: v for k, v in config[sim.MARQUE_REGLES].items() if k != "besoin"}
    ResultatSimulation.objects.filter(pk=res.pk).update(config=config)
    sc = Scenario.objects.get(pk=sc.pk)
    assert ResultatSimulation.objects.filter(scenario=sc).exists()
    assert sim.est_obsolete(sc)
    assert sim.resume_scenario(sc)["obsolete"] is True
