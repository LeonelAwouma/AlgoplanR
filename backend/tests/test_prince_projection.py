"""Faits du Prince appliqués aux bases avant l'algorithme (domaine/prince/projection.py et moteur)."""
import dataclasses

import pytest

from domaine.diagnostic.indicateurs import enrichir_ecoles
from domaine.donnees.demonstration import construire_jeu_demonstration
from domaine.donnees.modeles import Ecole, Enseignant, construire_ecole, construire_enseignant
from domaine.mobilite.analyses import verifier_invariants
from domaine.mobilite.moteur import lancer_affectation
from domaine.parametrage.config import defaut
from domaine.prince.projection import APPLIQUE, APPLIQUE_AVEC_ALERTE, REJETE, appliquer_effets_prince


def _ecole(ident, eleves, enseignants, salles=7, ss="Francophone"):
    return Ecole(id=ident, sous_systeme=ss, region="Centre", departement="Mfoundi", commune="Yaoundé",
                 effectif_eleves=eleves, enseignants_actuels=enseignants, salles_simple_flux=salles,
                 nom=f"Ecole {ident}")


def _ens(mat, ecole, ss="Francophone", anciennete=10, age=40):
    return Enseignant(matricule=mat, ecole_attache=ecole, sous_systeme=ss, anciennete_poste=anciennete, age=age)


@pytest.fixture
def cfg():
    return defaut()


@pytest.fixture
def exemple(cfg):
    """École A (240 élèves, 5 maîtres) et école B (180 élèves, 3 maîtres), 7 salles chacune.

    BMAX = 7 est une capacité physique, pas un besoin : la dotation est D = max(P, m) = 6, donc K = min(D, BMAX) = 6.
    """
    ecoles = enrichir_ecoles([_ecole("A", 240, 5), _ecole("B", 180, 3)], cfg)
    assert all((e.ind.BMAX, e.ind.De, e.ind.Ke) == (7, 6, 6) for e in ecoles)
    ens = [_ens("ENS001", "A")] + [_ens(f"A{i}", "A") for i in range(4)] + [_ens(f"B{i}", "B") for i in range(3)]
    return ecoles, ens


def _fait(mat="ENS001", dest="B", motif="Décision"):
    return {"id_ens": mat, "id_etab": dest, "motif": motif}


def test_exemple_a_vers_b(exemple, cfg):
    ecoles, ens = exemple
    app = appliquer_effets_prince(ecoles, ens, [_fait()], cfg)
    a, b = {e.id: e for e in app.ecoles}["A"], {e.id: e for e in app.ecoles}["B"]
    avant_a, avant_b = ecoles[0], ecoles[1]

    assert (avant_a.enseignants_actuels, avant_b.enseignants_actuels) == (5, 3)
    assert (avant_a.ind.be, avant_b.ind.be) == (1, 3)
    assert (a.enseignants_actuels, b.enseignants_actuels) == (4, 4)
    assert (a.ind.be, b.ind.be) == (2, 2)
    # Élèves, classes et salles ne changent pas : P, m, D, BMAX et K non plus.
    for apres, avant in ((a, avant_a), (b, avant_b)):
        assert (apres.ind.Pe, apres.ind.me, apres.ind.De, apres.ind.BMAX, apres.ind.Ke) == (
            avant.ind.Pe, avant.ind.me, avant.ind.De, avant.ind.BMAX, avant.ind.Ke)
    assert avant_a.effectif_eleves / avant_a.enseignants_actuels == 48
    assert a.effectif_eleves / a.enseignants_actuels == 60             # REM de A : 48 -> 60
    assert avant_b.effectif_eleves / avant_b.enseignants_actuels == 60
    assert b.effectif_eleves / b.enseignants_actuels == 45             # REM de B : 60 -> 45

    rattache = {t.matricule: t.ecole_attache for t in app.enseignants}
    assert rattache["ENS001"] == "B" and rattache["A0"] == "A"
    assert app.deplaces == {"ENS001"}
    assert app.totaux_avant["enseignants"] == app.totaux_apres["enseignants"] == 8   # on ne crée personne
    assert app.totaux_avant["besoin_postes"] == 4 and app.totaux_apres["besoin_postes"] == 4


def test_les_entrees_ne_sont_pas_modifiees(exemple, cfg):
    ecoles, ens = exemple
    avant = ([dataclasses.asdict(e) for e in ecoles], [dataclasses.asdict(t) for t in ens])
    appliquer_effets_prince(ecoles, ens, [_fait()], cfg)
    assert ([dataclasses.asdict(e) for e in ecoles], [dataclasses.asdict(t) for t in ens]) == avant


