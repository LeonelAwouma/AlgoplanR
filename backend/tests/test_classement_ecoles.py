"""Classement unique des écoles à besoin (méthodologie §3.3.4) : Up, écoles avant structures, puis REM."""
from domaine.diagnostic.synthese import attribuer_rangs, ordre_priorite, trier_par_priorite


def _e(ident, up, eleves=100, ens=2, type_etab="ECOLE", besoin=True, postes=1, rouge=False):
    return {"Identifiant_Ecole": ident, "Up": up, "Effectif_Eleves_Attendus": eleves, "Enseignants_Actuels": ens,
            "type_etab": type_etab, "est_necessiteuse": besoin, "nb_postes_ouverts": postes, "est_zone_rouge": rouge}


def test_poids_egaux_ecole_avant_structure_puis_rem_le_plus_eleve():
    lignes = [_e("IAEB1", 20, 500, 2, "IAEB"), _e("E_BAS", 20, 100, 2), _e("E_HAUT", 20, 300, 2),
              _e("E_PLUS_LOURDE", 25, 100, 5), _e("E_SANS_BESOIN", 99, besoin=False)]
    assert [e["Identifiant_Ecole"] for e in ordre_priorite(lignes)] == ["E_PLUS_LOURDE", "E_HAUT", "E_BAS", "IAEB1"]


def test_une_ecole_sans_maitre_et_avec_eleves_passe_en_premier_a_poids_egal():
    lignes = [_e("A", 20, 300, 2), _e("B", 20, 120, 0)]
    assert [e["Identifiant_Ecole"] for e in ordre_priorite(lignes)] == ["B", "A"]


def test_ordre_total_deterministe():
    lignes = [_e("B", 20), _e("A", 20)]
    assert [e["Identifiant_Ecole"] for e in ordre_priorite(lignes)] == ["A", "B"]
    assert [e["Identifiant_Ecole"] for e in ordre_priorite(list(reversed(lignes)))] == ["A", "B"]


def test_rangs_attribues_en_place_et_coherents_avec_la_liste_triee():
    lignes = [_e("C", 10), _e("A", 30), _e("B", 20), _e("Z", 99, besoin=False)]
    attribuer_rangs(lignes)
    assert {e["Identifiant_Ecole"]: e["rang_priorite"] for e in lignes} == {"A": 1, "B": 2, "C": 3, "Z": None}
    assert [(e["Identifiant_Ecole"], e["rang"]) for e in trier_par_priorite(lignes)] == [("A", 1), ("B", 2), ("C", 3)]
