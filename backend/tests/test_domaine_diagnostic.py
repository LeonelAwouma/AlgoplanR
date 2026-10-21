"""`totaux_diagnostic` : seule source des totaux territoriaux (diagnostic, synthèse, nœuds de l'arbre
territorial) — vérifié ligne à ligne pour que la future suppression du recalcul côté interface (lot 4.8) ne
change aucun chiffre déjà affiché."""
from domaine.diagnostic.synthese import synthese_par_sous_systeme, totaux_diagnostic
from domaine.diagnostic.territoires import _agreger, arbre_territorial


def _ecole(**kw) -> dict:
    base = {
        "Identifiant_Ecole": "E", "Classes_Multigrades": "Non", "Enseignants_Actuels": 0,
        "effectif_connu": True, "be": 0.0, "xe": 0.0, "se": 0.0, "ae": 0.0, "De": 0,
        "est_necessiteuse": False, "est_excedentaire": False, "est_zone_rouge": False,
    }
    base.update(kw)
    return base


def test_ecole_normale_avec_effectif_et_classes_connus():
    e = _ecole(Identifiant_Ecole="A", Effectif_Eleves_Attendus=120, Classes_Ouvertes=4, Enseignants_Actuels=3,
               be=2.0, nb_postes_ouverts=2, De=5, est_necessiteuse=True)
    t = totaux_diagnostic([e])
    assert t["nb_ecoles"] == 1
    assert t["besoin_postes"] == 2
    assert t["classes"] == 4
    assert t["effectif_total_eleves"] == 120
    assert t["eleves_par_enseignant_etat"] == 40.0
    assert t["eleves_par_classe"] == 30.0
    assert t["nb_ecoles_necessiteuses"] == 1
    assert t["nb_ecoles_satisfaisantes"] == 0


def test_ecole_sans_effectif_connu_absente_du_numerateur_et_du_denominateur():
    connue = _ecole(Identifiant_Ecole="A", Effectif_Eleves_Attendus=100, Classes_Ouvertes=2, Enseignants_Actuels=4)
    inconnue = _ecole(Identifiant_Ecole="B", effectif_connu=False, Effectif_Eleves_Attendus=999,
                       Enseignants_Actuels=50)
    t = totaux_diagnostic([connue, inconnue])
    # L'école sans effectif connu ne doit dénaturer ni le numérateur ni le dénominateur du ratio.
    assert t["effectif_total_eleves"] == 100
    assert t["eleves_par_enseignant_etat"] == 25.0
    # Mais ses enseignants restent comptés dans le total brut, indépendant du ratio.
    assert t["enseignants_en_poste"] == 54


def test_aucune_ecole_ne_renseigne_classes_ou_effectif_rend_null_pas_zero():
    e = _ecole(Identifiant_Ecole="A", effectif_connu=False, Enseignants_Actuels=3)
    t = totaux_diagnostic([e])
    assert t["classes"] is None
    assert t["effectif_total_eleves"] is None
    assert t["eleves_par_enseignant_etat"] is None
    assert t["eleves_par_classe"] is None


def test_classes_multigrades_compte_les_ecoles_qui_en_ont():
    a = _ecole(Identifiant_Ecole="A", Classes_Multigrades="Oui")
    b = _ecole(Identifiant_Ecole="B", Classes_Multigrades="Non")
    assert totaux_diagnostic([a, b])["classes_multigrades"] == 1


def test_excedent_mobilisable_utilise_le_vivier_rattache_borne_par_xe():
    # Le vivier rattaché (mobilisables) peut être strictement inférieur à l'excédent théorique (xe) : l'ancienneté
    # de poste insuffisante laisse des enseignants en place malgré l'excédent.
    avec_vivier = _ecole(Identifiant_Ecole="A", xe=5.0, mobilisables=2, est_excedentaire=True)
    sans_champ_vivier = _ecole(Identifiant_Ecole="B", xe=3.0, est_excedentaire=True)
    t = totaux_diagnostic([avec_vivier, sans_champ_vivier])
    assert t["excedent_enseignants"] == 8   # xe brut : 5 + 3
    assert t["excedent_mobilisable"] == 5   # vivier réel : 2 (borné) + 3 (repli sur xe faute du champ)


def test_ecole_a_examiner_sans_besoin_ni_excedent_mais_en_surnombre():
    # a_examiner : ni nécessiteuse (be<=0) ni excédentaire (xe<=0), mais un surnombre lié aux salles (ae>0).
    e = _ecole(Identifiant_Ecole="A", be=0.0, xe=0.0, ae=1.0)
    t = totaux_diagnostic([e])
    assert t["nb_ecoles_a_examiner"] == 1
    assert t["surnombre"] == 1
    assert t["nb_ecoles_satisfaisantes"] == 1  # be == 0 : aucun besoin