def test_sans_fait_les_bases_sont_celles_d_origine(exemple, cfg):
    ecoles, ens = exemple
    app = appliquer_effets_prince(ecoles, ens, [], cfg)
    assert app.ecoles == ecoles and app.enseignants == ens and not app.deplaces
    assert app.totaux_avant == app.totaux_apres


def test_annuler_un_fait_revient_aux_bases_d_origine(exemple, cfg):
    """On repart toujours des bases d'origine : retirer le fait de la liste rend l'état initial."""
    ecoles, ens = exemple
    deux = appliquer_effets_prince(ecoles, ens, [_fait(), _fait("A0", "B")], cfg)
    un = appliquer_effets_prince(ecoles, ens, [_fait()], cfg)
    zero = appliquer_effets_prince(ecoles, ens, [], cfg)
    assert {e.id: e.enseignants_actuels for e in deux.ecoles} == {"A": 3, "B": 5}
    assert {e.id: e.enseignants_actuels for e in un.ecoles} == {"A": 4, "B": 4}
    assert {e.id: e.enseignants_actuels for e in zero.ecoles} == {"A": 5, "B": 3}


@pytest.mark.parametrize("fait, motif", [
    (_fait("INCONNU"), "introuvable"),
    (_fait(dest="ZZZ"), "destination inconnue"),
    (_fait(dest="A"), "déjà rattaché"),
    ({"id_ens": "", "id_etab": "B"}, "manquant"),
])
def test_rejets(exemple, cfg, fait, motif):
    ecoles, ens = exemple
    app = appliquer_effets_prince(ecoles, ens, [fait], cfg)
    d = app.decisions[0]
    assert d.statut == REJETE and any(motif in m for m in d.rejets)
    assert not app.deplaces and [e.enseignants_actuels for e in app.ecoles] == [5, 3]


def test_ecole_d_origine_sans_enseignant_declare(cfg):
    ecoles = enrichir_ecoles([_ecole("A", 100, 0), _ecole("B", 100, 2)], cfg)
    app = appliquer_effets_prince(ecoles, [_ens("X", "A")], [_fait("X", "B")], cfg)
    assert app.decisions[0].statut == REJETE and "aucun enseignant" in app.decisions[0].rejets[0]


def test_doublons_et_decisions_contradictoires(exemple, cfg):
    ecoles, ens = exemple
    identiques = appliquer_effets_prince(ecoles, ens, [_fait(), _fait()], cfg)
    assert [d.statut for d in identiques.decisions][0] != REJETE
    assert identiques.decisions[1].statut == REJETE and "doublon" in identiques.decisions[1].rejets[0]
    assert {e.id: e.enseignants_actuels for e in identiques.ecoles} == {"A": 4, "B": 4}   # une seule application

    contradictoires = appliquer_effets_prince(ecoles, ens, [_fait(dest="B"), _fait(dest="A")], cfg)
    assert all(d.statut == REJETE for d in contradictoires.decisions)
    assert not contradictoires.deplaces
    inverse = appliquer_effets_prince(ecoles, ens, [_fait(dest="A"), _fait(dest="B")], cfg)
    assert all(d.statut == REJETE for d in inverse.decisions)


def test_alertes_sans_rejet(cfg):
    ecoles = enrichir_ecoles([_ecole("A", 240, 5), _ecole("B", 180, 6, salles=6, ss="Anglophone")], cfg)
    ens = [_ens("X", "A", anciennete=1)]
    app = appliquer_effets_prince(ecoles, ens, [_fait("X", "B")], cfg)
    d = app.decisions[0]
    assert d.statut == APPLIQUE_AVEC_ALERTE
    texte = " | ".join(d.alertes)
    assert "excédentaire" in texte            # A a 5 maîtres pour une dotation de 6
    assert "sous-système" in texte            # Francophone -> Anglophone
    assert "Ancienneté" in texte
    assert "Capacité physique" in texte       # B passe de 6 à 7 maîtres pour 6 salles
    assert {e.id: e.enseignants_actuels for e in app.ecoles} == {"A": 4, "B": 7}


def test_decision_sans_alerte(cfg):
    ecoles = enrichir_ecoles([_ecole("A", 100, 8), _ecole("B", 180, 3)], cfg)     # A : dotation De = 6 pour 8 maîtres
    # Effectifs déclarés = matricules rattachés (8 et 3) : aucun écart à signaler.
    ens = [_ens("X", "A")] + [_ens(f"A{i}", "A") for i in range(7)] + [_ens(f"B{i}", "B") for i in range(3)]
    app = appliquer_effets_prince(ecoles, ens, [_fait("X", "B")], cfg)
    assert app.decisions[0].statut == APPLIQUE and not app.decisions[0].alertes
    # Avec un seul matricule rattaché, l'écart d'effectif des deux écoles est annoncé dès la décision.
    seul = appliquer_effets_prince(ecoles, [_ens("X", "A")], [_fait("X", "B")], cfg)
    texte = " | ".join(seul.decisions[0].alertes)
    assert "école d'origine (8)" in texte and "école de destination (3)" in texte and "réconcilier" in texte


