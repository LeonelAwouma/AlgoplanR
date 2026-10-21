"""Indicateurs territoriaux du lot 4 (domaine pur) : couverture des besoins (E10), degré d'aléa qualifié (E5),
couverture PAREC. Le jeu de cinq écoles ci-dessous est celui présenté et validé avant l'implémentation du
sous-lot 4.6 : les nombres sont vérifiés à la main dans le commentaire de chaque école."""
import pytest

from domaine.rapport.territorial import (
    LigneEcoleCouverture,
    LigneEcoleParec,
    NON_CALCULABLE,
    INDICATIF,
    NORMAL,
    SANS_OBJET,
    alea_qualifie,
    couverture_globale,
    couverture_operationnelle,
    couverture_parec,
    qualifier_alea,
)

# --- Le jeu de cinq écoles validé avant l'implémentation --------------------------------------------------------
# E1 : gain (9-5=4) dépasse le besoin initial (2) -> plafonné à 2, aucun effet du Prince.
# E2 : le Prince comble partiellement le besoin (3->5, +2) ; le scénario n'ajoute rien de plus.
# E3 : le Prince comble entièrement le besoin (4->7, +3) ; le scénario n'ajoute rien de plus.
# E4 : le Prince retire 2 enseignants à une école sans besoin initial -> crée un déficit après Prince.
# E5 : école déjà à la cible (besoin nul des deux côtés) qui reçoit tout de même 1 enseignant par le scénario.
E1 = LigneEcoleCouverture(id="E1", besoin_initial=2, effectif_initial=5.0, besoin_apres_prince=2,
                         effectif_apres_prince=5.0, effectif_apres_simulation=9.0)
E2 = LigneEcoleCouverture(id="E2", besoin_initial=5, effectif_initial=3.0, besoin_apres_prince=3,
                         effectif_apres_prince=5.0, effectif_apres_simulation=5.0)
E3 = LigneEcoleCouverture(id="E3", besoin_initial=3, effectif_initial=4.0, besoin_apres_prince=0,
                         effectif_apres_prince=7.0, effectif_apres_simulation=7.0)
E4 = LigneEcoleCouverture(id="E4", besoin_initial=0, effectif_initial=6.0, besoin_apres_prince=2,
                         effectif_apres_prince=4.0, effectif_apres_simulation=4.0)
E5 = LigneEcoleCouverture(id="E5", besoin_initial=0, effectif_initial=5.0, besoin_apres_prince=0,
                         effectif_apres_prince=5.0, effectif_apres_simulation=6.0)
CINQ_ECOLES = [E1, E2, E3, E4, E5]


def test_couverture_globale_cas_valides_a_la_main():
    assert couverture_globale([E1]) == {"numerateur": 2, "denominateur": 2, "taux": 100.0, "statut": NORMAL,
                                        "raison": None}
    assert couverture_globale([E2])["numerateur"] == 2            # min(5, max(0,5-3)=2) = 2 : Prince crédité ici
    assert couverture_globale([E3])["numerateur"] == 3            # min(3, max(0,7-4)=3) = 3
    assert couverture_globale([E4]) == {"numerateur": 0, "denominateur": 0, "taux": None, "statut": SANS_OBJET,
                                        "raison": "Aucun besoin initial sur ce périmètre"}  # perte non comptée, besoin nul
    assert couverture_globale([E5])["numerateur"] == 0            # affectation sans besoin initial : jamais créditée

    national = couverture_globale(CINQ_ECOLES)
    assert national == {"numerateur": 7, "denominateur": 10, "taux": 70.0, "statut": NORMAL, "raison": None}


def test_couverture_operationnelle_cas_valides_a_la_main():
    assert couverture_operationnelle([E1])["numerateur"] == 2
    assert couverture_operationnelle([E2]) == {"numerateur": 0, "denominateur": 3, "taux": 0.0, "statut": NORMAL,
                                               "raison": None}  # le scénario n'a rien fait de plus que le Prince
    assert couverture_operationnelle([E3]) == {"numerateur": 0, "denominateur": 0, "taux": None,
                                               "statut": SANS_OBJET,
                                               "raison": "Aucun besoin après Prince sur ce périmètre"}
    assert couverture_operationnelle([E4])["numerateur"] == 0 and couverture_operationnelle([E4])["denominateur"] == 2
    assert couverture_operationnelle([E5]) == {"numerateur": 0, "denominateur": 0, "taux": None,
                                               "statut": SANS_OBJET,
                                               "raison": "Aucun besoin après Prince sur ce périmètre"}

    national = couverture_operationnelle(CINQ_ECOLES)
    assert national == {"numerateur": 2, "denominateur": 7, "taux": pytest.approx(28.6), "statut": NORMAL,
                        "raison": None}


def test_les_deux_indicateurs_de_couverture_divergent_et_ne_sont_pas_une_moyenne():
    """Validation explicite (point 5 demandé) : les deux indicateurs donnent des résultats différents sur le
    même jeu, et aucun des deux n'est recalculable comme une moyenne des taux par école."""
    g, o = couverture_globale(CINQ_ECOLES), couverture_operationnelle(CINQ_ECOLES)
    assert g["taux"] == 70.0 and o["taux"] == pytest.approx(28.6)
    assert g["taux"] != o["taux"]


