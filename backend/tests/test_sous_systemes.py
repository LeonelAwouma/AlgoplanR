"""Sous-système des enseignants : déduit de l'école d'attache quand le fichier ne le donne pas."""
import io

import pytest

from domaine.donnees import colonnes as C
from domaine.donnees.sous_systemes import completer_sous_systemes
from tests.outils_acces import B


def _ecoles():
    return [{C.COL_ETAB_ID: "E1", C.COL_ETAB_SS: "Francophone"}, {C.COL_ETAB_ID: "E2", C.COL_ETAB_SS: "Anglophone"},
            {C.COL_ETAB_ID: "E3", C.COL_ETAB_SS: None}]


def test_completer_depuis_l_ecole_d_attache():
    ens = [{C.COL_ENS_ID: "M1", C.COL_ENS_ETAB: "E1", C.COL_ENS_SS: None},
           {C.COL_ENS_ID: "M2", C.COL_ENS_ETAB: "E2", C.COL_ENS_SS: ""},
           {C.COL_ENS_ID: "M3", C.COL_ENS_ETAB: "E2"},                                  # colonne absente
           {C.COL_ENS_ID: "M4", C.COL_ENS_ETAB: "E1", C.COL_ENS_SS: "Anglophone"},      # déjà renseigné
           {C.COL_ENS_ID: "M5", C.COL_ENS_ETAB: None, C.COL_ENS_SS: None},              # sans école
           {C.COL_ENS_ID: "M6", C.COL_ENS_ETAB: "E3", C.COL_ENS_SS: None},              # école sans sous-système
           {C.COL_ENS_ID: "M7", C.COL_ENS_ETAB: "X99", C.COL_ENS_SS: None}]             # école inconnue
    assert completer_sous_systemes(_ecoles(), ens) == 3
    assert [l.get(C.COL_ENS_SS) for l in ens] == ["Francophone", "Anglophone", "Anglophone", "Anglophone", None,
                                                  None, None]


@pytest.mark.django_db
def test_jeu_cree_avec_sous_systeme_des_enseignants(centre):
    from contextes.donnees.models import Enseignant

    def csv(texte, nom):
        f = io.BytesIO(texte.encode("utf-8"))
        f.name = nom
        return f

    etab = ("Identifiant_Ecole,Sous_Systeme,Region,Effectif_Eleves_Attendus\n"
            "E1,Francophone,Centre,100\nE2,Anglophone,Centre,80\n")
    ens = "Matricule_Enseignant,Ecole_Attache_Actuelle,Age\nM1,E1,30\nM2,E2,40\n"
    e = centre.post(B + "fichiers/", {"type": "etablissements", "fichier": csv(etab, "e.csv")}).json()
    n = centre.post(B + "fichiers/", {"type": "enseignants", "fichier": csv(ens, "n.csv")}).json()
    r = centre.post(B + "jeux/", {"fichier_etablissements": e["id"], "fichier_enseignants": n["id"]},
                    content_type="application/json")
    assert r.status_code == 201, r.content
    par_matricule = dict(Enseignant.objects.filter(jeu_id=r.json()["id"]).values_list("matricule", "sous_systeme"))
    assert par_matricule == {"M1": "Francophone", "M2": "Anglophone"}
