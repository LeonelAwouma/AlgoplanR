"""Génère le jeu de test « nominations » d'AlgoPlanR (fichiers à importer dans l'application).

    cd backend
    .venv/Scripts/python.exe jeux_de_test/nominations/generer.py

Le jeu part du jeu de démonstration (graine 2026, 40 écoles, 300 enseignants), auquel on ajoute des déficits ciblés
pour obtenir des postes ouverts de tous types (zone verte, zone rouge, francophone, anglophone), puis les fichiers
qui alimentent le cycle des nominations : lauréats, faits du Prince, personnes d'autres sources, décisions importées.
Les identifiants de postes et de matricules cités par `nominations.xlsx` sont vérifiés par
`tests/test_jeu_nominations.py` : si le moteur change, ce test dit quoi regénérer.
"""
from __future__ import annotations

import sys
from pathlib import Path

DOSSIER = Path(__file__).resolve().parent
sys.path.insert(0, str(DOSSIER.parents[1]))

import pandas as pd  # noqa: E402

from domaine.donnees import colonnes as C  # noqa: E402
from domaine.donnees.demonstration import construire_jeu_demonstration  # noqa: E402

GRAINE, NB_ECOLES, NB_ENSEIGNANTS = 2026, 40, 300

# Écoles sous-dotées : (enseignants en poste, sous-système, zone de sécurité).
DEFICITS = {
    "ECO011": (2, "Francophone", "Verte"),    # Yaoundé 1 : aucun excédent dans le département
    "ECO025": (2, "Anglophone", "Verte"),     # Yaoundé 1 : trois postes anglophones
    "ECO039": (5, "Anglophone", "Verte"),     # Yaoundé 1 : un poste anglophone de plus
    "ECO014": (3, "Francophone", "Verte"),    # Monatele
}


def ecrire_classeur(nom: str, entetes: list, lignes: list) -> None:
    """Classeur Excel : pas d'ambiguïté de séparateur ni d'encodage (un CSV « UTF-8 avec BOM » d'Excel casse la
    première colonne à l'import)."""
    pd.DataFrame(lignes, columns=entetes).to_excel(DOSSIER / nom, index=False)


def construire():
    ecoles, enseignants = construire_jeu_demonstration(GRAINE, NB_ECOLES, NB_ENSEIGNANTS)
    par_id = {e[C.COL_ETAB_ID]: e for e in ecoles}
    for ident, (effectif, sous_systeme, securite) in DEFICITS.items():
        e = par_id[ident]
        e[C.COL_ETAB_EE], e[C.COL_ETAB_SS], e[C.COL_ETAB_SIGMA] = effectif, sous_systeme, securite
    for ens in enseignants:
        if ens[C.COL_ENS_ETAB] in DEFICITS:
            ens[C.COL_ENS_SS] = DEFICITS[ens[C.COL_ENS_ETAB]][1]
    return ecoles, enseignants


# Lauréats du concours : les premiers rangs sont déployés sur les postes vacants, les derniers restent au vivier.
RECRUES = [
    # Francophones : ils prennent d'abord les postes les plus prioritaires (les trois de l'école ECO040, zone rouge).
    {"id_recrue": "LAU-001", "nom": "Mvondo", "prenom": "Estelle", "sous_systeme": "Francophone",
     "region_souhaitee": "Centre", "rang": 1},
    {"id_recrue": "LAU-002", "nom": "Hayatou", "prenom": "Salamatou", "sous_systeme": "Francophone",
     "region_souhaitee": "Nord", "rang": 2},
    {"id_recrue": "LAU-003", "nom": "Bikoko", "prenom": "Daniel", "sous_systeme": "Francophone",
     "region_souhaitee": "Extrême-Nord", "rang": 3},
    # Anglophones : cinq lauréats pour quatre postes, le dernier reste sans poste et entre au vivier.
    {"id_recrue": "LAU-004", "nom": "Ndikum", "prenom": "Grace", "sous_systeme": "Anglophone",
     "region_souhaitee": "Centre", "rang": 4},
    {"id_recrue": "LAU-005", "nom": "Tabi", "prenom": "Emmanuel", "sous_systeme": "Anglophone",
     "region_souhaitee": "Centre", "rang": 5},
    {"id_recrue": "LAU-006", "nom": "Fonyuy", "prenom": "Beatrice", "sous_systeme": "Anglophone",
     "region_souhaitee": "Centre", "rang": 6},
    {"id_recrue": "LAU-007", "nom": "Achu", "prenom": "Samuel", "sous_systeme": "Anglophone",
     "region_souhaitee": "Centre", "rang": 7},
    {"id_recrue": "LAU-008", "nom": "Mbah", "prenom": "Florence", "sous_systeme": "Anglophone",
     "region_souhaitee": "Centre", "rang": 8},
    # Refus attendus : identifiant manquant, doublon dans le fichier.
    {"id_recrue": "", "nom": "Sans", "prenom": "Identifiant", "sous_systeme": "Francophone",
     "region_souhaitee": "Centre", "rang": 9},
    {"id_recrue": "LAU-003", "nom": "Bikoko", "prenom": "Daniel (doublon)", "sous_systeme": "Francophone",
     "region_souhaitee": "Extrême-Nord", "rang": 10},
]

