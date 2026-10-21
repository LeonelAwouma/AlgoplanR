"""Le contrôle de qualité refuse proprement les lignes inexploitables : jamais d'exception, jamais de calcul fou."""
import pytest

from domaine.commun.texte import nombre, nombre_ou_none
from domaine.donnees import colonnes as C
from domaine.donnees.demonstration import construire_jeu_demonstration
from domaine.parametrage.config import defaut
from domaine.qualite.rapport import VALEUR_MAX, controler


def _codes(rapport, cle="erreurs"):
    return {a["code"] for a in rapport[cle]}


def test_une_ligne_sans_matricule_mais_avec_motif_est_une_erreur_pas_une_exception():
    ecoles, ens = construire_jeu_demonstration(3, 6, 20)
    ens[0][C.COL_ENS_ID] = ""
    ens[0][C.COL_ENS_MOTIF] = f"Rapprochement de conjoint {ens[0][C.COL_ENS_V1]}"
    rapport = controler(ecoles, ens, defaut())
    assert rapport["valide"] is False and "ENS_MATRICULE_VIDE" in _codes(rapport)


@pytest.mark.parametrize("valeur", ["inf", "-inf", "Infinity", "1e999", float("inf"), float("-inf")])
def test_une_valeur_infinie_n_est_pas_une_quantite(valeur):
    assert nombre(valeur, 7.0) == 7.0
    assert nombre_ou_none(valeur) is None


def test_une_valeur_aberrante_bloque_le_jeu():
    ecoles, ens = construire_jeu_demonstration(3, 6, 20)
    ecoles[0][C.COL_ETAB_SSF] = VALEUR_MAX * 10
    ens[1][C.COL_ENS_ENFANTS] = 10 ** 15
    rapport = controler(ecoles, ens, defaut())
    assert rapport["valide"] is False
    colonnes = {a["colonne"] for a in rapport["erreurs"] if a["code"] == "VALEUR_ABERRANTE"}
    assert colonnes == {C.COL_ETAB_SSF, C.COL_ENS_ENFANTS}


def test_les_valeurs_courantes_ne_sont_pas_aberrantes():
    ecoles, ens = construire_jeu_demonstration(3, 12, 60)
    assert "VALEUR_ABERRANTE" not in _codes(controler(ecoles, ens, defaut()))
