"""Chaque réglage de la configuration du moteur change réellement un résultat (sinon il est déclaré inactif ici)."""
import copy
import json

import pytest

from domaine.donnees.demonstration import construire_jeu_demonstration
from domaine.donnees.modeles import construire_ecole, construire_enseignant
from domaine.mobilite.moteur import lancer_affectation
from domaine.parametrage.config import defaut

#: Réglages lus par le code mais sans effet démontrable sur le jeu fictif ci-dessous (donnée absente de ce jeu).
SANS_EFFET_SUR_LE_JEU_FICTIF: set = set()
#: Réglages présents dans la configuration mais lus par aucun calcul.
INACTIFS = {"regles_dreb.phase4_vivier_recrutement"}   # drapeau mort, à brancher ou retirer (lot 4)


def _feuilles(noeud, chemin=()):
    if isinstance(noeud, dict):
        for k, v in noeud.items():
            yield from _feuilles(v, chemin + (k,))
    else:
        yield chemin


def _changer(cfg, chemin):
    c = copy.deepcopy(cfg)
    n = c
    for k in chemin[:-1]:
        n = n[k]
    v = n[chemin[-1]]
    if isinstance(v, bool):
        n[chemin[-1]] = not v
    else:
        n[chemin[-1]] = v * 3 + 7 if v else 25
    return c


def _empreinte(cfg):
    e, n = construire_jeu_demonstration(11, 70, 700)
    # Du relief : structures d'encadrement, motifs ciblés, ancienneté et âges variés, pour que les ajustements et le
    # barème aient prise.
    for i, l in enumerate(e):
        if i % 6 == 0:
            l["type_etab"] = "IAEB"
    for i, l in enumerate(n):
        l["Motif_Bonification"] = f"Rapprochement de conjoint {l['Voeu_3']}" if l["Voeu_3"] else ""
        l["Situation_Matrimoniale"] = ["Célibataire", "Marié", "Divorcé", "Veuf"][i % 4]
        l["Age"] = 24 + (i * 7) % 36
        l["Anciennete_Poste_Actuel"] = (i * 3) % 14
    r = lancer_affectation([construire_ecole(x) for x in e], [construire_enseignant(x) for x in n], copy.deepcopy(cfg))
    return json.dumps([r.affectations, r.etab_enrichi, r.synthese, r.postes_non_pourvus], sort_keys=True, default=str)


@pytest.mark.parametrize("chemin", [c for c in _feuilles(defaut())], ids=lambda c: ".".join(c))
def test_chaque_reglage_a_un_effet(chemin):
    nom = ".".join(chemin)
    base = _empreinte(defaut())
    modifie = _empreinte(_changer(defaut(), chemin))
    if nom in INACTIFS:
        assert modifie == base, f"{nom} est déclaré inactif mais change le résultat : le retirer de INACTIFS"
    elif nom in SANS_EFFET_SUR_LE_JEU_FICTIF:
        pytest.skip("effet non démontrable sur le jeu fictif")
    else:
        assert modifie != base, f"{nom} ne change aucun résultat : réglage inactif à déclarer ou à brancher"