# Faits du Prince : placement imposé d'un enseignant du vivier dans une école.
FAITS_PRINCE = [
    {"id_ens": "MAT00229", "id_etab": "ECO011", "motif": "Rapprochement de conjoint autorisé par le ministre"},
    {"id_ens": "MAT00094", "id_etab": "ECO014", "motif": "Décision ministérielle n°0142"},
    # Refus attendus : matricule inconnu, école inconnue, enseignant déjà dans l'école de destination.
    # (Un enseignant « non mobilisable » — école non excédentaire, ancienneté faible — n'est plus un refus : un fait du
    # Prince peut créer un déficit, c'est une alerte. Voir test_faits_prince_hors_vivier.)
    {"id_ens": "MAT99999", "id_etab": "ECO011", "motif": "Matricule absent du jeu"},
    {"id_ens": "MAT00130", "id_etab": "ECO999", "motif": "École absente du jeu"},
    {"id_ens": "MAT00001", "id_etab": "ECO019", "motif": "Déjà rattaché à l'école de destination"},
]

ENTETES_VIVIER = ["matricule", "nom", "prenom", "sous_systeme", "region", "departement", "commune", "note"]
VIVIER = {
    "reintegration": [
        {"matricule": "REI-0001", "nom": "Owona", "prenom": "Patrice", "sous_systeme": "Francophone",
         "region": "Centre", "departement": "Mfoundi", "commune": "Yaounde 1", "note": 15.5},
        {"matricule": "REI-0002", "nom": "Biyiha", "prenom": "Sandrine", "sous_systeme": "Francophone",
         "region": "Nord", "departement": "Benoue", "commune": "Garoua 1", "note": 13},
        {"matricule": "REI-0003", "nom": "Ayuk", "prenom": "Terence", "sous_systeme": "Anglophone",
         "region": "Centre", "departement": "Mfoundi", "commune": "Yaounde 2", "note": 14},
        {"matricule": "REI-0004", "nom": "Nkoulou", "prenom": "Brice", "sous_systeme": "Francophone",
         "region": "Extrême-Nord", "departement": "Diamare", "commune": "Maroua 1", "note": 11.5},
        # Refus attendus : nom manquant, matricule déjà au vivier.
        {"matricule": "REI-0005", "nom": "", "prenom": "Sans nom", "sous_systeme": "Francophone",
         "region": "Centre", "departement": "", "commune": "", "note": 12},
        {"matricule": "REI-0001", "nom": "Owona", "prenom": "Patrice (doublon)", "sous_systeme": "Francophone",
         "region": "Centre", "departement": "Mfoundi", "commune": "Yaounde 1", "note": 15.5},
    ],
    "disponibilite": [
        {"matricule": "DIS-0001", "nom": "Mballa", "prenom": "Christelle", "sous_systeme": "Francophone",
         "region": "Centre", "departement": "Lekie", "commune": "Obala", "note": 12.5},
        {"matricule": "DIS-0002", "nom": "Kamga", "prenom": "Alain", "sous_systeme": "Francophone",
         "region": "Nord", "departement": "Mayo-Louti", "commune": "Guider", "note": 10},
        {"matricule": "DIS-0003", "nom": "Mouliom", "prenom": "Abdou", "sous_systeme": "Francophone",
         "region": "Extrême-Nord", "departement": "Mayo-Tsanaga", "commune": "Mokolo", "note": 16},
    ],
    "fin_detachement": [
        {"matricule": "DET-0001", "nom": "Essomba", "prenom": "Hortense", "sous_systeme": "Francophone",
         "region": "Centre", "departement": "Mfoundi", "commune": "Yaounde 2", "note": 14.5},
        {"matricule": "DET-0002", "nom": "Tchoumi", "prenom": "Rodrigue", "sous_systeme": "Francophone",
         "region": "Nord", "departement": "Benoue", "commune": "Pitoa", "note": 12},
    ],
    "autre": [
        {"matricule": "", "nom": "Zambo", "prenom": "Léonie", "sous_systeme": "Francophone",
         "region": "Centre", "departement": "Lekie", "commune": "Monatele", "note": 9.5},
        {"matricule": "", "nom": "Abega", "prenom": "Théodore", "sous_systeme": "Anglophone",
         "region": "Centre", "departement": "Mfoundi", "commune": "Yaounde 1", "note": 10.5},
    ],
}