def test_ecarts_d_effectifs_signales(cfg):
    ecoles = enrichir_ecoles([_ecole("A", 240, 5), _ecole("B", 180, 3)], cfg)
    ens = [_ens("X", "A"), _ens("Y", "A")]                 # 5 maîtres déclarés, 2 matricules rattachés
    app = appliquer_effets_prince(ecoles, ens, [_fait("X", "B")], cfg)
    ecarts = {e["id_ecole"]: e for e in app.ecarts_effectifs}
    assert ecarts["A"]["enseignants_declares"] == 5 and ecarts["A"]["matricules_rattaches"] == 2
    assert ecarts["B"]["ecart"] == 3


# --- moteur -----------------------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def jeu():
    lignes_e, lignes_n = construire_jeu_demonstration(5, 80, 900)
    return [construire_ecole(x) for x in lignes_e], [construire_enseignant(x) for x in lignes_n]


def test_moteur_applique_le_prince_avant_les_postes_et_le_vivier(jeu):
    ecoles, ens = jeu
    cfg = defaut()
    base = lancer_affectation(ecoles, ens, cfg)
    membre = base.vivier[0]
    destination = base.ecoles_en_besoin[0]["Identifiant_Ecole"]
    res = lancer_affectation(ecoles, ens, cfg, faits_prince=[
        {"id_ens": membre["Matricule_Enseignant"], "id_etab": destination, "motif": "Test"},
        {"id_ens": "INCONNU", "id_etab": destination, "motif": "Test"}])

    s = res.synthese
    assert s["effet_de_prince"] == 1 and s["prince_rejetes"] == 1 and s["prince_appliques"] == 1
    # Le déplacé n'est plus dans le vivier ordinaire et ne réapparaît dans aucune affectation ordinaire.
    ids_vivier = {v["Matricule_Enseignant"] for v in res.vivier}
    assert membre["Matricule_Enseignant"] not in ids_vivier
    prince = [a for a in res.affectations if a["phase"] == "effet_de_prince"]
    assert [a["id_ens"] for a in prince] == [membre["Matricule_Enseignant"]]
    assert prince[0]["id_etab"] == destination and prince[0]["arbitrage"] == "fait_du_prince"
    assert [a for a in res.affectations if a["id_ens"] == membre["Matricule_Enseignant"]] == prince
    # Il ne consomme aucun poste ouvert : le besoin vient des bases recalculées, sans poste fictif.
    assert not any("_P_PRINCE_" in p["id_poste"] for p in res.postes_non_pourvus)
    assert s["besoin_total_avant_prince"] == base.synthese["besoin_total"]
    assert s["besoin_total"] <= base.synthese["besoin_total"]
    assert s["affectes"] + s["postes_non_pourvus"] == s["besoin_total"]
    assert s["affectes_total"] == s["affectes"] + 1
    # Les bilans du moteur restent vrais.
    assert [i for i in verifier_invariants(res.vers_dict()) if not i["ok"]] == []
    # Le journal garde la trace du rejet.
    rejets = [j for j in res.journal_audit if j["statut"] == "REJETE" and j["phase"] == "effet_de_prince"]
    assert len(rejets) == 1 and "introuvable" in rejets[0]["motif"]


def test_moteur_sans_fait_est_inchange(jeu):
    ecoles, ens = jeu
    cfg = defaut()
    a, b = lancer_affectation(ecoles, ens, cfg), lancer_affectation(ecoles, ens, cfg, faits_prince=[])
    assert a.affectations == b.affectations and a.synthese == b.synthese


def test_moteur_ne_compte_pas_deux_fois_les_arrivees_du_prince(jeu):
    ecoles, ens = jeu
    cfg = defaut()
    base = lancer_affectation(ecoles, ens, cfg)
    membre = base.vivier[0]
    destination = base.ecoles_en_besoin[0]["Identifiant_Ecole"]
    res = lancer_affectation(ecoles, ens, cfg, faits_prince=[
        {"id_ens": membre["Matricule_Enseignant"], "id_etab": destination, "motif": "Test"}])
    ligne = next(p for p in res.projections_n3 if p["Identifiant_Ecole"] == destination)
    assert membre["Matricule_Enseignant"] not in ligne["Enseignants_Arrivants_N"]
