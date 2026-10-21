"""Le diagnostic sert, école par école, le taux d'encadrement et les élèves par classe : l'interface ne refait aucun
ratio, et la précision est celle de la fonction commune (`domaine.commun.encadrement`)."""
import pytest

from domaine.commun.encadrement import taux_encadrement

pytestmark = pytest.mark.django_db
B = "/api/v1/"


def test_chaque_ecole_porte_son_taux_d_encadrement_calcule_par_le_serveur(drh):
    jeu = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 30, "nb_enseignants": 220},
                   content_type="application/json").json()["id"]
    ecoles = drh.get(B + f"jeux/{jeu}/diagnostic/", {"taille": 500}).json()["ecoles"]["resultats"]
    assert ecoles
    for e in ecoles:
        if e["effectif_connu"]:
            assert e["rem"] == taux_encadrement(e["Effectif_Eleves_Attendus"], e["Enseignants_Actuels"])
        else:
            assert e["rem"] is None and e["eleves_par_classe"] is None
        classes = e.get("Classes_Ouvertes")
        if e["effectif_connu"] and classes:
            assert e["eleves_par_classe"] == taux_encadrement(e["Effectif_Eleves_Attendus"], classes)