def test_agregation_territoriale_departement_region_national():
    """Point 6 demandé : la même liste d'écoles, agrégée à trois niveaux, où chaque niveau est recalculé sur ses
    écoles (jamais une moyenne de ses enfants). Hiérarchie : Région A = {A1: [E1, E2], A2: [E3]} ;
    Région B = Département B1 = [E4, E5]."""
    dept_a1, dept_a2 = [E1, E2], [E3]
    region_a = dept_a1 + dept_a2
    dept_b1 = region_b = [E4, E5]
    national = region_a + region_b

    assert couverture_globale(dept_a1) == {"numerateur": 4, "denominateur": 7, "taux": pytest.approx(57.1),
                                           "statut": NORMAL, "raison": None}
    assert couverture_globale(dept_a2)["taux"] == 100.0
    assert couverture_globale(region_a) == {"numerateur": 7, "denominateur": 10, "taux": 70.0, "statut": NORMAL,
                                            "raison": None}
    assert couverture_globale(dept_b1)["statut"] == SANS_OBJET            # besoin initial nul des deux écoles
    assert couverture_globale(national)["taux"] == 70.0                  # = couverture_globale(région A)
    # Région A = somme de ses départements, pas une moyenne des deux taux (57,1 % et 100 % ne moyennent pas à 70 %).
    assert couverture_globale(region_a)["taux"] != (couverture_globale(dept_a1)["taux"]
                                                     + couverture_globale(dept_a2)["taux"]) / 2

    assert couverture_operationnelle(dept_a1) == {"numerateur": 2, "denominateur": 5, "taux": 40.0,
                                                   "statut": NORMAL, "raison": None}
    assert couverture_operationnelle(dept_a2)["statut"] == SANS_OBJET
    assert couverture_operationnelle(region_a)["taux"] == 40.0            # = dept_a1, puisque a2 ne pèse pas (0/0)
    assert couverture_operationnelle(dept_b1) == {"numerateur": 0, "denominateur": 2, "taux": 0.0,
                                                   "statut": NORMAL, "raison": None}
    assert couverture_operationnelle(national)["taux"] == pytest.approx(28.6)
    assert couverture_operationnelle(national)["denominateur"] == (couverture_operationnelle(region_a)["denominateur"]
                                                                    + couverture_operationnelle(region_b)["denominateur"])


def test_couverture_globale_sans_aucun_besoin_est_sans_objet():
    assert couverture_globale([]) == {"numerateur": 0, "denominateur": 0, "taux": None, "statut": SANS_OBJET,
                                      "raison": "Aucun besoin initial sur ce périmètre"}


# --- Degré d'aléa qualifié (E5) ----------------------------------------------------------------------------------

def test_qualifier_alea_trois_paliers():
    assert qualifier_alea(0) == NON_CALCULABLE and qualifier_alea(2) == NON_CALCULABLE
    assert qualifier_alea(3) == INDICATIF and qualifier_alea(9) == INDICATIF
    assert qualifier_alea(10) == NORMAL and qualifier_alea(500) == NORMAL


def test_alea_qualifie_non_calculable_masque_la_valeur():
    # Même si une valeur a été calculée en amont, une école isolée (ou un périmètre trop pauvre) ne l'affiche pas.
    assert alea_qualifie(0.42, None, 2) == {"valeur": None, "statut": NON_CALCULABLE,
                                            "raison": "Moins de 3 écoles avec un effectif d'élèves connu"}


def test_alea_qualifie_indicatif_et_normal_affichent_la_valeur():
    assert alea_qualifie(0.5, None, 5) == {"valeur": 0.5, "statut": INDICATIF, "raison": None}
    assert alea_qualifie(0.3, None, 42) == {"valeur": 0.3, "statut": NORMAL, "raison": None}


def test_alea_qualifie_garde_la_raison_existante_si_non_calculable_pour_une_autre_cause():
    # ex. tous les effectifs d'élèves identiques : `alea_et_raison` renvoie déjà (None, raison), même à 20 écoles.
    assert alea_qualifie(None, "Tous les effectifs d'élèves sont identiques", 20) == {
        "valeur": None, "statut": NORMAL, "raison": "Tous les effectifs d'élèves sont identiques"}


# --- Couverture PAREC ----------------------------------------------------------------------------------------

def test_couverture_parec():
    lignes = [
        LigneEcoleParec(id="A", eleves=150, enseignants=3),     # grande, couverte
        LigneEcoleParec(id="B", eleves=120, enseignants=2),     # grande, non couverte
        LigneEcoleParec(id="C", eleves=90, enseignants=1),      # petite : hors dénominateur
        LigneEcoleParec(id="D", eleves=101, enseignants=5),     # grande, couverte
    ]
    assert couverture_parec(lignes) == {"numerateur": 2, "denominateur": 3, "taux": pytest.approx(66.7),
                                        "statut": NORMAL, "raison": None}


def test_couverture_parec_sans_grande_ecole_est_sans_objet():
    assert couverture_parec([LigneEcoleParec(id="C", eleves=90, enseignants=1)]) == {
        "numerateur": 0, "denominateur": 0, "taux": None, "statut": SANS_OBJET,
        "raison": "Aucune école de plus de 100 élèves sur ce périmètre"}
