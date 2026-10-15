"""La sélection rapide des phases 2 et 3 choisit exactement le poste de `choisir_meilleur_poste`."""
import copy
import random

import pytest

from domaine.diagnostic.indicateurs import enrichir_ecoles
from domaine.donnees.demonstration import construire_jeu_demonstration
from domaine.donnees.modeles import construire_ecole, construire_enseignant
from domaine.mobilite.moteur import choisir_meilleur_poste
from domaine.mobilite.selection import IndexPostes
from domaine.mobilite.vivier import construire_postes, construire_vivier, enrichir_enseignants, nettoyer_enseignants
from domaine.parametrage.config import defaut


def _cfg(variante: str) -> dict:
    cfg = defaut()
    if variante == "up_nul":            # le poids du poste ne départage plus : seul l'ordre compte
        cfg["poids_score_appariement"]["Z2_poids_poste_Up"] = 0.0
    elif variante == "proximite_forte":
        cfg["poids_score_appariement"].update(Z1_bareme_individu=0.0, Z3_proximite=0.9)
    elif variante == "ajustements_forts":
        cfg["poids_score_appariement"].update(Z2_poids_poste_Up=0.01, Z4_ajustements=0.9)
    return cfg


def _situation(graine: int, cfg: dict):
    """Postes et vivier d'un jeu de démonstration diversifié (structures, sous-systèmes vides, motifs)."""
    rnd = random.Random(graine)
    lignes_e, lignes_n = construire_jeu_demonstration(graine, 120, 700)
    for l in lignes_e:
        l["type_etab"] = rnd.choice(["ECOLE"] * 6 + ["IAEB", "DREB", "DELEGATION"])
    for l in lignes_n:
        if rnd.random() < 0.05:
            l["Sous_Systeme_Formation"] = ""
        if rnd.random() < 0.15:
            l["Motif_Bonification"] = f"Rapprochement {l['Voeu_2']}"
    ecoles = enrichir_ecoles([construire_ecole(l) for l in lignes_e], cfg)
    ens, _ = nettoyer_enseignants([construire_enseignant(l) for l in lignes_n], cfg)
    ens = enrichir_enseignants(ens, ecoles)
    for e in ens:
        if rnd.random() < 0.05:
            e.commune_attache = ""
        if rnd.random() < 0.05:
            e.departement_attache = ""
    postes = construire_postes(ecoles)
    # Quelques postes déjà pourvus, comme après les phases 0 et 1.
    for p in rnd.sample(postes, len(postes) // 5):
        p.pourvu = True
    return postes, construire_vivier(ens, ecoles, cfg) or ens[:80], rnd


@pytest.mark.parametrize("variante", ["defaut", "up_nul", "proximite_forte", "ajustements_forts"])
@pytest.mark.parametrize("graine", [1, 7, 2026])
def test_selection_identique(graine, variante):
    cfg = _cfg(variante)
    postes, vivier, rnd = _situation(graine, cfg)
    index = IndexPostes(postes)
    for contraintes in ({"contrainte_iaeb": True}, {"contrainte_dept": True}, {}):
        for e in vivier:
            libres = [p for p in postes if not p.pourvu]
            attendu = choisir_meilleur_poste(e, libres, cfg, **contraintes)
            obtenu = index.meilleur(e, cfg, **contraintes)
            assert obtenu is attendu, (e.matricule, contraintes)
            # Comme dans le moteur, le poste choisi est pourvu avant l'enseignant suivant.
            if obtenu is not None and rnd.random() < 0.5:
                obtenu.pourvu = True


def test_moteur_ne_modifie_pas_ses_entrees():
    """Les entrées ne sont copiées que superficiellement : le moteur ne doit modifier aucune d'elles."""
    import dataclasses

    from domaine.mobilite.moteur import lancer_affectation

    lignes_e, lignes_n = construire_jeu_demonstration(5, 80, 500)
    ecoles = [construire_ecole(l) for l in lignes_e]
    enseignants = [construire_enseignant(l) for l in lignes_n]
    avant = ([dataclasses.asdict(e) for e in ecoles], [dataclasses.asdict(e) for e in enseignants])
    lancer_affectation(ecoles, enseignants, defaut(), faits_prince=[
        {"id_ens": enseignants[0].matricule, "id_etab": ecoles[1].id, "motif": "test"}])
    assert ([dataclasses.asdict(e) for e in ecoles], [dataclasses.asdict(e) for e in enseignants]) == avant


def test_moteur_inchange_sur_plusieurs_graines():
    """Le moteur complet, sélection rapide comprise, garde la parité avec l'ancienne sélection."""
    from domaine.mobilite import moteur

    for graine in (3, 11):
        lignes_e, lignes_n = construire_jeu_demonstration(graine, 90, 600)
        args = ([construire_ecole(l) for l in lignes_e], [construire_enseignant(l) for l in lignes_n], defaut())
        rapide = moteur.lancer_affectation(*copy.deepcopy(args))
        moteur.SELECTION_RAPIDE = False
        try:
            lente = moteur.lancer_affectation(*copy.deepcopy(args))
        finally:
            moteur.SELECTION_RAPIDE = True
        assert rapide.affectations == lente.affectations
        assert rapide.postes_non_pourvus == lente.postes_non_pourvus