ENTETES_NOMINATIONS = ["matricule", "poste", "identifiant_ecole", "annee", "statut", "reference", "date_effet",
                       "motif"]


def _n(matricule, poste="", ecole="", annee="N+1", statut="VALIDEE", reference="", date_effet="", motif=""):
    return {"matricule": matricule, "poste": poste, "identifiant_ecole": ecole, "annee": annee, "statut": statut,
            "reference": reference, "date_effet": date_effet, "motif": motif}


# Décisions prises hors de l'application. Les 6 premières sont importées, les 9 suivantes sont refusées pour
# des raisons différentes. Les postes et matricules supposent les fichiers ci-dessus, le scénario départemental
# retenu et toutes les sources du vivier cochées (voir LISEZ-MOI.md et tests/test_jeu_nominations.py).
NOMINATIONS = [
    _n("MAT00207", "ECO012_P2", statut="MISE_EN_OEUVRE", reference="ACTE-2027-001", date_effet="2027-09-01",
       motif="Poste vacant en zone verte"),
    _n("MAT00159", "ECO012_P3", statut="VALIDEE", reference="DEC-2027-014", motif="Commission du 12 juin"),
    _n("MAT00273", "ECO008_P2", statut="PROPOSEE", motif="Même région que l'école d'origine"),
    _n("REI-0001", "ECO011_P3", statut="VALIDEE", reference="DEC-2027-015", motif="Réintégration à Yaoundé"),
    _n("DET-0001", ecole="ECO012", statut="VALIDEE", reference="DEC-2027-016",
       motif="Fin de détachement : première école libre"),
    _n("MAT00067", "ECO008_P2", statut="PROPOSEE", motif="Proposition concurrente sur le même poste"),
    # Refus attendus.
    _n("MAT99998", "ECO008_P3", motif="Matricule inconnu"),
    _n("MAT00087", "ECO777_P1", motif="Poste inconnu"),
    _n("MAT00253", "ECO008_P3", statut="REJETEE", motif="Statut non importable"),
    _n("MAT00207", "ECO008_P4", motif="Déjà nommé plus haut"),
    _n("MAT00017", "ECO012_P2", motif="Poste déjà pourvu plus haut"),
    _n("MAT00179", "ECO040_P4", motif="Zone rouge sans volontariat"),
    _n("MAT00068", "ECO008_P3", motif="Anglophone sur un poste francophone"),
    _n("MAT00023", "ECO008_P3", annee="N+9", motif="Année hors plan"),
    _n("", "ECO008_P4", motif="Matricule vide"),
]


def principal() -> None:
    ecoles, enseignants = construire()
    pd.DataFrame(ecoles).to_excel(DOSSIER / "etablissements.xlsx", index=False)
    pd.DataFrame(enseignants).to_excel(DOSSIER / "enseignants.xlsx", index=False)
    ecrire_classeur("recrues.xlsx", ["id_recrue", "nom", "prenom", "sous_systeme", "region_souhaitee", "rang"], RECRUES)
    ecrire_classeur("faits_prince.xlsx", ["id_ens", "id_etab", "motif"], FAITS_PRINCE)
    for source, lignes in VIVIER.items():
        ecrire_classeur(f"vivier_{source}.xlsx", ENTETES_VIVIER, lignes)
    ecrire_classeur("nominations.xlsx", ENTETES_NOMINATIONS, NOMINATIONS)
    print(f"Jeu écrit dans {DOSSIER} : {len(ecoles)} écoles, {len(enseignants)} enseignants.")


if __name__ == "__main__":
    principal()