def test_autres_enseignants_et_postes_declares_toujours_absents():
    t = totaux_diagnostic([_ecole(Identifiant_Ecole="A")])
    assert t["autres_enseignants"] is None
    assert t["postes_declares"] is None


def test_agreger_territorial_delegue_a_totaux_diagnostic():
    """`_agreger` (nœuds de l'arbre territorial) ne doit pas recalculer une seconde formule : les mêmes écoles
    donnent les mêmes totaux qu'au niveau du diagnostic plat."""
    ecoles = [
        _ecole(Identifiant_Ecole="A", Effectif_Eleves_Attendus=80, Classes_Ouvertes=2, Enseignants_Actuels=4,
               be=1.0, nb_postes_ouverts=1, est_necessiteuse=True),
        _ecole(Identifiant_Ecole="B", xe=2.0, est_excedentaire=True),
    ]
    assert _agreger(ecoles) == totaux_diagnostic(ecoles)


# --- `synthese_par_sous_systeme` : mêmes scénarios que le test de référence du frontend (tests/attrition.test.ts,
# « synthèse territoriale : recrutement à prévoir »), pour vérifier que la future version serveur donne les mêmes
# nombres avant de retirer le calcul côté interface. ---

def _hyp(methode: str, taux_unique: float = 2.25) -> dict:
    return {"attrition": {"methode": methode, "taux_unique": taux_unique,
                           "par_region": {"Centre": 1.92, "Nord": 3.5, "sud-ouest": 4.1},
                           "par_sous_systeme": {"francophone": 2.0, "anglophone": 3.0}}}


def test_sous_systeme_ajoute_attrition_au_besoin_restant():
    diagnostics = [
        {"Identifiant_Ecole": "A", "Region": "Centre", "Sous_Systeme": "francophone", "Enseignants_Actuels": 100,
         "Ke": 110, "De": 110, "se": 0.0},
        {"Identifiant_Ecole": "B", "Region": "Nord", "Sous_Systeme": "francophone", "Enseignants_Actuels": 60,
         "Ke": 55, "De": 55, "se": 0.0},
        {"Identifiant_Ecole": "C", "Region": "Nord", "Sous_Systeme": "anglophone", "Enseignants_Actuels": 40,
         "Ke": 40, "De": 40, "se": 0.0},
    ]
    s = synthese_par_sous_systeme(diagnostics, _hyp("taux_unique", taux_unique=3))
    franco = next(g for g in s["par_sous_systeme"] if g["sous_systeme"] == "francophone")
    anglo = next(g for g in s["par_sous_systeme"] if g["sous_systeme"] == "anglophone")
    # francophone : besoin 10 (école A), excédent 5 (école B) -> restant 5 ; attrition arrondi(3 % x 160) = 5
    assert franco["restant"] == 5
    assert franco["recrutement_a_prevoir"] == 5 + 5
    # anglophone : rien à couvrir ; attrition arrondi(3 % x 40) = 1
    assert anglo["recrutement_a_prevoir"] == 1


def test_sous_systeme_suit_les_hypotheses():
    diagnostics = [
        {"Identifiant_Ecole": "A", "Region": "Centre", "Sous_Systeme": "francophone", "Enseignants_Actuels": 100,
         "Ke": 110, "De": 110, "se": 0.0},
    ]
    faible = synthese_par_sous_systeme(diagnostics, _hyp("taux_unique", taux_unique=1))
    fort = synthese_par_sous_systeme(diagnostics, _hyp("taux_unique", taux_unique=6))
    assert fort["recrutement_a_prevoir"] > faible["recrutement_a_prevoir"]


def test_sous_systeme_effectif_retenu_remplace_effectif_actuel():
    diagnostics = [
        {"Identifiant_Ecole": "A", "Region": "Centre", "Sous_Systeme": "francophone", "Enseignants_Actuels": 100,
         "Ke": 110, "De": 110, "se": 0.0},
    ]
    # Sans effectif retenu : besoin calculé sur Enseignants_Actuels (100).
    avant = synthese_par_sous_systeme(diagnostics, _hyp("taux_unique", taux_unique=0))
    assert avant["besoin"] == 10
    # Avec un effectif retenu après un plan (105), le besoin suit ce nouvel effectif, pas la colonne brute.
    apres = synthese_par_sous_systeme(diagnostics, _hyp("taux_unique", taux_unique=0), effectifs={"A": 105})
    assert apres["besoin"] == 5


def test_sous_systeme_aucun_besoin_ni_excedent_rend_alea_null():
    assert synthese_par_sous_systeme([], _hyp("taux_unique"))["degre_alea"] is None


# --- `arbre_territorial` : arbre complet nation -> arrondissement, pour que la navigation ne déclenche plus un
# second appel serveur par clic (lot 4.8). ---

def test_arbre_descend_jusqu_a_l_arrondissement_et_compte_toutes_les_ecoles():
    ecoles = [
        _ecole(Identifiant_Ecole="A", Region="Centre", Departement="Mfoundi", Commune="Yaoundé I"),
        _ecole(Identifiant_Ecole="B", Region="Centre", Departement="Mfoundi", Commune="Yaoundé II"),
        _ecole(Identifiant_Ecole="C", Region="Centre", Departement="Nyong-et-Kéllé", Commune="Akonolinga"),
        _ecole(Identifiant_Ecole="D", Region="Littoral", Departement="Wouri", Commune="Douala I"),
    ]
    arbre = arbre_territorial(ecoles)
    assert arbre["niveau"] == "national" and len(arbre["enfants"]) == 2  # Centre, Littoral
    centre = next(r for r in arbre["enfants"] if r["libelle"] == "Centre")
    assert len(centre["enfants"]) == 2  # Mfoundi, Nyong-et-Kéllé
    mfoundi = next(d for d in centre["enfants"] if d["libelle"] == "Mfoundi")
    assert {c["libelle"] for c in mfoundi["enfants"]} == {"Yaoundé I", "Yaoundé II"}
    assert {e["Identifiant_Ecole"] for e in ecoles} == _toutes_ecoles(arbre)
    # Chaque nœud intermédiaire n'a pas d'identifiants d'écoles : seul l'arrondissement en porte.
    assert centre["ecoles"] == [] and mfoundi["ecoles"] == []
    yaounde1 = next(c for c in mfoundi["enfants"] if c["libelle"] == "Yaoundé I")
    assert yaounde1["ecoles"] == ["A"]


def _toutes_ecoles(noeud: dict) -> set:
    vus = set(noeud["ecoles"])
    for enfant in noeud["enfants"]:
        vus |= _toutes_ecoles(enfant)
    return vus


def test_arbre_territoire_non_renseigne_forme_un_noeud_stable_distinct():
    ecoles = [
        _ecole(Identifiant_Ecole="A", Region="Centre", Departement="Mfoundi", Commune="Yaoundé I"),
        _ecole(Identifiant_Ecole="B", Region="", Departement="", Commune=""),
        _ecole(Identifiant_Ecole="C", Region="", Departement="", Commune=""),
    ]
    arbre = arbre_territorial(ecoles)
    non_renseigne = next(r for r in arbre["enfants"] if r["libelle"] == "(non renseigné)")
    assert non_renseigne["totaux"]["nb_ecoles"] == 2
    assert _toutes_ecoles(non_renseigne) == {"B", "C"}


def test_arbre_totaux_de_chaque_noeud_egalent_totaux_diagnostic_des_memes_ecoles():
    ecoles = [
        _ecole(Identifiant_Ecole="A", Region="Centre", Departement="Mfoundi", Commune="Yaoundé I",
               Effectif_Eleves_Attendus=80, Classes_Ouvertes=2, Enseignants_Actuels=4, be=1.0,
               nb_postes_ouverts=1, est_necessiteuse=True),
        _ecole(Identifiant_Ecole="B", Region="Centre", Departement="Mfoundi", Commune="Yaoundé II",
               xe=3.0, est_excedentaire=True),
    ]
    arbre = arbre_territorial(ecoles)
    assert arbre["totaux"] == totaux_diagnostic(ecoles)
    centre = arbre["enfants"][0]
    assert centre["totaux"] == totaux_diagnostic(ecoles)  # toutes les écoles sont en Centre
    mfoundi = centre["enfants"][0]
    assert mfoundi["totaux"] == totaux_diagnostic(ecoles)


def test_arbre_depart_d_un_delegue_commence_a_sa_region_jamais_au_national():
    ecoles = [
        _ecole(Identifiant_Ecole="A", Region="Centre", Departement="Mfoundi", Commune="Yaoundé I"),
        _ecole(Identifiant_Ecole="B", Region="Littoral", Departement="Wouri", Commune="Douala I"),
    ]
    # Le périmètre restreint (service `arbre()`) ne garde que les écoles du délégué avant l'appel : ici, on
    # simule directement ce que fait l'appelant en ne passant que les écoles déjà filtrées.
    seules_centre = [e for e in ecoles if e["Region"] == "Centre"]
    arbre = arbre_territorial(seules_centre, niveau="region", region="Centre")
    assert arbre["niveau"] == "region" and arbre["libelle"] == "Centre"
    assert _toutes_ecoles(arbre) == {"A"}
